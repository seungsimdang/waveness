#!/bin/sh
# PreToolUse(AskUserQuestion) 훅(차단): harness-lab 흐름에서 청사진 본문 없이 적용·승인을 묻는 질문 창을 막음
# 대상: 최근 사용자 메시지 3개 안에 harness-lab 호출이 있고 질문·선택지 문구에 승인·적용·청사진이 들어 있는 질문
# 통과: harness-lab 호출 뒤 응답 본문 텍스트에 내용이 있고 닫는 태그까지 갖춘 `<harness-plan>` 블록이나 계획 파일 참조 `<harness-plan-file>`가 있음
# 질문 창 문구는 응답 본문이 아니라서 청사진으로 인정하지 않음
# 같은 응답의 본문이 훅 실행 시점에 transcript에 아직 기록되지 않을 수 있어, 차단 판정이면 잠시 뒤 다시 읽어 최대 2초 확인
# 질문 창 입력에 실제 파일과 해시가 맞는 계획 파일 참조가 있으면 본문 기록 시점과 무관하게 통과
# subagent 호출과 transcript를 읽지 못한 경우는 차단하지 않음

input=$(cat)

printf '%s' "$input" | python3 -c '
import hashlib, json, re, sys, time

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)

if data.get("hook_event_name") != "PreToolUse" or data.get("tool_name") != "AskUserQuestion" or data.get("agent_id"):
    sys.exit(0)

if not re.search(r"승인|적용|청사진", json.dumps(data.get("tool_input") or {}, ensure_ascii=False)):
    sys.exit(0)

def blocked():
    try:
        with open(data.get("transcript_path") or "", encoding="utf-8") as transcript:
            entries = [json.loads(line) for line in transcript if line.strip()]
    except Exception:
        return False
    # 뒤에서부터 읽어 harness-lab 호출 뒤에 본문 청사진이 있었는지 봄
    planned = False
    users = 0
    for entry in reversed(entries):
        if not isinstance(entry, dict) or entry.get("isMeta"):
            continue
        content = (entry.get("message") or {}).get("content")
        parts = [{"type": "text", "text": content}] if isinstance(content, str) else [part for part in content or [] if isinstance(part, dict)]
        if entry.get("type") == "assistant":
            if any(part.get("type") == "text" and re.search(r"<harness-plan>\s*\S[\s\S]*?</harness-plan>|<harness-plan-file\s+path=\"[^\"]+\"\s+sha256=\"[0-9a-f]{64}\"\s*/>", part.get("text", "")) for part in parts):
                planned = True
            if any(part.get("type") == "tool_use" and part.get("name") == "Skill" and str((part.get("input") or {}).get("skill", "")).split(":")[-1] == "harness-lab" for part in parts):
                return not planned
        elif entry.get("type") == "user":
            text = "\n".join(part.get("text", "") for part in parts if part.get("type") == "text")
            if text.strip() and not text.lstrip().startswith(("<hook_prompt", "<agent-message", "<task-notification>", "<system-reminder>")):
                users += 1
                if users >= 3:
                    return False
    return False

def strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from strings(item)

# 질문 창에 적은 계획 파일 참조는 파일 해시가 맞을 때만 인정함
for text in strings(data.get("tool_input")):
    for path, digest in re.findall(r"<harness-plan-file\s+path=\"([^\"]+)\"\s+sha256=\"([0-9a-f]{64})\"\s*/>", text):
        try:
            with open(path, "rb") as plan:
                if hashlib.sha256(plan.read()).hexdigest() == digest:
                    sys.exit(0)
        except OSError:
            pass

for attempt in range(5):
    if not blocked():
        sys.exit(0)
    if attempt < 4:
        time.sleep(0.5)

sys.stderr.write("harness-lab 흐름에서 청사진 본문 없이 적용·승인을 질문 창으로 물으려 함. 점검 요약·변경 계획·테스트와 <harness-plan> 블록을 응답 본문에 먼저 보인 뒤 질문하세요. 도구 호출 앞 본문은 진행 요약으로 바뀌어 기록되지 않을 수 있으니, 청사진은 도구 호출 없이 응답 마지막 텍스트로 쓰고 턴을 끝내거나 질문 창 입력에 <harness-plan-file> 참조를 넣으세요.\n")
sys.exit(2)
'
