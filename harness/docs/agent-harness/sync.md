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
- 코드와 이력은 같은 waveness 커밋에 들어간다. 격리 준비가 실패하면 체크아웃을 버리고, 재시도나 이미 반영된 커밋으로 항목을 중복 생성하지 않는다. 실제 변경이 없는 커밋은 기록하지 않는다.
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

- 개인 프로젝트는 Vercel 연동 여부와 관계없이 검사 통과 후 자동 병합한다. 회사 Vercel 연동 프로젝트는 PR 생성·검사까지만 자동 실행하고 사용자가 병합한다. 프로젝트 등록의 `manualMerge: true`와 회사 허브의 Vercel 검사·상태 감지로 자동 병합을 차단한다.

- 기존 역할의 모델·effort는 프로젝트 선택을 보존하고 공용 역할 본문만 갱신한다. 새 역할은 공용 기본값으로 추가한다.

- GitHub Actions가 등록된 원격 프로젝트의 통합 브랜치를 별도 체크아웃에서 읽고 3-way 병합한 업데이트 PR을 만든다. 프로젝트·허브의 현재 작업 브랜치는 변경하지 않는다.
- 프로젝트 통합 브랜치에 push된 `Harness-Scope: generic` 커밋은 허브의 별도 PR로 전달한다. `Harness-Origin`으로 중복 반영을 막는다. `project`·`sync` 커밋은 올리지 않는다.
- 자동 병합 대상은 자동화가 만든 `harness/sync/` PR이며, 하네스 경로·프로젝트 제외 규칙·최신 SHA·base를 검사한다. 필수 `하네스 검사`가 성공하고 나머지 검사에 실패·진행 중 항목이 없어야 다음 자동 실행에서 병합한다. PR 검사 누락·진행 중·실패·충돌이면 병합하지 않는다.
- 세션 시작은 읽기 전용이다. 업데이트 PR이 있으면 링크와 검사·병합 대기 안내를, 원격에 이미 반영됐으면 통합 브랜치를 받아야 한다는 안내를 표시한다. 최신이면 출력하지 않으며 조회 실패는 별도 안내한다. 실제 CI 실패 원인은 PR의 Checks에서 확인한다.
- 세션 시작이 프로젝트를 pull하거나 커밋·push하지 않는다. 기존 `sync.sh commit` Git 훅은 동작 없이 종료한다. 로컬에만 있는 generic 커밋은 origin에 push한 뒤 정기 실행이 읽는다.
- 자동화 등록·실행 주기·인증 설정은 허브 README의 서버 자동화 등록을 따른다. 통합 브랜치가 develop이면 자동 병합도 develop까지만 수행한다.

## 수동 동기화

```bash
node ../waveness/bin/harness.mjs pull .   # 받기. 충돌 표시를 남기고 커밋은 직접(Harness-Scope: sync)
node ../waveness/bin/harness.mjs push .   # 올리기. waveness 현재 브랜치에 커밋, push는 직접
```

## 문제가 생겼을 때

| 상황 | 할 일 |
| --- | --- |
| 업데이트 PR의 검사 실패 | PR Checks에서 실패 원인을 고친 뒤 다시 검사. 실패 상태에서는 병합하지 않음 |
| 동기화 Actions의 충돌 오류 | 격리 작업 브랜치에서 수동 받기로 충돌을 정리하고 `Harness-Scope: sync`로 PR 생성 |
| 업데이트 확인 실패 | GitHub 인증·네트워크와 허브 Actions 실행 결과 확인 |
| 원격에 반영됐지만 로컬이 이전 상태 | 작업을 정리한 뒤 해당 통합 브랜치의 변경을 받음 |
| 잘못 병합된 공용 변경 | 허브에서 revert PR로 복구. 다음 업데이트 PR이 각 프로젝트에 전달 |
| 프로젝트에만 둘 공용 파일 | `.harness/paths` 끝에 `!{경로}` 추가(`Harness-Scope: project`) |

## seungness 훅 동기화

waveness의 훅 스크립트(`.claude/hooks/`, `.codex/hooks/`)와 훅 등록(`.claude/settings.json`, `.codex/hooks.json`의 `hooks`)은 개인 범용 하네스 seungness의 같은 경로와 양방향으로 주고받는다. 프로젝트는 이 동기화에 직접 참여하지 않고, waveness를 거쳐 받는다. 서버의 격리 체크아웃에서 처리하므로 로컬에 seungness가 없어도 동작한다.

