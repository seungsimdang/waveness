#!/bin/sh
# PreToolUse(Edit·Write·NotebookEdit·Agent·SendMessage·AskUserQuestion, Codex request_user_input_async, Antigravity ask_question) 훅: 마지막 사용자 메시지 이후 AskUserQuestion 답변에 선택지 밖 직접 입력 질문이 있으면 같은 응답이 끝날 때까지 수정·위임·재질문 차단
# 답변 직후 질문 창이 뜨면 답변 텍스트가 가려지므로 텍스트로 답하고 응답 종료를 유도
# Read·Grep·Bash는 답변 조사용으로 허용
# 질문 판정: 물음표, 의문형 어미(~까/나요/가요/니/냐/는지 등), 의문사(왜/뭐/무슨/어떻게 등)
# 지시형 직접 입력("~하도록 해")은 그대로 진행
# ponytail: 키워드 판정이라 '어느 쪽이든 해' 같은 지시도 질문으로 잡힘(차단 쪽 오탐)
# 놓친 질문이 질문 창에 가려지는 것보다 안전
# subagent 호출은 사용자 답변과 무관한 작업이라 제외
# Antigravity(HARNESS_RUNTIME=antigravity)는 ask_question 다음 GENERIC 항목의 A{n}: 답변으로 판정
# Codex(.codex 사본)는 request_user_input_async 질문과 send_user_message_question_reply 답변으로 판정
# Claude와 Codex가 같은 본문을 씀
# 트랜스크립트 형식이 바뀌거나 읽을 수 없으면 차단하지 않음
# stop 인자 모드(Stop 훅): 같은 판정으로 차단이 풀려 있는데 마지막 응답이 "다음 메시지 후 질문 창으로 묻겠다"처럼 질문을 미루면 1회 차단
# stop 인자 모드에서도 이번 턴 사용자 메시지가 질문·답변 요구면 미루기 허용

mode=${1:-pretool}
input=$(cat)
# Antigravity 어댑터는 인자 없이 실행하므로 이벤트 이름으로 Stop 모드 판별
[ "$(printf '%s' "$input" | jq -r '.hook_event_name // empty' 2>/dev/null)" = "Stop" ] && mode=stop
[ -z "$(printf '%s' "$input" | jq -r '.agent_id // empty' 2>/dev/null)" ] || exit 0
transcript=$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null)
[ -n "$transcript" ] && [ -r "$transcript" ] || exit 0

