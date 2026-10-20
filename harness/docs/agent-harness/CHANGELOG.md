# 하네스 변경 이력

## 2026-10-20 초기 구성

- 대상: 전체 하네스, waveness `bin/harness.mjs`(프로젝트 동기화·seungness 훅 동기화), `skills/harness-connect`, `templates/project.md`
- 내용: samsungshi-scaffolding-frontend·trinione_monitoring_frontend·hkmold-monitoring-frontend의 `.claude`·`.codex`에서 공통 규칙과 Feature Team(spec-planner·implementer·integration-reviewer), 스킬(feature-team-orchestrator·itd-commit·finding-validity-gate·coderabbit-triage)을 가져와 Claude·Codex 짝으로 구성했다. 프로젝트 이름·PRD 경로·참고 레퍼런스 저장소·검증 명령은 프로젝트 소유 `docs/agent-rules/project.md`를 가리키게 바꿨다. 훅·`.harness/`·인계 계약·harness-lab·cross-agent-handoff는 seungness 구조를 따랐다.
- 훅: 같은 이름의 훅(git-safety-guard·enforce-commit-msg-style·block-attribution-trailers·block-em-dash-in-source·require-korean-response)은 seungness판을 쓴다. hkmold의 check-unverified-hedge·remind-why-root-cause·require-answer-before-tools·block-unscoped-process-kill은 seungness의 judge-unverified-claims·require-why-explanation·git-safety-guard와 기능이 겹쳐 넣지 않았다. 프런트엔드 전용 훅 7개는 seungness로 올리지 않는다(`.harness/upstream-paths`).
- 제외: 프로젝트별 오케스트레이터(monitoring-poc·robot-dashboard), new-project-scaffold 스킬, prior-art-researcher·spec-analyst 역할(hkmold에서 spec-planner로 합쳐진 이전 구성), 스택 규칙 문서(nextjs·react-query·tailwind·project-structure, 프로젝트마다 타입명·경로가 달라 프로젝트 소유로 둠).
