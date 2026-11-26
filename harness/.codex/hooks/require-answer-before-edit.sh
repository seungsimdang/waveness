#!/bin/sh
# PreToolUse(Edit|Write|NotebookEdit, 파일 쓰는 Bash, AskUserQuestion)·Stop 훅(차단): 사용자 질문에 답하지 않은 채 파일을 고치거나 질문 창을 띄우거나 턴을 끝내는 것을 막음
# "확인하고 다시 답변해"처럼 앞서 한 답을 다시 요구하는 지시도 답해야 할 질문으로 보고, "~하고 보고해"처럼 작업 뒤 결과 보고를 요구하는 지시는 질문으로 보지 않음
# 질문 응답 여부 판정은 이 훅만 맡음. judge-unverified-claims.sh는 답의 내용(근거, 원인)만 판정함
# Stop은 사용자 중단 시 실행되지 않아(Claude Code hooks 문서 Stop 절) 턴 끝 판정만으로는 부족함
# 질문은 transcript의 이번 턴 사용자 메시지(턴 시작, 작업 중 메시지)에서 모으고, 의문형 후보가 없으면 판정기를 부르지 않음
# 질문 창 직접 입력 질문은 판정하지 않음
# Claude는 block-reask-after-free-text-answer.sh가 맡음
# 의문형 후보에 걸린 사용자 메시지만 판정기에 전달함
# 작업 알림은 자동 입력으로 분류해 제외함
# 끝만 넘기면 긴 턴 앞부분에서 한 답이 잘려 오판하므로 응답 텍스트는 앞과 끝을 함께 넘김
# 같은 질문 묶음이 한 번 통과하면 같은 턴의 이후 수정·Stop은 다시 판정하지 않음
# Bash는 쓰기 명령 패턴(sed -i, 파일 리다이렉트, tee, cp·mv·rm, 스크립트 안 파일 쓰기, git 변경 명령)에 걸릴 때만 판정하고 읽기 명령은 통과
# 인용된 문자열을 제외하고 출력 리다이렉트를 확인함
# 판정기는 런타임별(Claude haiku, Codex gpt-6-luna, Antigravity gemini-4-hydrogen-medium, effort 모두 medium)이고, 판정 실패·타임아웃·transcript 해석 불가는 통과
# 이번 턴 응답 텍스트가 없더라도 질문 후보가 있으면 수정 전에 응답 여부 판정
# 도구 호출 직전에 쓴 응답 텍스트가 transcript에 빠지는 경우가 있어 PreToolUse는 같은 질문을 1회만 막고 재시도는 통과
# 턴 끝 답변 여부는 last_assistant_message를 쓰는 Stop 판정이 맡음
# Claude와 Codex가 같은 본문을 쓰고, 판정 CLI는 .harness/judge_command.py가 HARNESS_RUNTIME과 스크립트 위치로 고름
# Codex transcript는 require-korean-response.sh와 같은 형식으로, Antigravity transcript는 USER_INPUT·PLANNER_RESPONSE 항목으로 해석함

[ -n "${HARNESS_STOP_JUDGE:-}" ] && exit 0

input=$(cat)

printf '%s' "$input" | HOOK_SCRIPT="$0" MARK_DIR="${TMPDIR:-/tmp}/answer-before-edit" python3 -c '
import hashlib, json, os, re, subprocess, sys, tempfile

JUDGE_TIMEOUT_SECONDS = 40
MAX_PROMPT_CHARS = 6000
MAX_TURN_TEXT_CHARS = 6000
TURN_TEXT_HEAD_CHARS = 3000

# 후보만 넓게 고르고 실제 질문 여부는 판정기가 정함
QUESTION = re.compile(
    r"\?|왜|뭐|무엇|어떻게|어캐|어디|언제|누가|얼마|(냐|니|나요|까요|건가|인가|던가|임|함)[\s.!~]*$"
    r"|(답변|대답|답|설명)\s*(해|하라|해\s*줘|해\s*봐|부터)|알려\s*줘",
    re.M,
)
BASH_WRITE = re.compile(
    r"\bsed\s+(-\w+\s+)*-i|\btee\b|(^|[\s;&|(])(cp|mv|rm|mkdir|touch)\s"
    r"|open\([^)]*[\"\x27][wa]|\.(write|write_text|write_bytes)\s*\(|writeFileSync|\bgit\s+(commit|apply|checkout|restore|reset|stash|add|rm|mv)\b"
)

