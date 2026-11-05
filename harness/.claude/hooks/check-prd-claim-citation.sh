#!/bin/sh
# Stop 훅: 이번 턴(가장 최근 실제 사용자 입력 이후) 전체 assistant 텍스트에서 "PRD"를 언급하는 줄마다 근거 출처 표기 강제
# - 통과 조건(줄 단위): `PRD.md:<줄번호>` 인용(파일명 대소문자 무관, 예: docs/prd.md:17), 또는 "PRD 미정" 표기 중 하나 포함
# - 코드 펜스 안의 줄(커밋 메시지 미리보기 등)과 약어가 백틱·큰따옴표 인용 안에만 있는 줄은 내용 주장이 아닌 인용이라 제외
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
	| awk '/^[ \t]*```/ { fence = !fence; next } !fence' \
	| grep 'PRD' \
	| grep -Eiv 'prd\.md:[0-9]|PRD 미정' \
	| awk '{ t = $0; gsub(/`[^`]*`/, "", t); gsub(/"[^"]*"/, "", t); gsub(/[^ \t`|(]*[Pp][Rr][Dd]\.md/, "", t); if (t ~ /PRD/) print }' \
	| head -5)

[ -z "$violations" ] && exit 0

# 정규식은 "PRD" 단어만 보므로 작업 예고·차단 사례 설명처럼 PRD 내용을 주장하지 않는 줄도 잡음. 걸린 줄만 LLM으로 다시 판정해 주장인 줄만 남김
# 판정 호출은 --safe-mode로 hooks를 끄고 환경변수로 재귀를 막으며, 호출·해석 실패는 정규식 결과를 그대로 씀
if [ -z "${HARNESS_STOP_JUDGE:-}" ]; then
	judged=$(printf '%s' "$violations" | python3 -c '
import json, os, re, subprocess, sys
lines = sys.stdin.read().splitlines()
prompt = "아래 각 줄이 기획서(PRD) 원문에 적힌 내용·정책·수치를 사실로 주장하거나 PRD에 그런 내용이 없다고 주장하는 줄인지 판정한다. 앞으로 할 작업 예고, 항목 이름으로만 PRD를 언급한 줄, 과거 차단·응답 경위 설명, 다시 쓴다는 안내는 주장이 아니다. 확신이 없으면 주장으로 본다. 주장인 줄의 번호만 JSON 한 줄로 출력: {\"claims\": [1, 3]}\n\n" + "\n".join(f"{i + 1}. {line}" for i, line in enumerate(lines))
try:
    result = subprocess.run([os.environ.get("STOP_JUDGE_BIN", "claude"), "-p", "--safe-mode", "--model", "haiku", "--tools", "", "--no-session-persistence"], input=prompt, capture_output=True, text=True, timeout=60, env={**os.environ, "HARNESS_STOP_JUDGE": "1"})
    claims = json.loads(re.search(r"\{.*\}", result.stdout, re.S).group(0))["claims"]
    print("\n".join(lines[i - 1] for i in claims if isinstance(i, int) and 0 < i <= len(lines)))
except Exception:
    print("\n".join(lines))
')
	violations=$judged
	[ -z "$violations" ] && exit 0
fi

reason="PRD를 언급하는 줄에 근거 출처 표기 누락:
$violations

각 줄에 다음 중 하나를 포함해 다시 작성할 것.
- 이번 변경분/기존 PRD 원문 근거: \`<기획서 파일 경로>:<줄번호>\` 인용(경로는 docs/agent-rules/project.md의 기획·명세 문서 표 기준) (이번 변경분인지 기존 정책인지도 구분)
- PRD에 해당 내용이 없는 경우: \"PRD 미정\" 명시 후 사용자 결정 항목으로 분리 (내 판단으로 채워 넣지 말 것)"

jq -n --arg reason "$reason" '{decision: "block", reason: $reason}'
exit 0
