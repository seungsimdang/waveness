# waveness

Claude·Codex 공용 에이전트 하네스와 프로젝트 동기화 도구. 다른 저장소 없이 단독으로 운용한다.

| 경로 | 내용 |
| --- | --- |
| `harness/` | 공용 하네스 원본. 경로가 프로젝트 루트에 그대로 대응함 |
| `bin/harness.mjs` | 3-way 병합 동기화 도구(`pull`·`push`·`auto`·`upstream`) |
| `bin/*.test.mjs` | 동기화 동작과 Claude·Codex 짝 일치 검사. `node --test bin/*.test.mjs` |
| `skills/waveness-connect/` | 프로젝트 세션에서 "waveness에 연결해"로 쓰는 연결 스킬 |
| `templates/project.md` | 처음 받을 때 프로젝트에 만드는 프로젝트 규칙 파일 |
| `.githooks/` | pre-commit(테스트), post-commit(기존 설치 호환용) |
| `.harness/upstream-paths`, `.harness/upstream.json` | seungness 훅 동기화 대상·제외 목록과 마지막 동기화 기준 |
| `.claude/settings.json`, `.codex/hooks.json` | 이 저장소 세션 시작 때 업데이트 PR 안내와 하네스 훅 등록. `node bin/hub-hooks.mjs`로 `harness/`에서 생성 |
| `AGENTS.md`, `CLAUDE.md` | 이 저장소 작업에도 하네스 규칙을 적용하는 허브 예외 규칙 |

파일 소유, `Harness-Scope` 판단 기준, 자동 동기화 조건, 문제 대응은 `harness/docs/agent-harness/sync.md`에 있다.

## 하네스 고치기

- 공용 하네스는 `harness/`를 수정한다. 연결된 프로젝트의 작업·커밋 규칙은 프로젝트로 배포되는 `harness/docs/agent-harness/sync.md`에 있다.
- 역할·스킬은 Claude판과 Codex판을 같은 커밋에서 함께 고친다. 짝 일치는 pre-commit 훅이 검사한다. 클론한 뒤 한 번 `git config core.hooksPath .githooks`를 실행한다.
- 직접 고친 중요 변경은 `harness/docs/agent-harness/CHANGELOG.md`에 남긴다. 프로젝트에서 유입된 변경은 동기화 도구가 같은 반영 커밋에 자동 기록한다.

## 프로젝트 연결

PC마다 처음 한 번, waveness 루트에서 스킬 링크를 만든다. 클론만으로는 스킬이 잡히지 않는다.

```bash
cd ~/Documents/GitHub/waveness   # 클론한 위치
ln -s "$PWD/skills/waveness-connect" ~/.claude/skills/waveness-connect
ln -s "$PWD/skills/waveness-connect" ~/.agents/skills/waveness-connect
```

그다음 연결할 프로젝트의 Claude·Codex 세션에서 "waveness에 연결해"라고 하면 `waveness-connect` 스킬이 아래 절차를 실행한다.

waveness와 프로젝트를 같은 폴더에 둔다. 다른 위치면 `HARNESS_HUB` 환경 변수로 지정한다.

1. 프로젝트에서 `node ../waveness/bin/harness.mjs pull .` 로 처음 받는다. 기존 하네스 파일과 다르면 충돌 표시가 남으므로 정리한다.
2. `docs/agent-rules/project.md`에 스택·기획 문서·디렉터리·검증 명령을 채우고, 프로젝트 전용 규칙 파일은 `.harness/paths` 끝에 `!` 줄로 제외한다.
3. 통합 브랜치가 develop·main·master가 아니면 `.harness/lock.json`에 `"branch"`를 적는다.
4. 프로젝트 Git 훅에 commit-msg(`sh .harness/check-scope.sh "$1"`)를 등록하고, 허브 `.harness/projects.json`에 원격 저장소와 통합 브랜치를 등록한다. 기존 post-commit·post-merge의 `sync.sh commit` 등록은 호환용으로 남길 수 있다.
5. `Harness-Scope: sync`로 커밋한다. 이후 동기화는 아래 "연결 후 동기화"대로 자동 실행된다.

## 연결 후 동기화