REDIRECT = re.compile(r"[\x27][^\x27]*[\x27]|\"(?:\\.|[^\"\\])*\"|\\.|(?P<output>(?<![<>])>>?\s*(?![>&\s]|/dev/null(?:[\s;&|)]|$))\S)")

try:
    data = json.load(sys.stdin)
except Exception:
    # 입력을 해석할 수 없으면 판정 근거가 없어 통과
    sys.exit(0)

event = data.get("hook_event_name")
if event == "Stop":
    if data.get("stop_hook_active"):
        sys.exit(0)
elif event == "PreToolUse":
    if data.get("tool_name") == "Bash":
        command = str((data.get("tool_input") or {}).get("command") or "")
        if not BASH_WRITE.search(command) and not any(m.group("output") for m in REDIRECT.finditer(command)):
            sys.exit(0)
else:
    sys.exit(0)

def is_user_prompt(entry):
    # Antigravity transcript는 사용자 메시지를 USER_INPUT 문자열로 남김
    if entry.get("type") == "USER_INPUT":
        return isinstance(entry.get("content"), str)
    if entry.get("type") != "user" or entry.get("isMeta"):
        return False
    content = (entry.get("message") or {}).get("content")
    if isinstance(content, str):
        return True
    return isinstance(content, list) and any(isinstance(c, dict) and c.get("type") == "text" for c in content) and not any(
        isinstance(c, dict) and c.get("type") == "tool_result" for c in content
    )

def text_of(content):
    if isinstance(content, list):
        content = "\n".join(c.get("text", "") for c in content if isinstance(c, dict))
    return str(content or "")

def user_text(text):
    # 붙여넣은 내용, subagent 보고, 작업 알림은 사용자가 쓴 질문이 아니라서 제외
    text = re.sub(r"<agent-message\b.*?(</agent-message>|\Z)", "", text, flags=re.S)
    text = re.sub(r"<task-notification\b.*?(</task-notification>|\Z)", "", text, flags=re.S)
    return re.sub(r"<pasted_content\b.*?(</pasted_content[^>]*>|\Z)", "", text, flags=re.S)

try:
    with open(data.get("transcript_path") or "", encoding="utf-8") as transcript:
        entries = [json.loads(line) for line in transcript if line.strip()]
except Exception:
    sys.exit(0)

start = None
for index, entry in enumerate(entries):
    if isinstance(entry, dict) and is_user_prompt(entry):
        start = index
if start is None:
    sys.exit(0)

turn_id = str(entries[start].get("uuid") or start)
def prompt_of(entry):
    if entry.get("type") == "USER_INPUT":
        # 요청 본문만 쓰고 메타데이터 블록은 제외
        match = re.search(r"<USER_REQUEST>\s*(.*?)\s*</USER_REQUEST>", entry["content"], re.S)
        return match.group(1) if match else entry["content"]
    return text_of(entry["message"].get("content"))

prompts = [user_text(prompt_of(entries[start]))]
turn_texts = []
for entry in entries[start + 1:]:
    if not isinstance(entry, dict):
        continue
    # 작업 중에 보낸 사용자 메시지는 queued_command 첨부로 남음
    attachment = entry.get("attachment") or {}
    if attachment.get("type") == "queued_command" and attachment.get("prompt"):
        prompts.append(user_text(str(attachment["prompt"])))
    if entry.get("type") == "PLANNER_RESPONSE" and isinstance(entry.get("content"), str):
        turn_texts.append(entry["content"])
    if entry.get("type") == "assistant":
        for c in (entry.get("message") or {}).get("content") or []:
            if isinstance(c, dict) and c.get("type") == "text":
                turn_texts.append(c.get("text", ""))
