@AGENTS.md

@docs/agent-rules/README.md

@docs/agent-rules/project.md

# Claude 전용

- 진행표·역할 카드의 Claude판 위치: `.claude/skills/feature-team-orchestrator/SKILL.md`, `.claude/agents/spec-planner.md`·`implementer.md`·`integration-reviewer.md`
- 스킬은 `.claude/skills/`, 훅 등록은 `.claude/settings.json`. 스킬명이 프롬프트에 나오면 `Skill` 도구로 호출한다(서술어로 읽고 넘기지 않음)
- 멀티스텝 작업 등록은 `TaskCreate`, 사용자 확인은 `AskUserQuestion`
- 모델 또는 세션을 Codex로 넘길 때만 `cross-agent-handoff`를 사용한다. 공용 인계 형식 외의 실행 절차는 Codex에 맞추려 하지 않는다