- 허브의 GitHub Actions `Harness Sync`가 매시 17분 및 허브 변경 push 시 실행된다. GitHub 스케줄은 지연될 수 있으며 Actions에서 수동 실행할 수도 있다.
- 별도 체크아웃에서 기존 3-way 병합을 수행하고 `harness/sync/` 브랜치의 업데이트 PR을 만든다. 현재 작업 체크아웃은 바꾸지 않는다.
- 프로젝트 통합 브랜치에 push된 `Harness-Scope: generic` 변경은 허브로 돌아오는 별도 PR에 반영한다. 로컬에만 있는 커밋은 서버에서 읽을 수 없다.
- 필수 `하네스 검사`가 성공하고 나머지 검사에 실패·진행 중 항목이 없으며 변경 경로·최신 PR SHA·base가 일치하면 다음 자동 실행에서 merge commit으로 병합한다. 충돌·검사 실패는 자동 병합하지 않는다.
- 세션 시작은 업데이트 PR 링크, 원격 통합 브랜치를 받아야 하는지, 확인 실패 여부만 안내한다. 최신이면 출력하지 않는다. 세션이 프로젝트 브랜치를 pull하거나 커밋·push하지 않는다.

## 서버 자동화 등록

- 원격 프로젝트·통합 브랜치: `.harness/projects.json`. 등록된 브랜치만 업데이트하며 develop을 main으로 자동 배포하지 않는다.
- 신규 연결: `node bin/harness-automation.mjs register <프로젝트> <통합 브랜치>`로 권한·인증을 검사하고 등록·워크플로를 함께 준비한다. 양쪽 저장소를 커밋·push한 뒤 `verify-connection <프로젝트>`로 원격 반영을 확인해야 연결 완료다.
- 프로젝트 CI: `templates/harness-verify.yml`을 업데이트 PR에 포함한다. 공용 테스트, 프로젝트 하네스 테스트·타입·린트 스크립트를 실행하며 기존 CI도 병합 조건에 포함한다.
- Actions secret `HARNESS_SYNC_TOKEN`: 허브·seungness에 접근하는 개인 계정 인증. `HARNESS_PROJECT_TOKEN`: 회사 프로젝트에 접근하는 별도 회사 계정 인증. 저장소 contents·pull requests·워크플로 등록 권한이 필요하다. 값은 코드·로그·Git URL에 저장하지 않는다.
- 기존 GitHub CLI 로그인으로 로컬 실행할 수 있다. `projectAccount`는 회사 프로젝트를 조회할 로컬 계정 이름이며 Actions에서는 secret이 우선한다.
- PR 작성에 기본 `GITHUB_TOKEN`을 사용하지 않으므로 생성된 PR의 CI도 일반 PR처럼 실행된다. 인증 만료·권한 부족은 Actions 실패로 표시된다.
- 자동화 전용 PR만 검사 후 병합한다. 사람 리뷰를 요구하는 기존 브랜치 보호를 우회하지 않으며, 그런 보호가 있으면 GitHub가 병합을 거절한다.
- waveness↔seungness 훅 동기화도 PR을 거친다. seungness에 올릴 내용이 있으면 그 PR이 먼저 병합된 뒤 waveness의 기준점을 갱신한다.

## 수동 실행

```bash
node bin/harness.mjs pull <프로젝트>   # 받기. 충돌 표시를 남기고 커밋은 직접
node bin/harness.mjs push <프로젝트>   # 올리기. 프로젝트의 generic 커밋을 waveness 현재 브랜치에 커밋, push는 직접
node bin/harness-automation.mjs status <프로젝트>   # 읽기 전용 안내
node bin/harness-automation.mjs run                 # 별도 체크아웃에서 PR 처리
node bin/harness.mjs auto <프로젝트>                # 이전 훅 호환, 안내만 실행
```

공용 명세·훅·소스 회귀 검사는 `harness/.harness/`에 있으며 `node --test bin/*.test.mjs harness/.harness/*.test.mjs`로 검증한다. 연결 프로젝트에는 기존 `.harness/` 경로로 배포하고 commit-msg에서 전체 검사를 실행한다. 검사·플러그인은 `.harness/upstream-paths`에 포함되어 seungness와 기존 3-way 병합으로 양방향 동기화된다.
