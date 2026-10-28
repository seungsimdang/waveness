#!/bin/sh
# lint-staged 훅: 소스 및 테스트 코드에 em dash(—)가 있으면 커밋을 차단
# 작성 시점 검사는 .claude/hooks/block-em-dash-in-source.sh(PreToolUse)가 담당

hits=""
for file in "$@"; do
  # lint-staged의 다른 작업(예: Biome 포매팅)과 병렬 실행돼도 항상 커밋할 index 내용을 검사
  matches=$(git show ":$file" 2>/dev/null | grep -nF '—' || true)
  if [ -n "$matches" ]; then
    hits="${hits}${file}\n${matches}\n"
  fi
done

if [ -n "$hits" ]; then
  echo "✖ 차단: 다음 위치에 em dash(—)가 있습니다:"
  printf '%b' "$hits"
  echo "→ 하이픈(-)만 쓰세요."
  exit 1
fi

exit 0
