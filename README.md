# waveness

Claude·Codex 공용 에이전트 하네스와 프로젝트 동기화 도구. 회사 프런트엔드 프로젝트(samsungshi-scaffolding-frontend, trinione_monitoring_frontend, hkmold-monitoring-frontend)의 하네스를 합쳐 만들었고, 다른 저장소 없이 단독으로 운용한다.

| 경로 | 내용 |
| --- | --- |
| `harness/` | 공용 하네스 원본. 경로가 프로젝트 루트에 그대로 대응함 |
| `bin/harness.mjs` | 3-way 병합 동기화 도구(`pull`·`push`·`auto`·`upstream`) |
| `bin/*.test.mjs` | 동기화 동작과 Claude·Codex 짝 일치 검사. `node --test bin/*.test.mjs` |
| `skills/waveness-connect/` | 프로젝트 세션에서 "waveness에 연결해"로 쓰는 연결 스킬 |
| `templates/project.md` | 처음 받을 때 프로젝트에 만드는 프로젝트 규칙 파일 |
| `.githooks/` | pre-commit(테스트), post-commit(seungness 훅 동기화) |
| `.harness/upstream-paths`, `.harness/upstream.json` | seungness 훅 동기화 대상·제외 목록과 마지막 동기화 기준 |
| `.claude/settings.json`, `.codex/hooks.json` | 이 저장소 세션 시작 때 seungness 훅 동기화와 하네스 훅 등록. `node bin/hub-hooks.mjs`로 `harness/`에서 생성 |
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

waveness와 프로젝트를 같은 폴더에 둔다. 다른 위치면 `HARNESS_HUB` 환경 변수로 지정한다. 자동 올리기는 waveness가 main 브랜치이고 미커밋 변경이 없을 때만 동작한다.

1. 프로젝트에서 `node ../waveness/bin/harness.mjs pull .` 로 처음 받는다. 기존 하네스 파일과 다르면 충돌 표시가 남으므로 정리한다.
2. `docs/agent-rules/project.md`에 스택·기획 문서·디렉터리·검증 명령을 채우고, 프로젝트 전용 규칙 파일은 `.harness/paths` 끝에 `!` 줄로 제외한다.
3. 통합 브랜치가 develop·main·master가 아니면 `.harness/lock.json`에 `"branch"`를 적는다.
4. 프로젝트 Git 훅에 commit-msg(`sh .harness/check-scope.sh "$1"`), post-commit·post-merge(`sh .harness/sync.sh commit`)를 등록한다.
5. `Harness-Scope: sync`로 커밋한다. 이후 세션 시작과 커밋 직후에 자동으로 동기화된다.

## 수동 실행

```bash
node bin/harness.mjs pull <프로젝트>   # 받기. 충돌 표시를 남기고 커밋은 직접
node bin/harness.mjs push <프로젝트>   # 올리기. 프로젝트의 generic 커밋을 waveness 현재 브랜치에 커밋, push는 직접
node bin/harness.mjs auto <프로젝트> [pull|push|both]   # 훅과 같은 자동 동작
```

## seungness 훅 동기화(선택)

waveness 옆 폴더에 개인 범용 하네스 `seungness`가 있을 때만 동작한다. 없으면 아무 메시지 없이 건너뛰므로 waveness만 받은 PC에는 영향이 없다. 다른 위치면 `UPSTREAM_HUB`로 지정한다.

- 대상: `harness/.claude/hooks/`, `harness/.codex/hooks/`의 스크립트와 `harness/.claude/settings.json`, `harness/.codex/hooks.json`의 훅 등록. 등록은 `hooks` 키만 항목(이벤트·matcher·명령) 단위로 주고받고 나머지 설정은 각자 유지한다. `.harness/upstream-paths`의 `!` 줄(프런트엔드 전용 훅)과 그 훅을 가리키는 등록은 seungness로 올리지 않는다.
- 시점: 이 저장소의 세션 시작, 이 저장소 커밋 직후(post-commit, 백그라운드), 연결된 프로젝트의 자동 동기화 직전.
- 방식: `.harness/upstream.json`의 `synced`(마지막으로 맞춘 seungness 커밋)를 기준으로 파일마다 3-way 병합하고, 바뀐 쪽에 커밋·push한다. seungness 커밋에는 `Harness-Origin: waveness@{커밋}`과 CHANGELOG 항목이 붙는다. 같은 줄 충돌이 있으면 양쪽 모두 쓰지 않고 중단한다.
- 건너뜀: 두 저장소 중 하나가 main이 아니거나 미커밋 변경이 있을 때. 다음 시점에 다시 시도한다.