if event == "Stop":
    # Stop 시점 transcript에 마지막 응답이 아직 없을 수 있어 last_assistant_message로 보완
    last = data.get("last_assistant_message") or ""
    if last.strip() and not "\n".join(turn_texts).rstrip().endswith(last.strip()):
        turn_texts.append(last)

# 의문형 후보에 걸린 메시지만 판정기에 넘겨 작업 지시를 질문으로 오판할 여지를 없앰
prompts = [p.strip() for p in prompts if p.strip() and QUESTION.search(p)]
if not prompts:
    sys.exit(0)

user_prompt = "\n---\n".join(prompts)[-MAX_PROMPT_CHARS:]
session = re.sub(r"[^\w.-]", "_", str(data.get("session_id") or "default"))
mark = os.path.join(os.environ["MARK_DIR"], session + "-" + re.sub(r"[^\w.-]", "_", turn_id))
digest = hashlib.sha256(user_prompt.encode()).hexdigest()
try:
    with open(mark, encoding="utf-8") as passed:
        if passed.read() == digest:
            sys.exit(0)
except OSError:
    # 표시가 없으면 아직 이 질문 묶음을 판정하지 않은 상태
    pass

# PreToolUse 1회 차단 표시는 Stop 통과 표시와 분리해 Stop 판정을 건너뛰지 않게 함
# 질문별 해시로 기록해 작업 중 메시지로 묶음이 바뀌어도 이미 한 번 막은 질문은 PreToolUse에서 다시 막지 않음
denied = mark + "-denied"
question_hash = lambda prompt: hashlib.sha256(prompt.encode()).hexdigest()
if event == "PreToolUse":
    try:
        with open(denied, encoding="utf-8") as previous:
            denied_hashes = set(previous.read().split())
    except OSError:
        # 표시가 없으면 이번 턴에 아직 수정을 막은 질문이 없는 상태
        denied_hashes = set()
    prompts = [p for p in prompts if question_hash(p) not in denied_hashes]
    if not prompts:
        sys.exit(0)
    user_prompt = "\n---\n".join(prompts)[-MAX_PROMPT_CHARS:]

turn_text = "\n".join(turn_texts).strip()
if len(turn_text) > MAX_TURN_TEXT_CHARS:
    # 앞부분 답과 최근 답이 모두 판정기에 보이도록 앞과 끝을 이어 붙임
    turn_text = turn_text[:TURN_TEXT_HEAD_CHARS] + "\n…\n" + turn_text[-(MAX_TURN_TEXT_CHARS - TURN_TEXT_HEAD_CHARS):]
turn_text = turn_text or "(없음)"
asking = data.get("tool_name") == "AskUserQuestion"
action = "질문 창을 띄우" if asking else "파일을 고치"
moment = f"{action}려는 지금까지" if event == "PreToolUse" else "턴을 끝내는 지금까지"
judge_prompt = f"""[사용자 메시지](턴 시작 메시지, 작업 중에 보낸 메시지, ---로 구분)의 질문(붙여 넣은 내용 뒤에 단 질문 포함) 중 [이번 턴 응답 텍스트] 어디에서도 답하지 않은 것이 있는지 판정하고 JSON 한 줄만 출력한다.
기준 시점은 {moment}다. 작업 지시는 질문이 아니다. 단 "확인하고 다시 답변해", "다시 대답해"처럼 앞서 한 답을 다시 요구하는 지시는 답해야 할 질문으로 보고, 원문을 그대로 unanswered에 쓴다. "~하고 보고해", "검토 후 보고해"처럼 작업을 먼저 하고 끝에 결과를 보고하라는 지시는 질문이 아니다. 이전 답변을 인용만 한 문장, 결정 선택지에 대한 답, 질문 없이 내용만 전달한 메시지도 질문이 아니다. 답의 정확성은 판정하지 않는다. 확신이 없으면 통과시킨다.
출력: {{"unanswered": "<답하지 않은 질문 원문>"}} 또는 모두 답했거나 질문이 없으면 {{"unanswered": null}}.

[사용자 메시지]
{user_prompt}

[이번 턴 응답 텍스트]
{turn_text}
"""