| 구분 | 내용 |
| --- | --- |
| 대상 | waveness `harness/.claude/hooks/`·`harness/.codex/hooks/`와 `.harness/upstream-paths`에 등록한 공용 검사기·자동 수정기·에디터 확장 ↔ seungness `harness/` 같은 경로 |
| 제외 | waveness 루트 `.harness/upstream-paths`의 `!` 줄. 프런트엔드·feature-team 전용 훅, waveness에서 쓰지 않는 seungness 전용 훅과 그 훅을 가리키는 등록은 양방향 모두 주고받지 않음. 커밋 형식 훅(`enforce-commit-msg-style.sh`·`block-attribution-trailers.sh`)은 차단 메시지가 각 허브의 커밋 스킬(waveness `itd-commit`, seungness `git-commit`)을 가리키도록 따로 두므로, 검사 로직을 고치면 두 저장소에 각각 반영 |
| 등록 | `hooks` 키만 등록 항목(이벤트·matcher·명령) 단위로 병합. 한쪽의 추가·삭제가 다른 쪽에 반영되고, `permissions`·`env` 등 나머지 설정은 각 저장소가 따로 가짐 |
| 상태 | waveness 루트 `.harness/upstream.json`의 `synced`(마지막으로 맞춘 seungness 커밋) |

- 시점: waveness `Harness Sync` Actions의 정기 실행·허브 변경 push·수동 실행.
- 병합: 기존 `synced` 시점의 seungness 파일을 기준으로 3-way 병합한다. 같은 줄을 다르게 바꾼 충돌이 하나라도 있으면 PR 내용을 적용하지 않고 실행 실패로 기록한다. 훅 등록은 공유 항목만 병합하고 나머지 설정은 각자 유지한다.
- 반영: seungness에 올릴 변경이 있으면 seungness 업데이트 PR부터 생성한다. 그 PR이 병합된 뒤 다음 실행에서 waveness 업데이트 PR과 `upstream.json` 갱신을 준비한다. 기준점은 원격 main에서 조회할 수 있는 커밋만 가리킨다.
- 두 허브 모두 생성기로 루트 훅 등록을 다시 만들고 CI로 원본과 일치를 검사한다. 현재 사용자 체크아웃이나 원격 main에 직접 push하지 않는다.

## 공용 회귀 검사

`.harness/*.test.mjs`와 함께 쓰는 검사기·Biome 플러그인은 `.harness/` 동기화 대상에 포함된다. 허브 pre-commit과 연결 프로젝트의 `check-scope.sh`는 공용 테스트 전체를 실행한다. 수동 검증은 `node --test .harness/*.test.mjs`로 실행한다(허브: `node --test bin/*.test.mjs harness/.harness/*.test.mjs`).

명세의 필수 절·팀 통신·메타데이터, Claude·Codex 짝 일치, 훅 정상·위반 입력, Codex 어댑터, Git 인덱스 기반 소스·문서 검사기를 검증한다. 모델 선택은 프로젝트마다 다르므로 특정 모델 이름 대신 필수 메타데이터 형식을 검사한다. Stop 판정 CLI는 고정 응답으로 대체하며 실제 LLM 품질은 검증하지 않는다.

한글 테스트 제목의 Biome 플러그인은 `.harness/korean-test-titles.grit`로 배포한다. Biome를 사용하는 프로젝트는 설정의 `plugins`에 `./.harness/korean-test-titles.grit`를 등록한다. 회귀 테스트는 해당 프로젝트의 `node_modules/.bin/biome`로 실행하며 Biome가 없으면 사유를 표시하고 건너뛴다. 공용화 과정에서 프로젝트의 패키지나 린트 설정을 덮어쓰지 않는다.

소스·문서 검사기는 `.harness/check-*.sh`와 `.harness/check-comment-line-breaks.mjs`로 배포한다. 주석 훅은 프로젝트 `scripts/` 검사기를 우선하고, 없으면 공용 검사기를 사용한다. Git 인덱스 검사기의 lint-staged 연결 여부는 프로젝트가 정한다. 작성자 강제·프로젝트 병합 정책·React Doctor·Tailwind·admin 및 UI 컴포넌트 검사는 프로젝트 소유로 유지한다.


### 문장 사이 빈 줄 검사

Biome를 사용하는 프로젝트의 공용 lint 진입점은 다음과 같다. 프로젝트에 설치된 Biome와 TypeScript를 사용하며 추가 패키지는 설치하지 않는다.

```bash
node .harness/biome-check.mjs check . --error-on-warnings
node .harness/biome-check.mjs check --write .
```

