#!/bin/sh
# PreToolUse(AskUserQuestion) 훅(차단): harness-lab 흐름에서 사용자가 볼 수 있는 청사진 없이 적용·승인을 묻는 질문 창을 막음
# 대상: 최근 사용자 메시지 3개 안에 harness-lab 호출이 있고 질문·선택지 문구에 승인·적용·청사진이 들어 있는 질문
# 화면에 보인 글: 질문 창 문구, harness-lab 호출 뒤 도구 호출이 없는 메시지의 텍스트 중 뒤에 사용자 항목이 기록된 것
# 도구 호출과 같은 메시지의 텍스트는 진행 요약으로 바뀌어 화면·기록에 남지 않을 수 있어 제외
# 통과: 화면에 보인 글에 내용이 있는 `<harness-plan>` 블록이 있거나, 해시가 맞는 계획 파일 참조 `<harness-plan-file>`의 변경 파일 경로가 모두 적혀 있음
# 계획 파일은 편집 승인용 JSON이라 참조만으로는 청사진을 보인 것으로 치지 않음
# subagent 호출과 transcript를 읽지 못한 경우는 차단하지 않음

input=$(cat)

printf '%s' "$input" | python3 -c '
import hashlib, json, re, sys

REF = re.compile(r"<harness-plan-file\s+path=\"([^\"]+)\"\s+sha256=\"([0-9a-f]{64})\"\s*/>")
BLOCK = re.compile(r"<harness-plan>\s*\S[\s\S]*?</harness-plan>")
MARKERS = ("<hook_prompt", "<agent-message", "<task-notification>", "<system-reminder>")

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)

if data.get("hook_event_name") != "PreToolUse" or data.get("tool_name") != "AskUserQuestion" or data.get("agent_id"):
    sys.exit(0)

if not re.search(r"승인|적용|청사진", json.dumps(data.get("tool_input") or {}, ensure_ascii=False)):
    sys.exit(0)

try:
    with open(data.get("transcript_path") or "", encoding="utf-8") as transcript:
        entries = [entry for entry in (json.loads(line) for line in transcript if line.strip()) if isinstance(entry, dict) and not entry.get("isMeta")]
except Exception:
    sys.exit(0)

def parts_of(entry):
    content = (entry.get("message") or {}).get("content")
    return [{"type": "text", "text": content}] if isinstance(content, str) else [part for part in content or [] if isinstance(part, dict)]

def strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from strings(item)

# 뒤에서부터 읽어 최근 사용자 메시지 3개 안의 harness-lab 호출 위치를 찾음
start = None
users = 0
for index in range(len(entries) - 1, -1, -1):
    entry = entries[index]
    parts = parts_of(entry)
    if entry.get("type") == "assistant":
        if any(part.get("type") == "tool_use" and part.get("name") == "Skill" and str((part.get("input") or {}).get("skill", "")).split(":")[-1] == "harness-lab" for part in parts):
            start = index
            break
    elif entry.get("type") == "user":
        text = "\n".join(part.get("text", "") for part in parts if part.get("type") == "text")
        if text.strip() and not text.lstrip().startswith(MARKERS):
            users += 1
            if users >= 3:
                sys.exit(0)
if start is None:
    sys.exit(0)

# 한 메시지의 블록은 같은 message.id로 나뉘어 기록되므로 id 단위로 도구 호출 여부를 봄
def message_id(index):
    return (entries[index].get("message") or {}).get("id") or ("entry", index)

tool_messages = {message_id(index) for index in range(start + 1, len(entries)) if entries[index].get("type") == "assistant" and any(part.get("type") == "tool_use" for part in parts_of(entries[index]))}
last_user = max((index for index in range(len(entries)) if entries[index].get("type") == "user"), default=-1)
shown = list(strings(data.get("tool_input")))
for index in range(start + 1, last_user):
    entry = entries[index]
    if entry.get("type") == "assistant" and message_id(index) not in tool_messages:
        shown.extend(part.get("text", "") for part in parts_of(entry) if part.get("type") == "text")
shown = "\n".join(shown)

if BLOCK.search(shown):
    sys.exit(0)

# 계획 파일 참조는 해시가 맞고 변경 파일 경로가 화면에 보인 글에 모두 있을 때만 인정
for path, digest in REF.findall(shown):
    try:
        with open(path, "rb") as plan_file:
            raw = plan_file.read()
        if hashlib.sha256(raw).hexdigest() != digest:
            continue
        names = {name for change in json.loads(raw).get("changes", []) for name in change.get("before_sha256", {})}
    except (OSError, ValueError, AttributeError, TypeError):
        continue
    if names and all(name in shown for name in names):
        sys.exit(0)

sys.stderr.write("harness-lab 흐름에서 사용자가 볼 수 있는 청사진 없이 적용·승인을 질문 창으로 물으려 함. 점검 요약·변경 계획·영향·테스트 전문을 도구 호출 없는 마지막 응답 텍스트로 보이고 턴을 끝낸 뒤, 다음 사용자 메시지 후 질문 창으로 승인을 물으세요. 질문 창 문구에 전문을 넣어도 됩니다. 계획 파일 참조 <harness-plan-file>는 편집 승인용이라 참조만으로는 청사진을 보인 것으로 치지 않고, 변경 파일 경로가 모두 화면에 보인 글에 있어야 합니다.\n")
sys.exit(2)
'
