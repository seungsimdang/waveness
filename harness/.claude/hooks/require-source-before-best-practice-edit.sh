#!/bin/sh
# PreToolUse(Edit|Write|NotebookEdit, 파일 쓰는 Bash) 훅(차단): best practice 판단을 맡긴 턴에서 문서 조회 전에 파일을 고치는 것을 막음
# 이 훅은 조회 도구 호출 여부만 판정함
# 질문 응답 여부는 require-answer-before-edit.sh, 응답의 근거는 judge-unverified-claims.sh, 답 형식 안내는 require-single-best-practice.sh가 맡음
# 조회 여부는 판단이 필요 없는 사실이라 판정기 없이 규칙으로만 판정함
# 결론을 먼저 공유했는지와 출처가 결론을 뒷받침하는지는 판정 범위 밖임
# Claude transcript와 Codex JSONL을 모두 읽고, 입력이나 transcript를 해석할 수 없으면 통과

input=$(cat)

printf '%s' "$input" | python3 -c '
import json, re, sys

KEYWORD = re.compile(r"best[ _-]?practice|베스트[ ]?프랙티스", re.I)
DELEGATE = re.compile(r"판단|처리|적용|알아서")
LOOKUP = re.compile(
    r"^(WebSearch|WebFetch|web_search)$|^mcp__context7__|^mcp__.*(search_docs|get_doc|query-docs|search_vercel_documentation)$"
)
BASH_WRITE = re.compile(
    r"\bsed\s+(-\w+\s+)*-i|\btee\b|(^|[\s;&|(])(cp|mv|rm|mkdir|touch)\s"
    r"|open\([^)]*[\"\x27][wa]|\.(write|write_text|write_bytes)\s*\(|writeFileSync|\bgit\s+(commit|apply|checkout|restore|reset|stash|add|rm|mv)\b"
)
REDIRECT = re.compile(r"[\x27][^\x27]*[\x27]|\"(?:\\.|[^\"\\])*\"|\\.|(?P<output>(?<![<>])>>?\s*(?![>&\s]|/dev/null(?:\s|$))\S)")

try:
    data = json.load(sys.stdin)
except Exception:
    # 입력을 해석할 수 없으면 판정 근거가 없어 통과
    sys.exit(0)

if data.get("hook_event_name") != "PreToolUse":
    sys.exit(0)
if data.get("tool_name") == "Bash":
    command = str((data.get("tool_input") or {}).get("command") or "")
    if not BASH_WRITE.search(command) and not any(m.group("output") for m in REDIRECT.finditer(command)):
        sys.exit(0)

try:
    with open(data.get("transcript_path") or "", encoding="utf-8") as transcript:
        entries = [json.loads(line) for line in transcript if line.strip()]
except Exception:
    sys.exit(0)

def strip_quoted(text):
    # 붙여 넣은 내용, subagent 보고, 작업 알림은 사용자가 직접 쓴 지시가 아니라서 제외
    for tag in ("agent-message", "task-notification", "pasted_content"):
        text = re.sub(r"<" + tag + r"\b.*?(</" + tag + r"[^>]*>|\Z)", "", text, flags=re.S)
    return text

def texts(content, kinds):
    if isinstance(content, str):
        return content
    return "\n".join(c.get("text", "") for c in content or [] if isinstance(c, dict) and c.get("type") in kinds)

# 각 항목을 (사용자 메시지 텍스트 또는 None, 조회 도구 호출 여부)로 정규화함
events = []
for entry in entries:
    if not isinstance(entry, dict):
        continue
    payload = entry.get("payload") or {}
    if payload:
        # Codex JSONL
        if payload.get("role") == "user":
            text = texts(payload.get("content"), ("input_text", "text"))
            if text and not text.lstrip().startswith(("<hook_prompt", "<codex_internal_context")):
                events.append(("turn", text, False))
        elif payload.get("type") == "web_search_call":
            events.append(("tool", None, True))
        elif payload.get("type") in ("function_call", "custom_tool_call"):
            events.append(("tool", None, bool(LOOKUP.search(str(payload.get("name") or "")))))
        continue
    content = (entry.get("message") or {}).get("content")
    attachment = entry.get("attachment") or {}
    if entry.get("type") == "user" and not entry.get("isMeta"):
        has_result = isinstance(content, list) and any(isinstance(c, dict) and c.get("type") == "tool_result" for c in content)
        text = texts(content, ("text",))
        if text and not has_result:
            events.append(("turn", text, False))
    elif attachment.get("type") == "queued_command" and attachment.get("prompt"):
        # 작업 중에 보낸 사용자 메시지는 턴을 새로 열지 않고 같은 턴에 이어짐
        events.append(("queued", str(attachment["prompt"]), False))
    elif entry.get("type") == "assistant" and isinstance(content, list):
        for c in content:
            if not isinstance(c, dict) or c.get("type") != "tool_use":
                continue
            name = str(c.get("name") or "")
            subagent = str((c.get("input") or {}).get("subagent_type") or "")
            events.append(("tool", None, bool(LOOKUP.search(name)) or (name in ("Agent", "Task") and subagent == "web-fetch")))

start = max((i for i, (kind, _, _) in enumerate(events) if kind == "turn"), default=None)
if start is None:
    sys.exit(0)

delegated = None
for index in range(start, len(events)):
    kind, text, _ = events[index]
    if kind in ("turn", "queued"):
        body = strip_quoted(text)
        if KEYWORD.search(body) and DELEGATE.search(body):
            delegated = index
            break
if delegated is None:
    sys.exit(0)
if any(looked for kind, _, looked in events[delegated + 1:] if kind == "tool"):
    sys.exit(0)

print(json.dumps({"hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "이번 턴에 best practice 판단을 맡긴 사용자 메시지가 있는데 아직 문서 조회가 없습니다."
    + " 공식 문서나 검색으로 출처를 먼저 확인하고, 결론과 근거를 응답에 공유한 뒤 수정하세요. 저장소 관례나 직관은 근거로 쓰지 않습니다.",
}}, ensure_ascii=False))
'

exit 0