- 블록·함수·클래스·인터페이스·열거형 선언 뒤와 `return` 앞에 다음/이전 문장이 있으면 빈 줄을 요구한다.
- 변수 선언과 실행 코드 사이, 여러 줄짜리 변수 선언 앞뒤에도 빈 줄을 요구한다. 연속된 한 줄 변수 선언은 묶어서 쓸 수 있다.
- 기준은 [Airbnb의 블록 뒤 빈 줄 규칙](https://github.com/airbnb/javascript#whitespace)과 [ESLint Stylistic의 문장 구분 규칙](https://eslint.style/rules/padding-line-between-statements)이다. 여러 줄 선언의 앞뒤 구분은 긴 선언이 이어지는 코드를 위한 공용 정책이다. 의미에 따른 상태 그룹 분리는 직접 작성한다.
- TypeScript 구문 트리의 인접 문장을 검사한다. 문자열·템플릿·JSX 본문은 수정하지 않고, 설명 주석은 다음 문장에 붙여 둔다. 기존 빈 줄은 삭제하지 않는다.
- Biome가 성공한 뒤 `--verbose`의 실제 처리·수정 파일 목록에 있는 JS·TS 파일만 검사한다. Biome의 includes·제외·Git ignore·파일 경로·`--staged`·`--changed` 선택 결과를 그대로 따른다. 목록 형식을 해석할 수 없거나 TypeScript를 불러올 수 없으면 실패한다.
- `check`·`lint`·`format`·`ci`를 지원하며 `--write` 또는 `--fix`에서 빈 줄을 자동 수정한다. reporter 모드는 지원하지 않는다. Biome가 먼저 실패하면 빈 줄 검사도 실행하지 않으므로 Biome 오류를 해결하고 다시 실행한다.
- 새 연결의 기본 lint와 기존 `.harness/checks.json`의 일반적인 `biome`·`pnpm exec biome`·`npm exec -- biome`·`npx biome` 명령은 공용 pre-commit·CI에서 이 실행기를 사용한다. Claude·Codex의 커밋 전 검사도 공용 실행기를 사용한다. 프로젝트 설정 파일 자체는 덮어쓰지 않는다.
- 터미널의 `biome` 직접 실행과 에디터의 Biome 확장은 이 검사기를 호출하지 않는다. 프로젝트 `package.json`의 lint·수정 명령에도 위 진입점을 연결해야 함께 실행된다. 저장 시 수정은 아래 공용 확장이 담당한다. 실행기와 검사기는 `.harness/` 동기화로 배포한다.

검증은 `node --test .harness/statement-spacing.test.mjs`로 실행한다. 앱 의존성이 없는 허브에서는 `HARNESS_TEST_PROJECT=/설치된/프로젝트 node --test harness/.harness/statement-spacing.test.mjs`로 실제 Biome·TypeScript를 사용한다. 의존성이 없으면 해당 검증은 사유와 함께 건너뛴다.

### 저장·에이전트 편집 후 자동 수정

- VS Code/Cursor용 `Seungness Save Format` 확장은 저장 직전의 문서 버퍼를 공용 수정기로 전달한다. 프로젝트에 `.harness/biome-check.mjs`와 설치된 Biome·TypeScript가 있어야 한다. 확장은 신뢰한 로컬 작업 공간의 JS·TS 파일에서만 활성화한다.
- 아래 명령으로 로컬 VSIX를 만들고 사용하는 에디터에 한 번 설치한다. 패키징에는 시스템 `zip`이 필요하며 에디터 설정 파일을 변경하지 않는다. Cursor는 `code` 대신 `cursor`를 사용한다. 확장은 프로젝트 수정기를 호출하므로 이후 검사 규칙은 하네스 동기화로 업데이트된다.

```bash
node .harness/package-editor.mjs /tmp/seungness-save-format.vsix
code --install-extension /tmp/seungness-save-format.vsix
```

- 확장은 `onWillSaveTextDocument`의 `waitUntil`로 수정 결과를 버퍼에 적용한다. Biome 포맷·안전한 린트 수정·문장 간격 보정을 함께 수행하며 디스크를 직접 덮어쓰지 않는다. 에디터의 기존 Biome 포맷 설정과 별개로 동작한다.
- 수정 중 문서 버전이 바뀌거나 1초 제한을 넘거나 수정에 실패하면 결과를 적용하지 않고 출력 채널과 상태 표시줄에 알린다. VS Code 자체도 저장 훅 전체에 1.5초 제한을 두며 종료 중 저장 등에는 훅을 생략할 수 있으므로 커밋·CI 검사는 유지한다.
- `check --write --stdin-file-path=경로`는 입력 문서를 받아 수정된 코드만 stdout으로 반환한다. Biome의 실제 파일 선택을 먼저 확인하고 macOS 심볼릭 경로를 정규화해 제외 파일을 보존한다. 아직 디스크에 없는 파일은 원문을 반환하므로 최초 저장 이후부터 자동 수정을 적용한다.
- Claude·Codex의 성공한 `Edit`·`Write`·`MultiEdit`·`apply_patch` 뒤에는 `.harness/auto-format.mjs`가 지정된 파일만 수정한다. 패치의 중복 경로·이동·삭제를 구분하고, 프로젝트 밖 경로·심볼릭 링크 탈출·동시 변경을 거부한다. 수정된 경로를 에이전트에 알려 다음 편집 전에 현재 내용을 읽게 한다. 셸 명령으로 생성·수정한 파일은 자동 추출하지 않는다.
- 저장 훅과 편집 후 훅은 Git 인덱스를 수정하지 않는다. 커밋·CI는 기존처럼 검사만 수행한다. 연결 프로젝트는 새 하네스를 받은 뒤 적용되며, 에디터 확장은 사용자 환경에 별도로 설치한다.

회귀 검사는 `.harness/auto-format.test.mjs`와 `.harness/editor.test.mjs`다. `.harness/editor-host.cjs`는 별도 임시 프로필·작업 공간에서 VS Code의 `--extensionDevelopmentPath`·`--extensionTestsPath`로 실행하는 실제 저장 검증용이며 일반 Node 테스트에는 포함하지 않는다. 저장 API의 동작·제한은 [VS Code API](https://code.visualstudio.com/api/references/vscode-api#workspace.onWillSaveTextDocument)를 따른다.


## 공용 pre-commit·CI 계약

2026-10-29: 프로젝트마다 누락되거나 다른 Git 검사 진입점을 공용 검사기로 통일.

- `.husky/pre-commit`은 `.harness/pre-commit.mjs` 하나를 호출하며 두 경로를 함께 동기화한다. 프로젝트의 `prepare: husky`가 새 체크아웃에서 Git 훅을 활성화한다.
- 프로젝트별 명령은 `.harness/checks.json`에 둔다. 이 파일은 프로젝트 소유로 제외하며 공용 업데이트가 덮어쓰지 않는다. `lint`·`typecheck`는 필수 명령 배열이다. `extra`는 `{ "command": ["pnpm", "run", "knip"] }` 형식으로 기존 추가 검사를 순서대로 보존한다. lint-staged·React Doctor처럼 스테이징이 필요한 항목에만 `"staged": true`를 지정한다. 일반 검사·테스트에는 Git 저장소 선택 환경을 전달하지 않는다.
- `lint`에는 Biome `--error-on-warnings` 또는 ESLint `--max-warnings 0`을 명시한다. 도구·설정·필수 명령이 없거나 하나라도 실패하면 중단한다. 경고를 허용하는 기존 package script를 대신 실행하지 않는다.
- `identity: { "name": "...", "email": "..." }`는 로컬 커밋에서 Git 설정과 실제 author ident를 확인한다. CI의 서비스 계정에는 이 로컬 제한을 적용하지 않으며 자동 PR의 작성자·출처 검증은 기존 서버 병합 조건을 유지한다.
- 로컬은 현재 스테이징을 사용한다. CI는 `HARNESS_BASE_SHA`를 기준으로 임시 Git HEAD·인덱스를 만들고 같은 검사기를 `--ci`로 실행한다. 스테이징 기반 추가 검사도 실제 PR 변경을 검사하며 검사 도중 작업 파일을 수정하면 실패한다. 원래 저장소의 HEAD·인덱스는 변경하지 않는다.
- 새 연결은 `register`에서 공용 훅·기본 설정을 준비한다. 기존 pre-commit이 다르면 자동 덮어쓰지 않고 중단한다. 기존 검사를 설정으로 옮겨 검토한 후에만 `node .harness/install-checks.mjs --replace-reviewed-hook --activate`로 전환한다. 설치 후 `verify-connection`은 원격 훅·검사 설정도 확인한다.
- 허브는 `.githooks/pre-commit`과 Actions에서 `node harness/.harness/pre-commit.mjs`를 호출한다. package.json이 없는 허브는 프로젝트 앱 검사의 대상이 아니며 기존 `bin/*.test.mjs`·공용 하네스 테스트 전체를 실행한다.
- 세션 시작은 업데이트 안내만 수행한다. 검사 실패는 PR 병합을 차단하며 기존 회사 프로젝트의 수동 병합 정책을 바꾸지 않는다.
