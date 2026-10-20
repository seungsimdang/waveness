# 하네스 변경 이력

## 2026-10-20 Feature Team 4역할 재구성과 세 프로젝트 범용 규칙 반영

- 대상: `AGENTS.md`, `CLAUDE.md`, `.claude/agents/*`·`.codex/agents/*`(prior-art-researcher 추가), `feature-team-orchestrator`(Claude·Codex), `artifacts/feature-team/README.md`, `check-review-findings-relayed.sh`, `docs/agent-rules/branch-strategy.md`
- 경위: 초기 구성은 hkmold 하네스만 일반화했고, samsungshi·trinione의 오케스트레이터·역할은 내용을 확인하지 않은 채 프로젝트 전용으로 보고 제외했다. 실제로는 두 프로젝트에 사고에서 나온 범용 규칙이 있어 세 프로젝트의 연결 전 하네스(samsungshi `7b23188^`, trinione `cf31d35^`, hkmold `bd02f2e^`)를 모두 읽고 다시 반영했다.
- 역할 구성: samsungshi·trinione의 4역할(선례 조사-명세 분석-구현-검증)로 맞췄다. hkmold가 3역할로 줄인 기록상 이유("외부 레퍼런스 저장소가 없음", hkmold improvement-log 2026-09-15)는 지금 해당하지 않는다. 선례 조사는 `project.md`에 참고 레퍼런스 저장소가 있을 때만 실행한다. spec-analyst의 규칙은 spec-planner로 합쳤다. 산출물 번호는 00-input, 01-prior-art, 02-plan·02-decisions, 03-implementation-notes, 04-review.
- 옮긴 범용 규칙: 사람 승인 항목 질문 전 현황 보고(PRD·레퍼런스·API 명세·현재 코드), 답변란을 Orchestrator가 채우지 않음, 근거 인용 시 명시 규정/침묵/상반 구분, 선례 배제도 사람 승인, 기술 방식 질문에 조사된 선례를 선택지로 포함, `ListAgents`의 in-process 팀원 미표시와 접미사 분기, 실행 방식 전환 별도 승인, 재검증 원칙(사용 여부와 정확성 구분, 가역성 아닌 확신도, 리뷰어 자기평가 불신, 항상 통과하는 테스트 금지), 도구 미연결 즉시 알림, Figma 시각 값은 노드 근거로만, 반복 콘텐츠 카드 경계 확인, 라이브러리 override 기본 클래스 전수 대조, 축 눈금 포맷, breakpoint 실제 값 기준 실측, gap/padding과 오버플로·채움 검사 분리, 소스 주석에 산출물·결정 ID 금지, 인용 범위 스코프, 불만·재촉 신호 해석, 직접 질문 우선 답변, 청사진 게이트 예외 엄격 해석, SendMessage와 fork 구분, 긴급 중지.
- Figma MCP는 백그라운드 팀원에게 상속되지 않는다는 hkmold 재현 결과를 유지해, 두 프로젝트 역할에 있던 팀원의 Figma 직접 조회 절차는 Orchestrator가 원문을 저장하고 팀원이 요청하는 방식으로 바꿨다.
- Codex 역할 toml에 `model = "gpt-6-luna"`를 명시했다. hkmold 원본 형식을 따르느라 빠져 있었고, Codex 서브에이전트 문서는 `model`을 선택 필드로 둔다.
- 프로젝트 전용으로 남긴 것: 각 프로젝트의 PRD 정책 값, 레퍼런스 경로, 차트 라이브러리 등 결정 사항은 프로젝트 `docs/agent-rules/project.md`에 둔다.

## 2026-10-20 초기 구성

- 대상: 전체 하네스, waveness `bin/harness.mjs`(프로젝트 동기화·seungness 훅 동기화), `skills/waveness-connect`, `templates/project.md`
- 내용: samsungshi-scaffolding-frontend·trinione_monitoring_frontend·hkmold-monitoring-frontend의 `.claude`·`.codex`에서 공통 규칙과 Feature Team(spec-planner·implementer·integration-reviewer), 스킬(feature-team-orchestrator·itd-commit·finding-validity-gate·coderabbit-triage)을 가져와 Claude·Codex 짝으로 구성했다. 프로젝트 이름·PRD 경로·참고 레퍼런스 저장소·검증 명령은 프로젝트 소유 `docs/agent-rules/project.md`를 가리키게 바꿨다. 훅·`.harness/`·인계 계약·harness-lab·cross-agent-handoff는 seungness 구조를 따랐다.
- 훅: 같은 이름의 훅(git-safety-guard·enforce-commit-msg-style·block-attribution-trailers·block-em-dash-in-source·require-korean-response)은 seungness판을 쓴다. hkmold의 check-unverified-hedge·remind-why-root-cause·require-answer-before-tools·block-unscoped-process-kill은 seungness의 judge-unverified-claims·require-why-explanation·git-safety-guard와 기능이 겹쳐 넣지 않았다. 프런트엔드 전용 훅 7개는 seungness로 올리지 않는다(`.harness/upstream-paths`).
- 제외: new-project-scaffold 스킬, 스택 규칙 문서(nextjs·react-query·tailwind·project-structure, 프로젝트마다 타입명·경로가 달라 프로젝트 소유로 둠). 오케스트레이터·역할 제외 판단은 위 재구성 항목에서 바로잡았다.
