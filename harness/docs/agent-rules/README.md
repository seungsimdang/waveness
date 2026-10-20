# 공용 에이전트 규칙

Claude와 Codex는 코드·문서·Git 작업 전에 이 폴더에서 현재 작업과 관련된 규칙을 읽는다. 이 문서는 공용 규칙의 단일 원본이며, 도구별 권한·Hook·Agent 설정은 `.claude/`, `.codex/`에 둔다.

- Claude: `.claude/rules/`의 심볼릭 링크로 자동 로드된다. `paths:`가 있는 규칙은 해당 경로 파일을 다룰 때, 나머지는 세션 시작 시 로드된다.
- Codex: 아래 표의 읽는 시점에 맞춰 직접 읽는다.
- 새 규칙 파일을 추가하면 `.claude/rules/`에 심볼릭 링크도 만든다: `ln -s ../../docs/agent-rules/{name}.md .claude/rules/`

| 규칙 | 읽는 시점 |
| --- | --- |
| `project.md` | 모든 작업 전. 스택, 디렉터리, 검증 명령, 스타일 규칙과 프로젝트 전용 규칙 문서 목록 |
| `enforcement-placement.md` | 검사 로직을 Hook, 테스트, 린트 중 어디에 둘지 판단할 때 |
| `branch-strategy.md` | 브랜치, worktree, 병합 작업 전 |
| `git-safety.md` | Git 명령, 병렬 Agent, worktree 작업 전 |

`project.md`와 그 문서가 가리키는 규칙 파일(예: `nextjs.md`, `react-query.md`, `tailwind.md`, `project-structure.md`)은 프로젝트 소유다. 공용 하네스(waveness)는 이 파일들을 동기화하지 않는다. 나머지 파일은 공용 하네스와 동기화되며 규칙은 `docs/agent-harness/sync.md`를 따른다.

## 공통 작업 제약

Claude와 Codex 모두 모든 작업에 적용한다.

- 기존 디자인·브레이크포인트·애니메이션과 README 참조 정보 보존.
- 변경·추가·제외·삭제 제안은 대상·전후·이유·영향을 설명하고 사용자 질문 도구(Claude `AskUserQuestion`, Codex 사용자 질문)로 검토받은 뒤 승인 범위만 적용. 질문·설명 요청을 승인으로 해석하지 않음.
- 승인 전에는 제안으로 표현하고 확정된 작업처럼 보고하지 않음. 사용자가 일괄 적용 시점을 지정하면 해당 순서 준수.
- 담당 파일만 수정하고 타인의 변경을 되돌리지 않음. 사용자 지시와 실제 제공된 도구를 우선하고, 실행하지 못한 원본 프로토콜은 미검증으로 보고.
- 하네스 원본은 `.claude/`·`.codex/`·`.agents/`의 실제 파일. 역할·스킬을 고치면 Claude판과 Codex판을 같은 변경에서 함께 고치고, 프로젝트에 하네스 일치 검사가 있으면 실행해 메타데이터 일치를 확인.
- 동기화 대상 하네스 파일(`.harness/paths`)을 바꾼 커밋에는 `Harness-Scope: generic|project|sync` 줄을 넣음. 다른 프로젝트에도 맞으면 `generic`, 이 프로젝트에만 맞으면 `project`. 판단 기준은 `docs/agent-harness/sync.md`.
- 테스트 제목의 설명은 한글. 경로 템플릿 허용, 영문 태그는 별도 metadata 사용.
