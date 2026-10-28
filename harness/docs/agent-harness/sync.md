# 공용 하네스 동기화

이 프로젝트의 하네스는 공용 하네스 저장소(waveness)의 `harness/`와 자동으로 주고받는다. 이 문서는 프로젝트에서 하네스를 고칠 때 지킬 규칙이다. 동기화 도구 사용법과 연결 절차는 waveness `README.md`에 있다.

## 목차

- [파일 소유](#파일-소유)
- [변경 이력](#변경-이력)
- [Harness-Scope 판단 기준](#harness-scope-판단-기준)
- [자동 동기화](#자동-동기화)
- [수동 동기화](#수동-동기화)
- [문제가 생겼을 때](#문제가-생겼을-때)
- [seungness 훅 동기화](#seungness-훅-동기화)

## 파일 소유

| 구분 | 경로 | 동기화 |
| --- | --- | --- |
| 공용 | `.harness/paths`에 적힌 경로 | 양방향. 받을 때는 3-way 병합이라 프로젝트에서 고친 줄은 남음 |
| 프로젝트 | `docs/agent-rules/project.md`, `.harness/paths`의 `!` 줄, 그 밖의 모든 파일 | 동기화하지 않음 |
| 프로젝트 이력 | `docs/agent-harness/CHANGELOG.md` | 양방향에서 제외. 기존 파일은 그대로 유지 |
| 상태 | `.harness/lock.json` | 마지막으로 받은 waveness 커밋(`synced`), 프로젝트 이름(`name`), 통합 브랜치(`branch`, 선택) |

프로젝트 값이 필요한 공용 규칙은 공용 문서에 `docs/agent-rules/project.md`를 가리키는 문장만 두고, 값은 `project.md`에 적는다. 이렇게 나누면 공용 변경과 프로젝트 변경이 한 줄에 섞이지 않는다.

동기화는 waveness와 프로젝트 양쪽의 대상 규칙에 모두 맞는 파일만 주고받는다. waveness에서 제외한 파일은 프로젝트의 `.harness/paths`가 이전판이어도 주고받지 않는다. 프로젝트의 추가 제외 규칙도 유지된다.

## 변경 이력

- 공용 하네스 이력의 작성 원본은 waveness의 [`harness/docs/agent-harness/CHANGELOG.md`](https://github.com/seungsimdang/waveness/blob/main/harness/docs/agent-harness/CHANGELOG.md) 하나다. waveness에서 직접 수정한 중요 변경도 이 파일에 기록한다.
- 프로젝트의 `generic` 변경이 실제로 반영되면 동기화 도구가 원본 커밋 날짜·제목·본문과 `Harness-Origin: 프로젝트@커밋`을 공용 CHANGELOG에 자동 기록한다. 제어용 `Harness-Scope`·`Harness-Sync`·`Harness-Origin` 줄은 본문에서 제외한다. 설명의 정확성은 원본 커밋 메시지에 달려 있으며 도구가 별도 요약을 생성하지는 않는다.
- 코드와 이력은 같은 waveness 커밋에 들어간다. 자동 반영 커밋이 실패하면 둘 다 복구하고, 재시도나 이미 반영된 커밋으로 항목을 중복 생성하지 않는다. 실제 변경이 없는 커밋은 기록하지 않는다.
- 프로젝트는 자기 CHANGELOG에 프로젝트 이력을 남길 수 있지만 공용 CHANGELOG를 편집하거나 환류하지 않는다. 기존 프로젝트 파일은 덮어쓰거나 삭제하지 않으며, 신규 연결에서는 공용 CHANGELOG를 복사하지 않는다. 최신 공용 이력은 위 중앙 원본에서 확인한다.

## Harness-Scope 판단 기준

`.harness/paths` 대상 파일을 바꾼 커밋에는 커밋 메시지 끝에 `Harness-Scope:` 줄이 필요하다. commit-msg 훅의 `.harness/check-scope.sh`가 검사한다.

| 값 | 기준 | 공용 하네스로 |
| --- | --- | --- |
| `generic` | 다른 프로젝트에 그대로 넣어도 맞는 변경. 에이전트 행동 규칙, 훅 버그 수정, 역할·스킬 절차 개선 | 올라감 |
| `project` | 이 프로젝트의 스택·경로·도메인에만 맞는 변경 | 올라가지 않음 |
| `sync` | 공용 하네스에서 받아온 변경. 자동 동기화가 붙임 | 올라가지 않음 |

- 스택·경로·프로젝트 이름을 지워도 문장이 성립하면 `generic`, 아니면 `project`.
- `generic` 커밋에는 동기화 대상 파일만 담는다. 공용과 프로젝트 변경이 섞이면 `git add -p`로 커밋을 나눈다.

## 자동 동기화

| 시점 | 받기(공용 → 프로젝트) | 올리기(프로젝트 → 공용) |
| --- | --- | --- |
| Claude·Codex 세션 시작(SessionStart `startup`) | 실행 | 실행 |
| 커밋·병합 직후(post-commit·post-merge) | 실행 안 함 | `generic` 커밋이 있으면 백그라운드 실행 |

- 받기: waveness를 최신으로 맞춘 뒤 `synced` 커밋 이후 바뀐 파일을 3-way 병합하고 `Harness-Scope: sync`로 커밋한다. 프로젝트 pre-commit 훅도 그대로 실행된다.
- 올리기: 통합 브랜치(`branch`, 없으면 develop·main·master 순)의 `generic` 커밋만 waveness main에 커밋별로 병합하고 push한다. 사람 검토 없이 반영된다. waveness 커밋에는 `Harness-Origin: {프로젝트}@{커밋}` 줄이 붙어 같은 커밋을 다시 올리지 않는다.
- 건너뛰는 경우: worktree 세션, 스테이징된 변경이 있거나 하네스 파일에 미커밋 변경이 있을 때(받기), waveness가 main이 아니거나 미커밋 변경이 있을 때(올리기). 다음 세션 시작 때 다시 시도한다.
- 결과는 세션 맥락에 한 줄로 남는다. 보류·중단·실패는 세션 시작 화면에도 경고로 뜬다(`systemMessage`). 커밋 직후 실행 기록은 `.git/harness-sync.log`에 남고, 실패한 올리기는 다음 세션 시작 때 다시 시도되어 화면에 뜬다.

## 수동 동기화

```bash
node ../waveness/bin/harness.mjs pull .   # 받기. 충돌 표시를 남기고 커밋은 직접(Harness-Scope: sync)
node ../waveness/bin/harness.mjs push .   # 올리기. waveness 현재 브랜치에 커밋, push는 직접
```

## 문제가 생겼을 때

| 상황 | 할 일 |
| --- | --- |
| 세션 맥락에 "받기 보류: 충돌" | 수동 받기로 충돌 표시를 정리하고 `Harness-Scope: sync`로 커밋 |
| "올리기 중단: … waveness 커밋 실패" | waveness pre-commit(테스트)이 막은 것이다. waveness는 자동으로 원래대로 돌아간다. 메시지의 원인(예: Claude·Codex 짝 불일치)을 프로젝트에서 고쳐 다시 `generic`으로 커밋한다 |
| 세션 맥락에 "올리기 중단: 충돌" | waveness에서 `push`를 수동 실행해 충돌을 정리하고 커밋·push |
| 잘못 `generic`으로 올라간 변경 | waveness에서 해당 커밋을 revert하고 push. 다음 세션에서 각 프로젝트로 퍼짐 |
| 프로젝트에만 두고 싶은 공용 파일 | `.harness/paths` 끝에 `!{경로}` 줄을 추가(`Harness-Scope: project`) |

## seungness 훅 동기화

waveness의 훅 스크립트(`.claude/hooks/`, `.codex/hooks/`)와 훅 등록(`.claude/settings.json`, `.codex/hooks.json`의 `hooks`)은 개인 범용 하네스 seungness의 같은 경로와 양방향으로 주고받는다. 프로젝트는 이 동기화에 직접 참여하지 않고, waveness를 거쳐 받는다. waveness 옆 폴더에 seungness가 있을 때만 동작하고, 없으면 아무 메시지 없이 건너뛰므로 waveness만 받은 PC에는 영향이 없다. 다른 위치면 `UPSTREAM_HUB` 환경 변수로 지정한다.

| 구분 | 내용 |
| --- | --- |
| 대상 | waveness `harness/.claude/hooks/`·`harness/.codex/hooks/` ↔ seungness `harness/` 같은 경로 |
| 제외 | waveness 루트 `.harness/upstream-paths`의 `!` 줄. 프런트엔드·feature-team 전용 훅, waveness에서 쓰지 않는 seungness 전용 훅과 그 훅을 가리키는 등록은 양방향 모두 주고받지 않음. 커밋 형식 훅(`enforce-commit-msg-style.sh`·`block-attribution-trailers.sh`)은 차단 메시지가 각 허브의 커밋 스킬(waveness `itd-commit`, seungness `git-commit`)을 가리키도록 따로 두므로, 검사 로직을 고치면 두 저장소에 각각 반영 |
| 등록 | `hooks` 키만 등록 항목(이벤트·matcher·명령) 단위로 병합. 한쪽의 추가·삭제가 다른 쪽에 반영되고, `permissions`·`env` 등 나머지 설정은 각 저장소가 따로 가짐 |
| 상태 | waveness 루트 `.harness/upstream.json`의 `synced`(마지막으로 맞춘 seungness 커밋) |

- 시점: waveness 저장소의 세션 시작, waveness 커밋 직후, 연결된 프로젝트의 자동 동기화(`auto`) 직전.
- 병합: `synced` 시점의 seungness 파일을 기준으로 파일마다 3-way 병합한다. 한쪽만 바뀌면 그쪽을 반영하고, 양쪽이 다른 줄을 바꾸면 합친다. 같은 줄을 다르게 바꾼 충돌이 하나라도 있으면 아무것도 쓰지 않고 중단한다. 등록은 항목 단위라 충돌이 없다(같은 등록의 옵션을 바꾸면 삭제+추가로 처리).
- 반영: seungness에는 `chore(harness): waveness 훅 동기화` 커밋(`Harness-Origin: waveness@{커밋}`)을 만들어 main에 push하고, waveness에는 같은 내용과 `upstream.json` 갱신을 커밋해 push한다.
- 건너뛰는 경우: 두 저장소 중 하나가 main이 아니거나 미커밋 변경이 있을 때. 다음 시점에 다시 시도한다.
- 충돌: 표시된 파일을 양쪽에서 같은 내용으로 맞춰 각각 커밋한다. waveness 커밋이 나중이면 커밋 직후 다시 동기화되고, seungness 커밋이 나중이면 다음 waveness 세션 시작이나 커밋 때 다시 동기화된다.

## 공용 회귀 검사

`.harness/*.test.mjs`와 함께 쓰는 검사기·Biome 플러그인은 `.harness/` 동기화 대상에 포함된다. 허브 pre-commit과 연결 프로젝트의 `check-scope.sh`는 공용 테스트 전체를 실행한다. 수동 검증은 `node --test .harness/*.test.mjs`로 실행한다(허브: `node --test bin/*.test.mjs harness/.harness/*.test.mjs`).

명세의 필수 절·팀 통신·메타데이터, Claude·Codex 짝 일치, 훅 정상·위반 입력, Codex 어댑터, Git 인덱스 기반 소스·문서 검사기를 검증한다. 모델 선택은 프로젝트마다 다르므로 특정 모델 이름 대신 필수 메타데이터 형식을 검사한다. Stop 판정 CLI는 고정 응답으로 대체하며 실제 LLM 품질은 검증하지 않는다.

한글 테스트 제목의 Biome 플러그인은 `.harness/korean-test-titles.grit`로 배포한다. Biome를 사용하는 프로젝트는 설정의 `plugins`에 `./.harness/korean-test-titles.grit`를 등록한다. 회귀 테스트는 해당 프로젝트의 `node_modules/.bin/biome`로 실행하며 Biome가 없으면 사유를 표시하고 건너뛴다. 공용화 과정에서 프로젝트의 패키지나 린트 설정을 덮어쓰지 않는다.

소스·문서 검사기는 `.harness/check-*.sh`와 `.harness/check-comment-line-breaks.mjs`로 배포한다. 주석 훅은 프로젝트 `scripts/` 검사기를 우선하고, 없으면 공용 검사기를 사용한다. Git 인덱스 검사기의 lint-staged 연결 여부는 프로젝트가 정한다. 작성자 강제·프로젝트 병합 정책·React Doctor·Tailwind·admin 및 UI 컴포넌트 검사는 프로젝트 소유로 유지한다.