# 판정기 명령은 런타임별 단일 정의(.harness/judge_command.py)를 사용
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(os.environ["HOOK_SCRIPT"])))), ".harness"))
from judge_command import judge_command, runtime
JUDGE_KIND = runtime(os.environ["HOOK_SCRIPT"])

def judge_once():
    # 판정기 오류의 None과 명시적 통과의 빈 문자열을 구분함
    try:
        with tempfile.TemporaryDirectory() as workdir:
            output_path = os.path.join(workdir, "verdict.txt")
            command, stdin = judge_command(JUDGE_KIND, judge_prompt, output_path)
            result = subprocess.run(
                command,
                input=stdin,
                capture_output=True,
                text=True,
                timeout=JUDGE_TIMEOUT_SECONDS,
                cwd=workdir,
                env={**os.environ, "HARNESS_STOP_JUDGE": "1"},
            )
            if result.returncode != 0:
                return None
            # Codex는 진행 로그가 stdout에 섞여 마지막 메시지 파일을 우선 읽음
            text = open(output_path, encoding="utf-8").read() if os.path.exists(output_path) else result.stdout
        verdict = json.loads(re.search(r"\{.*?\}", text, re.S).group(0))
    except Exception:
        return None
    # ok 같은 참거짓 필드는 판정기가 답했다고 쓰면서 false를 내는 오판이 있어, 답하지 않은 질문 원문이 있을 때만 막음
    if not isinstance(verdict, dict) or "unanswered" not in verdict:
        return None
    question = verdict["unanswered"]
    return "" if question is None else (question.strip() or None) if isinstance(question, str) else None

# 같은 입력에도 판정이 흔들려(실측 4회 중 1회 답한 질문을 미답변 판정) 미답변 판정은 한 번 더 받아 둘 다 미답변일 때만 막음
question = judge_once()
if question:
    question = judge_once()
if question is None:
    sys.exit(0)
if not question:
    os.makedirs(os.environ["MARK_DIR"], exist_ok=True)
    with open(mark, "w", encoding="utf-8") as passed:
        passed.write(digest)
    sys.exit(0)

question = question[:200]
if event == "PreToolUse":
    os.makedirs(os.environ["MARK_DIR"], exist_ok=True)
    with open(denied, "a", encoding="utf-8") as previous:
        previous.write("".join(question_hash(p) + "\n" for p in prompts))
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": "이번 턴 응답 텍스트에서 이 질문의 답을 찾지 못했습니다(도구 호출 직전에 쓴 텍스트는 아직 기록에 없어 판정에 보이지 않을 수 있음): " + question
        + f" {action}기 전에 이 질문의 답을 응답 텍스트로 먼저 쓰세요. "
        + ("질문 창은 답을 본 사용자의 다음 메시지 이후에 띄우세요." if asking else "답을 쓴 뒤 같은 수정을 다시 시도하면 통과합니다.")
        + " 도구 호출 앞 텍스트는 진행 요약으로 바뀌어 사용자에게 보이지 않고 기록되지 않을 수 있으니, 답은 도구 호출 없이 응답 마지막 텍스트로 쓰고 턴을 끝내는 것이 확실합니다."
        + " 답에 필요한 자료 읽기는 막지 않습니다.",
    }}, ensure_ascii=False))
else:
    # stop_hook_active가 계속 false로 들어온 보고(anthropics/claude-code#54360)가 있어 같은 질문 묶음은 Stop에서 한 번만 막음
    os.makedirs(os.environ["MARK_DIR"], exist_ok=True)
    with open(mark, "w", encoding="utf-8") as passed:
        passed.write(digest)
    print(json.dumps({"decision": "block", "reason": "답하지 않은 사용자 질문이 있습니다: " + question
        + " 이 질문의 답을 응답 텍스트로 쓰고 턴을 끝내세요."}, ensure_ascii=False))
'

exit 0
