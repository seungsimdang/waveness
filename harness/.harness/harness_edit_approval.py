"""승인된 하네스 청사진과 실제 편집을 대조한다."""
import hashlib
import json
import os
import re
from pathlib import Path


def message(entry):
    if entry.get("isMeta"):
        return None, ""
    answers = (entry.get("toolUseResult") or {}).get("answers")
    if isinstance(answers, dict):
        return "user", "\n".join(str(value) for value in answers.values())
    entry_type = entry.get("type")
    if entry_type == "PLANNER_RESPONSE":
        content = entry.get("content")
        return "assistant", content if isinstance(content, str) else ""
    if entry_type == "USER_INPUT":
        content = entry.get("content")
        if not isinstance(content, str):
            return "user", ""
        req = re.search(r"<USER_REQUEST>\s*(.*?)\s*</USER_REQUEST>", content, re.S)
        return "user", req.group(1) if req else content
    payload = entry.get("payload") or {}
    if payload.get("role"):
        role, content = payload["role"], payload.get("content", [])
    else:
        role = entry_type
        content = (entry.get("message") or {}).get("content", [])
    if isinstance(content, str):
        return role, content
    return role, "\n".join(part.get("text", "") for part in content if isinstance(part, dict) and part.get("type") in ("text", "input_text", "output_text"))


def edit_hash(data):
    value = {"tool": data["tool_name"], "input": data.get("tool_input") or {}}
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode()).hexdigest()


def approved_change(entries, root, data, targets):
    plan = None
    approved = False
    for entry in entries:
        role, text = message(entry)
        if role == "user" and text.lstrip().startswith(("<hook_prompt", "<agent-message", "<task-notification>", "<system-reminder>")):
            continue
        if role == "assistant":
            match = re.search(r"<harness-plan>\s*(.*?)\s*</harness-plan>", text, re.S)
            if match:
                try:
                    plan = json.loads(match[1])
                except (ValueError, TypeError):
                    plan = None
                approved = False
        elif role == "user" and isinstance(plan, dict):
            answer = re.fullmatch(r"\s*<send_user_message_question_reply>\s*(.*?)\s*</send_user_message_question_reply>\s*", text, re.S)
            if answer:
                try:
                    text = "\n".join(item["answer"] for item in json.loads(answer[1]) if isinstance(item.get("answer"), str))
                except (ValueError, TypeError, KeyError):
                    continue
            value = text.strip()
            if value == str(plan.get("id", "")) + " 승인" or re.fullmatch(r"(?:ㅇㅇ|네|예|좋아)[.! ]*(?:진행해|적용해)?|승인(?:합니다|해)?|청사진대로 (?:진행해|적용해)", value):
                approved = True
            if re.search(r"하지\s*마|승인\s*취소|거부", value):
                approved = False
    if not approved or not isinstance(plan, dict):
        return False
    if plan.get("skill") != "harness-lab" or os.path.realpath(plan.get("root", "")) != os.path.realpath(root):
        return False
    expected_targets = {Path(root, name).resolve() for name in targets}
    for change in plan.get("changes", []):
        if change.get("edit_sha256") != edit_hash(data):
            continue
        files = change.get("before_sha256", {})
        if {Path(root, name).resolve() for name in files} != expected_targets:
            continue
        matches = True
        for name, expected in files.items():
            path = Path(root, name)
            actual = hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else "absent"
            if actual != expected:
                matches = False
                break
        if matches:
            return True
    return False
