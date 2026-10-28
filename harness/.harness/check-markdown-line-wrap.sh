#!/bin/sh
# lint-staged 훅: Markdown 본문의 문단 중간 임의 줄바꿈을 검사

MD_LINE_WRAP_CHECK='
function is_blank(s,   t) { t = s; gsub(/^[ \t]+|[ \t]+$/, "", t); return (t == "") }
function is_block_start(s) {
  return (s ~ /^[ \t]*([-*+][ \t]|[0-9]+(-[0-9A-Za-z]+)*\.[ \t]|[a-zA-Z]\.[ \t]|#{1,6}[ \t]|\||>|(-{3,}|\*{3,}|_{3,})[ \t]*$)/)
}
BEGIN { in_fm = 0; in_fence = 0; prev_kind = 0; ln = 0 }
{
  ln++
  line = $0
  if (ln == 1 && line ~ /^---[ \t]*$/) { in_fm = 1; prev_kind = 0; next }
  if (in_fm) { if (line ~ /^---[ \t]*$/) { in_fm = 0; prev_kind = 0 }; next }
  if (line ~ /^[ \t]*(```|~~~)/) { in_fence = !in_fence; prev_kind = 0; next }
  if (in_fence) { next }
  if (is_blank(line)) { prev_kind = 0; next }
  if (is_block_start(line)) { prev_kind = 1; next }
  is_indented = (line ~ /^[ \t]+/)
  if (prev_kind == 2 || (prev_kind == 1 && is_indented)) { print ln ":" line; exit }
  if (line ~ /[.!?)][ \t]*$/) { prev_kind = 0 } else { prev_kind = 2 }
}
'

violations=""
for file in "$@"; do
  # lint-staged의 다른 작업과 병렬 실행돼도 항상 커밋할 index 내용을 검사
  hit=$(git show ":$file" 2>/dev/null | awk "$MD_LINE_WRAP_CHECK" || true)
  if [ -n "$hit" ]; then
    violations="${violations}${file}:${hit}\n"
  fi
done

if [ -n "$violations" ]; then
  echo "✖ 차단: 다음 위치가 문단 중간 임의 줄바꿈으로 보입니다(bullet이든 평문 문단이든 한 항목은 한 줄로 작성):" >&2
  printf '%b' "$violations" >&2
  echo "→ 뷰어가 알아서 자동 줄바꿈합니다. 중간에 줄을 나누지 말고 이어서 한 줄로 쓰세요." >&2
  exit 1
fi

exit 0
