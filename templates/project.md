# 프로젝트 규칙

이 파일은 프로젝트 소유다. 공용 하네스(waveness)와 동기화하지 않는다. 공용 역할·스킬·규칙 문서가 "`docs/agent-rules/project.md`의 ~"라고 가리키는 값을 여기에 적는다. 비어 있는 항목은 에이전트가 추측하지 않고 사용자에게 묻는다.

## 프로젝트

- 이름:
- 스택: (예: Next.js 16 + TypeScript + React Query + Tailwind)
- 앱 도메인 구조:
- API 통신 방식:
- 구현 전 확인할 프레임워크 문서:

## 기획·명세 문서

| 문서 | 경로 | 상태 |
| --- | --- | --- |
| PRD | | |
| API 명세 | | 없음이면 목데이터 기반으로 계획 |
| 참고 레퍼런스 저장소 | | 구현 패턴 참고용, 직접 수정 대상 아님 |

## 디렉터리

| 경로 | 용도 |
| --- | --- |
| `src/` | 소스 |
| | 데이터 계층(예: `services/` → `hooks/` → `components/`) |
| | 테스트 |

## 검증 명령

| 구분 | 명령 |
| --- | --- |
| 타입 검사 | |
| 린트 | |
| 포맷 검사 | |
| 테스트 | |
| dev 서버 | |
| 빌드 | |

## 브랜치와 커밋

- 통합 브랜치: (기본 `develop`. 다르면 `.harness/lock.json`의 `branch`에도 적음)
- 1 branch 1 commit: (사용 여부)
- 추가로 허용한 브랜치 prefix:

## Git 훅

공용 하네스 동기화를 위해 아래 세 훅을 프로젝트 훅 도구(Husky 등)에 등록한다.

- commit-msg: `sh .harness/check-scope.sh "$1"`
- post-commit: `sh .harness/sync.sh commit`
- post-merge: `sh .harness/sync.sh commit`

## 프로젝트 전용 규칙 문서

`docs/agent-rules/`에 프로젝트 전용 규칙 파일(예: `nextjs.md`, `react-query.md`, `tailwind.md`, `project-structure.md`)을 두면 이 표에 적고, `.harness/paths` 끝에 `!docs/agent-rules/{name}.md` 줄을 추가한다.

| 규칙 | 읽는 시점 |
| --- | --- |
