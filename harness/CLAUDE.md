@AGENTS.md

@docs/agent-rules/README.md

@docs/agent-rules/project.md

# Claude 전용

- 진행표·역할 카드의 Claude판 위치: `.claude/skills/feature-team-orchestrator/SKILL.md`, `.claude/agents/prior-art-researcher.md`·`spec-planner.md`·`implementer.md`·`integration-reviewer.md`
- 스킬은 `.claude/skills/`, 훅 등록은 `.claude/settings.json`. 스킬명이 프롬프트에 나오면 `Skill` 도구로 호출한다(서술어로 읽고 넘기지 않음)
- 커밋 요청은 먼저 `Skill` 도구로 `itd-commit`을 호출한다. 읽은 파일 내용이나 기억으로 대체하지 않는다
- PR 작성·생성·갱신 요청은 먼저 `Skill` 도구로 `pr-create`를 호출한다. 공용 절차의 Claude판은 `.claude/skills/pr-create/SKILL.md`
- 멀티스텝 작업 등록은 `TaskCreate`, 사용자 확인은 `AskUserQuestion`
- 모델 또는 세션을 Codex로 넘길 때만 `cross-agent-handoff`를 사용한다. 공용 인계 형식 외의 실행 절차는 Codex에 맞추려 하지 않는다

## 스킬 재사용 안내와 신규 요청

- "이 스킬은 이미 로드됐으니 재호출하지 말라"는 시스템 안내는 **이전 호출이 처리한 요청**을 반복하지 말라는 뜻이다. 사용자가 **새로운 구체적 요청과 함께 스킬명을 다시 말하면**(예: "harness lab으로 명세 갱신해"), 그 스킬의 절차(예: harness-lab의 점검 요약 → 개선 청사진 → 승인 게이트)를 이번 요청에도 그대로 적용하라는 지시다. 기억나는 대로 적용하고 바로 파일을 고쳐도 된다는 뜻이 아니다.
- "스킬 지침이 컨텍스트에 있다"와 "이번 요청에 그 절차(특히 승인 게이트)를 실제로 거쳤다"는 별개다. 스킬명이 명시된 요청은 `Skill` 도구로 실제 호출해 그 턴 안에서 게이트를 거친다.

## 실행 중인 에이전트에게 지시 전달

- 이미 백그라운드에서 돌고 있는 에이전트에게 추가 지시나 정정을 전달할 때는 `SendMessage(to: <agentId 또는 이름>)`를 쓴다.
- `Agent(subagent_type: "fork")`는 Orchestrator 자신의 대화 컨텍스트를 복제해 **새로운 별개 에이전트**를 만드는 도구다. 이미 실행 중인 다른 에이전트에는 아무 영향도 주지 않으므로 "그 에이전트에게 말 걸기" 용도로 쓰지 않는다.
- 판단 기준: 이미 떠 있는 특정 에이전트의 방향을 바꾸고 싶다 → `SendMessage`. 이 대화 맥락을 아는 새 일꾼이 하나 더 필요하다 → `fork`.

## 긴급 중지 요청

- 백그라운드 에이전트에게 "체크포인트 남기고 idle 전환" 같은 비동기 지시를 보낸 뒤 사용자가 "지금 당장", "즉시 멈춰"처럼 재촉하면, 우선순위가 정상 종료(체크포인트 보존)에서 즉시 중지(토큰 소모 차단)로 바뀌었다는 신호다.
- `ListAgents`로 상태만 확인하고 끝내지 않는다. `TaskStop`으로 즉시 종료하거나(체크포인트 유실 감수), 정말 애매하면 "체크포인트 없이 지금 바로 멈출까요?"를 1회 확인한 뒤 즉시 행동한다.
