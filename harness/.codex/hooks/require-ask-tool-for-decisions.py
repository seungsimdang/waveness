# Stop 훅: 일반 응답의 결정·승인 요청을 질문 도구로 유도
import json
import re
import sys
from pathlib import Path


def main():
    data = json.load(sys.stdin)
    if data.get("stop_hook_active") or data.get("agent_id"):
        return
    answer = data.get("last_assistant_message") or ""
    path = data.get("transcript_path")
    if not answer or not path:
        return

    # 인용된 질문과 코드 예시는 판정에서 제외
    text = re.sub(r"\x60{3}.*?\x60{3}|\x60[^\x60\n]*\x60", "", answer, flags=re.S)
    text = "\n".join(line for line in text.splitlines() if not line.lstrip().startswith(">"))
    if not re.search(
        r"(?:정해|골라|선택해)\s*주세요|까요\s*\?"
        r"|(?:어느|어떤|둘 중|옵션|선택)[^.!?\n]{0,50}(?:답해|알려)\s*주세요"
        r"|승인(?:을)?\s*(?:해\s*)?(?:주시면|주세요|부탁(?:드립니다|합니다))",
        text,
    ):
        return

    with Path(path).open(encoding="utf-8") as transcript:
        answered = False
        for line in transcript:
            try:
                entry = json.loads(line)
            except ValueError:
                continue
            payload = entry.get("payload") or {}
            if payload.get("type") != "message" or payload.get("role") != "user":
                continue
            message = "\n".join(
                part.get("text", "") for part in payload.get("content") or []
                if isinstance(part, dict)
            ).lstrip()
            if message.startswith(("<hook_prompt", "<codex_internal_context")):
                continue
            answered = message.startswith("<send_user_message_question_reply>")
    if not answered:
        print(json.dumps({
            "decision": "block",
            "reason": "결정·승인 요청은 일반 응답에 남기지 말고 Codex 사용자 질문 도구로 요청할 것.",
        }, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError):
        pass
