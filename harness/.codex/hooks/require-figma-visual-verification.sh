#!/bin/sh
# Figma UI 수정 세션의 검증 도구 호출 상태 기록 및 종료 차단
# 트랜스크립트 문자열이 아니라 PostToolUse 입력의 session_id와 tool_input만 사용

input=$(cat)
action=${1:-}
runtime=${2:-codex}
session_id=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null)

case "$session_id" in
  ''|*[!A-Za-z0-9_-]*) exit 0 ;;
esac

state_dir=${FIGMA_VERIFICATION_STATE_DIR:-/private/tmp}
[ -d "$state_dir" ] || exit 0
state_file="$state_dir/figma-visual-verification-$session_id"

has_flag() {
  grep -qx "$1" "$state_file" 2>/dev/null
}

record_flag() {
  has_flag "$1" || printf '%s\n' "$1" >> "$state_file"
}

record() {
  flag=$1
  tool_input=$(printf '%s' "$input" | jq -c '.tool_input // {}' 2>/dev/null)

  case "$flag" in
    figma-context|figma-screenshot|browser-screenshot)
      record_flag "$flag"
      ;;
    source-edit)
      file_path=$(printf '%s' "$tool_input" | jq -r '.file_path // empty' 2>/dev/null)
      printf '%s' "$file_path" | grep -Eq 'src/[^"[:space:]]+\.(ts|tsx|css)$' && record_flag "$flag"
      ;;
    browser-measure)
      printf '%s' "$tool_input" | grep -q 'getBoundingClientRect' &&
        printf '%s' "$tool_input" | grep -q 'getComputedStyle' &&
        record_flag "$flag"
      ;;
    browser-measure-chrome)
      printf '%s' "$tool_input" | grep -Eq 'backgroundColor|[^a-zA-Z]border[^a-zA-Z-]|boxShadow' &&
        record_flag "$flag"
      ;;
  esac
}

block() {
  missing=$1
  reason="Figma 컨텍스트를 조회한 세션에서 UI 소스를 수정했지만 시각 검증이 누락됨: $missing. Figma 캡처, 브라우저 캡처, getBoundingClientRect/getComputedStyle 실측을 완료한 뒤 다시 종료할 것."

  if [ "$runtime" = 'claude' ]; then
    jq -n --arg reason "$reason" '{decision: "block", reason: $reason}'
  else
    jq -n --arg reason "$reason" '{continue: false, stopReason: $reason}'
  fi
}

case "$action" in
  record)
    # record()는 패턴 미일치 시 grep 실패 종료 코드를 그대로 반환함 - 이건 정상 분기(이번 호출엔
    # 해당 패턴이 없었을 뿐)이므로 스크립트 자체 실패로 오인되지 않게 항상 0으로 종료
    record "$3"
    exit 0
    ;;
  stop)
    if ! has_flag 'figma-context' || ! has_flag 'source-edit'; then
      rm -f "$state_file"
      exit 0
    fi

    missing=''
    has_flag 'figma-screenshot' || missing="$missing Figma 스크린샷"
    has_flag 'browser-screenshot' || missing="$missing 브라우저 스크린샷"
    has_flag 'browser-measure' || missing="$missing 브라우저 getBoundingClientRect/getComputedStyle 실측"
    has_flag 'browser-measure-chrome' || missing="$missing 컨테이너 배경/테두리(backgroundColor/border/boxShadow) 실측"

    if [ -n "$missing" ]; then
      block "$missing"
      exit 0
    fi

    rm -f "$state_file"
    ;;
esac
