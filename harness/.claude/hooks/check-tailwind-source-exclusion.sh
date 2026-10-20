#!/bin/sh
# PostToolUse 훅: artifacts/feature-team/00-figma-context.md가 Write되면,
# 그 안의 Figma 원문 코드가 Tailwind v4 자동 스캔에 걸려 빌드를 깨뜨리지 않도록
# src/app/globals.css에 @source not 제외 처리가 있는지 grep으로 점검한다.
# 없으면 리마인더만 출력 - 이미 파일이 써진 뒤라 차단은 불가능하고 넛지만 가능하다.

input=$(cat)
file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

case "$file_path" in
  artifacts/feature-team/00-figma-context.md|*/artifacts/feature-team/00-figma-context.md)
    css_file="$CLAUDE_PROJECT_DIR/src/app/globals.css"
    if [ -f "$css_file" ] && grep -q '@source not.*artifacts' "$css_file" 2>/dev/null; then
      exit 0
    fi
    echo "00-figma-context.md 저장 확인: src/app/globals.css에 '@source not \"../../artifacts\";'가 없으면 추가할 것 (Tailwind v4가 artifacts/ 원문 코드를 임의값 클래스로 오파싱해 빌드가 깨질 수 있음, improvement-log.md 참고)."
    ;;
esac

exit 0
