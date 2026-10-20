#!/bin/sh
# UserPromptSubmit·PostToolUse·Stop 훅: 가능 여부 질문에는 최종 답변을 가능합니다 또는 불가능합니다로 시작하게 함
# UserPromptSubmit(안내): 가능 여부 키워드가 있으면 조건부 리마인더를 출력하고, 의문형까지 갖춘 질문이면 세션별 표시 파일을 남김
# PostToolUse(안내): 표시 파일이 있는 턴의 도구 결과마다 최종 답변 첫머리 규칙을 다시 붙임
# 턴 끝 직전 진행 안내 요청에 답하느라 판정이 밀려난 사고가 있어, 같은 자리에 반대 방향 안내를 두려는 처리
# Stop(차단): 표시 파일이 있는 세션의 마지막 응답이 가능합니다 또는 불가능합니다로 시작하지 않으면 턴 종료를 막고 다시 답하게 함
# 리마인더만으로는 판정이 둘째 문장으로 밀려도 막지 못해 Stop 검사를 추가함
# Codex 문서상 transcript 형식이 안정 인터페이스가 아니라서 transcript 대신 UserPromptSubmit의 prompt로 질문을 판정함
# 질문 판정은 키워드와 의문형 어미 패턴 기반이라 패턴 밖 표현은 놓칠 수 있음
# Claude와 Codex가 같은 본문을 씀

input=$(cat)

printf '%s' "$input" | MARK_DIR="${TMPDIR:-/tmp}/feasibility-verdict" python3 -c '
import json, os, re, sys

try:
    data = json.load(sys.stdin)
except Exception:
    # 입력을 해석할 수 없으면 판정 근거가 없어 통과
    sys.exit(0)

session = re.sub(r"[^\w.-]", "_", str(data.get("session_id") or "default"))
mark = os.path.join(os.environ["MARK_DIR"], session)

def clear_mark():
    try:
        os.remove(mark)
    except OSError:
        # 표시가 없으면 지울 것도 없음
        pass

event = data.get("hook_event_name")

if event == "PostToolUse":
    if os.path.exists(mark):
        print(json.dumps({"hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "additionalContext": "가능 여부 질문 처리 중: 다음 메시지가 최종 답변이면 진행 안내 없이 가능합니다. 또는 불가능합니다.로 시작할 것.",
        }}, ensure_ascii=False))
    sys.exit(0)

if event != "Stop":
    # 백그라운드 subagent 보고도 UserPromptSubmit으로 들어와 그 본문이 질문으로 판정되던 오탐을 막으려고 제외함
    # 붙여넣은 내용은 사용자가 쓴 문장이 아니라 인용 자료라서 함께 제외함
    prompt = re.sub(r"<agent-message\b.*?(</agent-message>|\Z)", "", data.get("prompt") or "", flags=re.S)
    prompt = re.sub(r"<pasted_content id=\"([^\"]*)\">.*?(</pasted_content id=\"\1\">|\Z)", "", prompt, flags=re.S)
    if not prompt.strip() or re.fullmatch(r"\s*Another Claude session sent a message[^\n]*\s*", prompt):
        # 사용자 문장이 없는 보고 전달이면 진행 중인 질문의 표시를 지우지 않고 그대로 둠
        sys.exit(0)
    keyword = re.search(r"가능|할 수 있|될 수 있|될까|되나|되냐|possible|feasible", prompt, re.I)
    # 키워드만 있는 작업 지시("가능하다로 대답해")는 질문이 아니므로 의문형까지 있어야 표시함
    question = re.search(
        r"\?|가능(성|\s?여부)[^.?!\n]*(검토|확인|판단|보고|알려)|가능(한지|할까|해|합니까|한가|하냐|하니|함)|(할|될) 수 있(는지|어|나|을까|니|냐|습니까)|될까|되나|되냐|되는지",
        prompt,
    )
    if keyword:
        print("가능 여부 키워드 감지: 사용자가 가능한지 묻는 질문이면 최종 답변을 가능합니다. 또는 불가능합니다.로 시작할 것. 일부만 가능하다는 분할 판정, 진행 안내 문장, 얼버무림, 비교표로 시작 금지. 단서와 범위는 둘째 문장부터. 키워드를 언급만 한 메시지(작업 지시 등)면 해당 없음.")
    # 질문이 아닌 메시지는 표시를 지우지 않음
    # 작업 도중 들어온 다른 메시지가 표시를 지워 턴 끝 검사가 돌지 않던 문제를 막으려는 처리
    # 표시는 Stop에서 판정이 끝난 뒤(통과 또는 한 번 막은 뒤의 재응답)에만 지움
    if keyword and question:
        os.makedirs(os.environ["MARK_DIR"], exist_ok=True)
        open(mark, "w").close()
    sys.exit(0)

if not os.path.exists(mark):
    sys.exit(0)

answer = (data.get("last_assistant_message") or "").strip()
# 이미 한 번 막힌 뒤의 재응답이면 무한 반복을 막으려고 통과
if data.get("stop_hook_active") or not answer:
    clear_mark()
    sys.exit(0)

# 제목·강조·인용 기호를 걷어낸 뒤 답변 첫머리가 판정인지 봄
# 사용자가 일부만 가능하다는 분할 판정을 금지하고 가능하다/불가능하다로만 답하라고 지시해 두 판정만 허용함
body = re.sub(r"^[\s#*>-]+", "", answer)
if re.match(r"(불)?가능합니다", body):
    clear_mark()
    sys.exit(0)
problem = "답변이 가능합니다. 또는 불가능합니다.로 시작하지 않습니다."

print(json.dumps({
    "decision": "block",
    "reason": "사용자가 가능 여부를 물었습니다. " + problem
    + " 가능합니다. 또는 불가능합니다. 중 하나로 시작해 다시 답하세요. 일부만 가능하다는 분할 판정과 진행 안내로 시작하지 말고, 단서와 범위는 둘째 문장부터 쓰세요.",
}, ensure_ascii=False))
'

exit 0
