# 공통 개발 규칙

## 우선순위

- **CRITICAL**: 보안, 데이터 안전성, 프로덕션 중단 - 절대 타협 금지
- **IMPORTANT**: 품질, 유지보수성, 전문성 - 강하게 선호
- **RECOMMENDED**: 최적화, 스타일, 모범 사례 - 실용적일 때 적용

## 대화 방식

- 모든 응답·코드 주석·문서는 한국어 사용
- 불필요한 인사말 없이 바로 답한다
- 불확실한 사실·날짜·수치는 먼저 불확실하다고 명시
- 코드 변경 후에는 무엇을 바꿨는지 짧게 요약 (diff가 보이면 장황한 반복 금지)

## 워크플로우

- **패턴**: Understand → Plan → Todo(3+ tasks) → Execute → Validate → TypeCheck
- 멀티스텝 작업은 첫 도구 호출 전에 할 일 목록에 등록해 대화 중 다른 메시지가 끼어들어도 항목이 남게 한다
- **병렬 실행**: 독립적 작업은 병렬 도구 호출, 순차는 의존성 있는 경우만
- 시작한 구현은 완성까지 마무리 (반쯤 끝낸 상태로 남기지 않음)

## 스코프 규율

- 요청된 범위만 수정 - 추가 기능·리팩터링 자동 포함 금지 (MVP 우선), 피드백 기반 반복
- 무관한 독립 작업은 병렬 서브에이전트로 분리 (문맥 오염 방지)
- 임시 파일/스크립트/디버그 출력물은 즉시 정리, 버전 관리에 포함되면 안 되는 파일 생성 금지

## 파일 편집 규칙

- **읽기 우선**: 편집 전 반드시 내용 확인, 절대 경로 사용
- **부분 수정**: 변경 부분만 수정 (전체 재작성 금지)
- **줄바꿈 형식 보존**: 기존 줄바꿈/포맷 방식을 임의로 변경 금지

## 주석 처리 규칙

- "왜(why)"를 설명하는 비즈니스 로직 주석은 반드시 보존, 주석 처리된 dead code만 제거
- 히스토리/시행착오 서술(예: "처음에 ~로 했다가 ~로 바꿈") 금지 - 코드에는 지금 지켜야 할 불변조건/제약만 남기고, 과거 시도·수정 경위는 커밋 메시지에 남긴다
- **종결 어미**: `-한다.` 같은 완결문 대신 명사형/비종결 구절로 작성 (예: `~ 처리`, `~하는 용도로만 사용`)
- `artifacts/` 하위 하네스 산출물 파일명(`01-decisions.md`, `01-plan.md` 등) 인용 금지 - 산출물은 정리·이동될 수 있어 코드 주석에 남기면 죽은 링크가 됨

## 실패 조사

- 오류 발생 시 근본 원인 분석 (증상만 처리 금지), 테스트/검증 건너뛰기 금지
- **2회 이상 동일 방법 실패 시**: 접근 방식 변경 또는 사용자에게 보고
- 코드리뷰 결과(finding 블록)를 일괄 반영할 때는 `finding-validity-gate` Skill로 항목별 VALID/SKIP 표를 먼저 만든 뒤에만 수정

## 검증 원칙

- 코드 변경 후 `docs/agent-rules/project.md`의 타입 검사 명령 실행
- 한 세션에서 체크 이미 통과했으면 추가 변경 없는 한 재실행 금지
- UI 변경 시 기대 동작을 명시하고 렌더링 결과 확인
- 버그 수정 시 증상 제거가 아닌 근본 원인 해결 여부 확인
- 디자인 토큰(색상/수치/문구) 값을 바꿀 때는 Figma/원본 문서를 직접 재조회해 대조한 뒤에만 수정 - 요약이나 과거 자기평가에 남은 "재확인 필요" 플래그를 검증된 사실로 취급 금지

## 개발 작업 안전

- 작업 전 `git status && git branch` 확인 - origin보다 뒤처진 신호가 보이면 그 자리에서 `git pull`까지 마친 뒤 브랜치를 만든다
- 기본 브랜치 직접 작업 금지. 브랜치 이름과 분기 기준은 `docs/agent-rules/branch-strategy.md`
- 티켓 번호 없이 새 브랜치가 필요하면 브랜치명을 스스로 짓지 말고 사용자에게 티켓 번호(또는 브랜치명)를 확인한다. "작업을 진행해라"는 승인은 브랜치 전략까지 위임한 것이 아님
- 커밋을 새로 만들거나 기존 커밋을 바꾸는 요청("커밋해", "amend해", "squash/fixup")은 `itd-commit` Skill을 거친다
- Git 명령·파괴적 작업 전 `docs/agent-rules/git-safety.md`

