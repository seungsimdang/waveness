#!/bin/sh
# Stop 훅: 이번 턴(가장 최근 실제 사용자 입력 이후)에 artifacts/feature-team/04-review.md를
# Read/Edit/Write했다면, 그 파일의 "확인 못한 부분"/"사람 승인 필요" 섹션 불릿의 리드텀
# (**볼드**/`코드` 로 감싼 첫 구절)이 이번 턴 assistant 텍스트 어딘가에 등장하는지 확인한다.
# "치명적 발견"에만 집중해 이 두 섹션 항목을 사용자에게 통째로 누락 보고한 사고 재발 방지용.
#
# 한계: 리드텀 문자열이 텍스트에 등장했는지만 보는 순수 패턴 매칭이다 - 실제로 그 내용을
# 사람이 이해할 수 있게 전달했는지(문장 품질)는 판단하지 못한다. 지나가듯 언급만 해도 통과된다.
# 반대로 같은 개념을 완전히 다른 표현으로 풀어썼다면 오탐(불필요한 차단)이 날 수 있다.

input=$(cat)
transcript_path=$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null)

[ -z "$transcript_path" ] && exit 0
[ -f "$transcript_path" ] || exit 0

review_file="${CLAUDE_PROJECT_DIR:-.}/artifacts/feature-team/04-review.md"
[ -f "$review_file" ] || exit 0

last_idx=$(jq -rs '
	[ to_entries[]
		| select(.value.type == "user")
		| . + { ct: ( .value.message.content | if type == "array" then map(.type) else [] end ) }
		| select(.ct | index("tool_result") | not)
	] | last | .key // -1
' "$transcript_path" 2>/dev/null)

[ -z "$last_idx" ] && last_idx=-1

# 이번 턴에 04-review.md를 Read/Edit/Write로 건드렸는지 확인
touched_review=$(jq -rs --argjson idx "$last_idx" '
	.[($idx + 1):]
	| [ .[] | select(.type == "assistant") | .message.content[]? | select(.type == "tool_use") ]
	| any(((.input.file_path // "") | test("artifacts/feature-team/04-review\\.md")))
' "$transcript_path" 2>/dev/null)

[ "$touched_review" = "true" ] || exit 0

# 이번 턴 assistant 텍스트 전체(여러 블록 이어붙임)
turn_text=$(jq -rs --argjson idx "$last_idx" '
	.[($idx + 1):]
	| map(select(.type == "assistant"))
	| map(.message.content[]? | select(.type == "text") | .text)
	| join("\n")
' "$transcript_path" 2>/dev/null)

[ -z "$turn_text" ] && exit 0

extract_terms() {
	heading=$1
	sed -n "/^## $heading/,/^## /p" "$review_file" 2>/dev/null \
		| grep -oE '^- (\*\*[^*]+\*\*|`[^`]+`)' \
		| sed -E 's/^- //; s/^\*\*(.+)\*\*$/\1/; s/^`(.+)`$/\1/; s/\(.*\)$//' \
		| sed -E 's/`//g; s/[[:space:]]+$//'
}

missing=''
for heading in '확인 못한 부분' '사람 승인 필요'; do
	terms=$(extract_terms "$heading")
	[ -z "$terms" ] && continue

	while IFS= read -r term; do
		[ -z "$term" ] && continue
		case "$turn_text" in
			*"$term"*) ;;
			*) missing="$missing\n- [$heading] $term" ;;
		esac
	done <<EOF
$terms
EOF
done

if [ -n "$missing" ]; then
	reason=$(printf '04-review.md를 읽었지만 다음 항목이 이번 턴 응답 텍스트에서 보이지 않음(문구 그대로일 필요는 없지만 언급이 전혀 없으면 안 됨) - 치명적 발견뿐 아니라 이 항목들도 사용자에게 직접 전달할 것:%b' "$missing")
	jq -n --arg reason "$reason" '{decision: "block", reason: $reason}'
	exit 0
fi

exit 0