# jq -R은 4095바이트 넘는 줄에서 한글 등 멀티바이트 문자가 읽기 경계에 걸리면 깨뜨려 선택지 라벨 비교가 어긋나므로 JSON으로 직접 읽음
# 다른 세션·subagent 메시지(origin.kind == "peer")는 isMeta로 기록되지만 새 턴을 시작하므로 사용자 메시지처럼 초기화
question_re='[?？]|(까요?|나요|가요|니|냐|는지|은지|인지|던가|건가|인가)[[:space:].!~]*$|왜|뭐|뭔|무슨|무엇|어떻게|어디|언제|누가|누구|어느|몇'
if [ "${HARNESS_RUNTIME:-}" = antigravity ]; then
  # Antigravity transcript: USER_INPUT에서 초기화, ask_question 다음 GENERIC 항목의 "A{n}: 답"을 선택지와 비교
  free_text=$(QUESTION_RE="$question_re" python3 -c '
import json, os, re, sys

pattern = re.compile(os.environ["QUESTION_RE"])
free = False
pending = None
try:
    with open(sys.argv[1], encoding="utf-8") as lines:
        for line in lines:
            try:
                entry = json.loads(line)
            except Exception:
                continue
            kind = entry.get("type")
            if kind == "USER_INPUT":
                free, pending = False, None
            elif kind == "PLANNER_RESPONSE":
                calls = [c for c in entry.get("tool_calls") or [] if isinstance(c, dict) and c.get("name") == "ask_question"]
                if calls:
                    pending = (calls[-1].get("args") or {}).get("questions") or []
                    if isinstance(pending, str):
                        pending = json.loads(pending)
            elif kind == "GENERIC" and pending is not None:
                for number, answer in re.findall(r"^A(\d+): (.*)$", str(entry.get("content") or ""), re.M):
                    index = int(number) - 1
                    question = pending[index] if index < len(pending) else {}
                    options = [str(o) for o in question.get("options") or []]
                    parts = answer.split(", ") if question.get("is_multi_select") else [answer]
                    if not set(parts) <= set(options) and pattern.search(re.sub(r"https?://\S+", "", answer)):
                        free = True
                pending = None
except Exception:
    free = False
print("true" if free else "false")
' "$transcript" 2>/dev/null)
elif case "$0" in *.codex/*) true ;; *) false ;; esac; then
  # Codex JSONL: 일반 사용자 메시지에서 초기화, request_user_input_async 질문의 선택지와 send_user_message_question_reply 답을 비교
  free_text=$(QUESTION_RE="$question_re" python3 -c '
import json, os, re, sys

pattern = re.compile(os.environ["QUESTION_RE"])
free = False
calls = {}
try:
    with open(sys.argv[1], encoding="utf-8") as lines:
        for line in lines:
            try:
                payload = json.loads(line).get("payload") or {}
            except Exception:
                continue
            if payload.get("type") == "function_call" and payload.get("name") == "request_user_input_async":
                try:
                    calls[payload.get("call_id")] = json.loads(payload.get("arguments") or "{}").get("questions") or []
                except Exception:
                    calls[payload.get("call_id")] = []
            elif payload.get("type") == "message" and payload.get("role") == "user":
                text = "\n".join(c.get("text", "") for c in payload.get("content") or [] if isinstance(c, dict))
                if text.lstrip().startswith(("<hook_prompt", "<codex_internal_context")):
                    continue
                marker = text.find("<send_user_message_question_reply>")
                if marker < 0:
                    free = False
                    continue
                start = text.find("[", marker)
                try:
                    replies = json.JSONDecoder().raw_decode(text[start:])[0] if start >= 0 else []
                except Exception:
                    replies = []
                for reply in replies:
                    answer = str(reply.get("answer") or "")
                    try:
                        _, call_id, index = json.loads(reply.get("questionItemId") or "[]")
                        options = [str(o) for o in (calls.get(call_id) or [])[index].get("options") or []]
                    except Exception:
                        options = []
                    if answer not in options and pattern.search(re.sub(r"https?://\S+", "", answer)):
                        free = True
except Exception:
    free = False
print("true" if free else "false")
' "$transcript" 2>/dev/null)
else
free_text=$(jq -n --arg re "$question_re" '
  def selected($labels):
    . as $answer | any($labels[];
      . as $label | ($label == $answer) or
      ($label != "" and ($answer | startswith($label + ", ")) and
        ($answer[($label | length) + 2:] | selected($labels)))
    );
  reduce (inputs | select(.type == "user" and ((.isMeta | not) or .origin.kind? == "peer"))) as $e (false;
    if ($e.message.content | type) == "string"
      or ([$e.message.content[]? | select(.type == "text")] | length > 0)
    then false
    elif ($e.toolUseResult | type) == "object" and ($e.toolUseResult.answers | type) == "object"
    then . or ([
      $e.toolUseResult.questions[]? as $q
      | ($e.toolUseResult.answers[$q.question] // "") as $a
      | select($a != "")
      | [$q.options[]?.label] as $labels
      | select((if $q.multiSelect then ($a | selected($labels)) else any($labels[]; . == $a) end) | not)
      | select($a | gsub("https?://[^[:space:]]+"; "") | test($re))
    ] | length > 0)
    else . end)
' "$transcript" 2>/dev/null)
fi

if [ "$mode" = "stop" ]; then
  [ "$free_text" = "false" ] || exit 0
  printf '%s' "$input" | python3 -c '
import json, re, sys

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)

if data.get("stop_hook_active") or data.get("agent_id"):
    sys.exit(0)

# 이번 턴 사용자 메시지가 질문이나 답변 요구면 답한 턴을 텍스트로 끝내고 질문 창은 다음 턴으로 미루는 것이 맞아 차단하지 않음
# 같은 응답에서 질문 창을 띄우면 답 텍스트가 가려짐
ASK = re.compile(
    r"[?？]|(까요?|나요|가요|니|냐|는지|은지|인지|던가|임|함)[\s.!~]*$|왜|뭐|뭔|무슨|무엇|어떻게|어디|언제|누가|누구|어느|몇"
    r"|(답변|대답|답|설명)\s*(해|하라|해\s*줘|해\s*봐|부터)|알려\s*줘",
    re.M,
)
last_prompt = ""
try:
    with open(data.get("transcript_path") or "", encoding="utf-8") as lines:
        for line in lines:
            try:
                entry = json.loads(line)
            except Exception:
                continue
            payload = entry.get("payload") or {}
            if payload.get("type") == "message" and payload.get("role") == "user":
                text = "\n".join(c.get("text", "") for c in payload.get("content") or [] if isinstance(c, dict))
                if text.strip() and not text.lstrip().startswith(("<hook_prompt", "<codex_internal_context")):
                    last_prompt = text
                continue
            if entry.get("type") == "USER_INPUT" and isinstance(entry.get("content"), str):
                last_prompt = entry["content"]
                continue
            if entry.get("type") != "user" or entry.get("isMeta"):
                continue
            content = (entry.get("message") or {}).get("content")
            if isinstance(content, list):
                if any(isinstance(c, dict) and c.get("type") == "tool_result" for c in content):
                    continue
                content = "\n".join(c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text")
            if isinstance(content, str) and content.strip():
                last_prompt = content
except Exception:
    pass
last_prompt = re.sub(r"<(pasted_content|agent-message|task-notification)\b.*?(</\1[^>]*>|\Z)", "", last_prompt, flags=re.S)
if ASK.search(last_prompt):
    sys.exit(0)

# 코드 블록, 인라인 코드, 인용문은 사용자 문장 인용일 수 있어 제외
text = re.sub(r"```.*?```", "", data.get("last_assistant_message") or "", flags=re.S)
text = re.sub(r"`[^`\n]*`", "", text)
text = "\n".join(l for l in text.splitlines() if not l.lstrip().startswith(">"))

if re.search(r"(다음|이후).{0,30}(메시지|메세지|턴).{0,40}(묻|여쭙|여쭤|질문)(?!\s*(?:없이|하지 않))", text):
    reason = ("재질문 차단이 풀려 있음(마지막 사용자·팀원 메시지 이후 직접 입력 답변 없음). "
              "질문을 다음 메시지로 미루지 말고 이번 응답에서 AskUserQuestion으로 물을 것.")
    print(json.dumps({"decision": "block", "reason": reason}, ensure_ascii=False))
'
  exit 0
fi

[ "$free_text" = "true" ] || exit 0

reason="직전 AskUserQuestion 답변에 사용자가 직접 입력한 질문이 있음. 그 질문에 텍스트로만 답하고 응답을 끝낼 것. 파일 수정·위임은 사용자의 다음 메시지 이후에 할 것. 이 응답에는 새 결정 질문을 텍스트로도 쓰지 말고, 다음 메시지 후 질문 창으로 묻겠다고만 적을 것. 사용자 또는 팀원 메시지가 오면 차단이 풀리므로, 그때는 미루지 말고 바로 질문 창으로 물을 것."
jq -n --arg r "$reason" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
exit 0
