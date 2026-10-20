#!/bin/sh
# Stop 훅: 이번 턴(가장 최근 실제 사용자 입력 이후) 전체 assistant 텍스트에서 "PRD"를 언급하는 줄마다 근거 출처 표기 강제
# - 통과 조건(줄 단위): `PRD.md:<줄번호>` 인용, 또는 "PRD 미정" 표기 중 하나 포함
# - 강제 범위는 형식까지만 - 인용한 줄이 주장을 실제로 뒷받침하는지(의미 일치)는 판정 불가
# - 차단 시 피드백이 문자열 content의 user 엔트리로 기록되어 다음 검사 기준점이 되므로, 재작성 후 이전 위반 줄로 재차단되지 않음

input=$(cat)
transcript_path=$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null)

[ -z "$transcript_path" ] && exit 0
[ -f "$transcript_path" ] || exit 0

last_idx=$(jq -rs '
	[ to_entries[]
		| select(.value.type == "user")
		| . + { ct: ( .value.message.content | if type == "array" then map(.type) else [] end ) }
		| select(.ct | index("tool_result") | not)
	] | last | .key // -1
' "$transcript_path" 2>/dev/null)

[ -z "$last_idx" ] && last_idx=-1

last_text=$(jq -rs --argjson idx "$last_idx" '
	.[($idx + 1):]
	| map(select(.type == "assistant"))
	| map(.message.content[]? | select(.type == "text") | .text)
	| join("\n")
' "$transcript_path" 2>/dev/null)

[ -z "$last_text" ] && exit 0

# 줄번호 없는 파일 경로(`src/docs/PRD.md` 등)로만 언급한 줄은 내용 주장이 아니라 제외. 경로로 내용을 주장하는 줄도 함께 빠지는 한계가 있음
violations=$(printf '%s\n' "$last_text" \
	| grep 'PRD' \
	| grep -Ev 'PRD\.md:[0-9]|PRD 미정' \
	| awk '{ t = $0; gsub(/[^ \t`|(]*PRD\.md/, "", t); if (t ~ /PRD/) print }' \
	| head -5)

[ -z "$violations" ] && exit 0

reason="PRD를 언급하는 줄에 근거 출처 표기 누락:
$violations

각 줄에 다음 중 하나를 포함해 다시 작성할 것.
- 이번 변경분/기존 PRD 원문 근거: \`docs/PRD.md:<줄번호>\` 인용 (이번 변경분인지 기존 정책인지도 구분)
- PRD에 해당 내용이 없는 경우: \"PRD 미정\" 명시 후 사용자 결정 항목으로 분리 (내 판단으로 채워 넣지 말 것)"

jq -n --arg reason "$reason" '{decision: "block", reason: $reason}'
exit 0
