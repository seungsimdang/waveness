#!/bin/sh
# Stop 훅(차단): 마지막 응답의 한 문장에 추측 표현과 미확인 꼬리표가 함께 있으면 턴 종료를 한 번 막음
# 그 턴에 도구로 확인할 수 있던 사실을 "~것으로 보지만 아직 확인하지 않았다"로 보고한 사고가 있어 추가함
# 실제로 확인할 수 있었는지는 훅이 알 수 없어, 한 번 막고 재응답(stop_hook_active)은 통과시킴
# 코드 표기와 큰따옴표 인용은 규칙을 설명하는 문장일 수 있어 판정에서 뺌
# Codex 전용 정규식 판정으로, Claude는 같은 목적을 settings.json의 Stop prompt 훅(LLM 판정)으로 처리함
# Codex hooks는 prompt·agent 핸들러를 실행하지 않아 이 방식을 유지함(https://developers.openai.com/codex/hooks)

input=$(cat)

printf '%s' "$input" | python3 -c '
import json, re, sys

try:
    data = json.load(sys.stdin)
except Exception:
    # 입력을 해석할 수 없으면 판정 근거가 없어 통과
    sys.exit(0)

answer = data.get("last_assistant_message") or ""
if data.get("stop_hook_active") or not answer.strip():
    sys.exit(0)

text = re.sub(r"`[^`]*`|\"[^\"\n]*\"|“[^”\n]*”", "", answer)
hedge = re.compile(r"것으로 (보입니다|보이지만|보이나|보이고|봅니다|보지만|예상|추정)|것 같(습니다|지만|은데|아)|(가능성|확률)이 높|아마")
unverified = re.compile(r"확인하지 (않았|못했|않은)|확인 안 했|미확인|아직 확인|검증하지 (않|못)|미검증")

for sentence in re.split(r"(?<=[.!?])\s+|\n", text):
    if hedge.search(sentence) and unverified.search(sentence):
        print(json.dumps({
            "decision": "block",
            "reason": "추측에 미확인 꼬리표를 붙인 보고가 있습니다: " + sentence.strip()[:120]
            + " 지금 도구로 확인할 수 있으면 확인한 결과로 다시 보고하세요. 정말 확인할 수 없으면 막힌 이유와 확인 방법을 적으세요.",
        }, ensure_ascii=False))
        break
'

exit 0