## 고위험 행동 차단

- **명시적 승인 없이 절대 금지**: `git commit`, `git push`, 파일 삭제
- 파괴적/비가역적 작업(rm, delete, reset --hard, push --force 등)은 사용자 승인 후만 실행

## 코드 스타일 핵심

- 타입: `type`만 사용, `interface` 금지, `any` 금지
- 함수: 화살표 함수만, 반환 타입 명시 생략 권장 (TypeScript 추론 가능 시)
- 컴포넌트: 화살표 함수, 구조분해 필수, 셀프클로징
- **파일명**: 모든 파일 `kebab-case` (`SKILL.md`·`AGENTS.md`·`README.md`·`CHANGELOG.md` 등 도구·컨벤션이 요구하는 고정 파일명은 예외)
- import: 같은 폴더 `./`, 외부 `@/`
- `const` 우선, `var` 금지, 옵셔널체이닝(`?.`)/`??` 적극 사용
- 폼 유효성 검사: Zod 스키마(`schemas/`) + react-hook-form (`@hookform/resolvers/zod`)

## 공용 에이전트 규칙

코드·문서·Git 작업 전 현재 작업과 관련된 `docs/agent-rules/README.md` 및 해당 규칙 문서를 읽는다. 프로젝트 전용 규칙(스택·디렉터리·검증 명령·기획 문서)은 `docs/agent-rules/project.md`에 있으며 작업 전 함께 읽는다.

## Feature Team 하네스

신규 기능/화면 개발은 계획 → 구현 → 통합 검증 3역할 팀으로 진행한다. 진행표는 `.agents/skills/feature-team-orchestrator/SKILL.md`, 역할 카드는 `.codex/agents/`의 `spec-planner`·`implementer`·`integration-reviewer`(`.toml`), 산출물 지도는 `artifacts/feature-team/README.md`이다.

아래 요청이 들어오면 `feature-team-orchestrator`를 먼저 사용한다.

- "이 기능 추가해줘", "이 화면 만들어줘", "○○ 패널 만들어줘", "이거 구현해줘"
- "이어서 구현해줘", "계획은 그대로 두고 구현만 다시", "리뷰만 다시"

오타 수정, 스타일 조정처럼 계획·검증이 불필요한 작은 작업은 단일 흐름으로 직접 처리한다.

## 스킬

| 스킬 | 사용 시점 |
| --- | --- |
| `feature-team-orchestrator` | 신규 기능/화면 개발, 재실행·부분 수정 |
| `itd-commit` | 커밋 생성·amend |
| `finding-validity-gate` | 코드리뷰 finding 일괄 반영 |
| `coderabbit-triage` | CodeRabbit 리뷰 실행과 지적 선별 반영 |
| `cross-agent-handoff` | Claude·Codex 또는 세션 사이 작업 인계 |
| `harness-lab` | 하네스 신규 설계, 점검·개선, drift 확인 |

## Claude-Codex 인계 계약

- Claude와 Codex는 각자의 기존 Skill·Agent 흐름으로 작업한다.
- 모델 또는 세션을 실제로 전환할 때만 `artifacts/work/<work-id>/STATUS.md`와 `HANDOFF.md`를 갱신한다. 대화만으로 다음 모델에 필수 정보를 전달하지 않는다.
- `feature-team`의 상세 산출물은 유지한다. `HANDOFF.md`에는 해당 파일 경로와 다음 모델이 알아야 할 핵심 결론만 적는다.
- 절차는 `docs/agent-contracts/handoff.md`, 경로·필수 항목·보관 규칙은 `artifacts/work/README.md`를 따른다.

## 하네스 변경 이력

공용 하네스 이력은 waveness에서 관리한다. 중앙 원본 위치와 자동 기록 규칙은 `docs/agent-harness/sync.md`의 "변경 이력"을 참조한다. 프로젝트의 `docs/agent-harness/CHANGELOG.md`는 프로젝트 이력이며 동기화하지 않는다.
