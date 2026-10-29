---
name: waveness-connect
description: 현재 프로젝트를 회사 공용 에이전트 하네스(waveness)에 연결한다. "waveness에 연결해", "공용 하네스 연결", "waveness 하네스 받아와"처럼 프로젝트에 waveness 하네스를 처음 넣고 자동 동기화를 설정하라는 요청에 쓴다. 이미 연결된 프로젝트(.harness/lock.json 있음)의 동기화·수정에는 쓰지 않는다.
---

# 공용 하네스 연결

현재 프로젝트에 waveness `harness/`를 받아 오고, 이후 서버에서 업데이트 PR을 생성하고 검사 후 병합하도록 등록한다. 세션 시작은 업데이트 안내만 수행한다. 규칙 원문은 waveness `README.md`의 "프로젝트 연결"과 `harness/docs/agent-harness/sync.md`다.

## 0. 확인

- 프로젝트 루트에서 실행한다. `.harness/lock.json`이 이미 있으면 연결된 프로젝트이므로 멈추고 알린다.
- waveness 위치: `HARNESS_HUB` 환경 변수, 없으면 프로젝트와 같은 폴더의 `waveness`. 둘 다 없으면 `git clone https://github.com/seungsimdang/waveness.git`으로 프로젝트 옆에 받을지 사용자에게 묻는다.
- 미커밋 변경이 있으면 멈추고 알린다. 다른 세션이 쓰는 체크아웃이면 worktree에서 작업한다.
- 프로젝트 브랜치 규칙(`docs/agent-rules/branch-strategy.md`, push 훅 등)을 읽는다. 통합 브랜치에 병합 커밋만 받는 프로젝트면 feature 브랜치에서 연결하고 병합한다.

## 1. 받기

```bash
node "$HUB/bin/harness.mjs" pull .
```

- 첫 받기는 공통 조상이 없어 기존 하네스 파일마다 충돌 표시가 남는다. 파일별로 정리한다.
  - 내용 전체가 이 프로젝트 것인 파일(작업 기록, 산출물 색인, 프로젝트 이력처럼 공용 템플릿을 채워 쓴 파일)은 프로젝트판을 그대로 두고 `.harness/paths` 끝에 `!경로`로 제외한다.
  - 공용 규칙·절차 변경은 waveness 쪽을 따른다.
  - 스택·경로·명령·도메인·디자인 토큰처럼 이 프로젝트에만 맞는 값은 공용 문서에 남기지 않는다. waveness 쪽을 고르면서 사라지는 프로젝트판 줄은 정리하는 그 자리에서 "옮길 값" 목록에 원문 그대로 모은다. 2단계에서 이 목록을 `project.md`로 옮긴다.
  - 프로젝트에만 있는 기능 변경(훅·규칙 추가)은 살리고, 공용으로 맞으면 연결 후 `Harness-Scope: generic` 커밋으로 올린다고 보고한다.
- 정리 후 `grep -rl '^<<<<<<< '`로 충돌 표시가 남지 않았는지 확인한다.
- `.harness/lock.json`의 `name`이 프로젝트 이름인지 확인한다. worktree에서 받으면 폴더 이름이 들어가므로 고친다.

## 2. 프로젝트 값 채우기

- `docs/agent-rules/project.md`의 빈 항목(스택, 기획·명세 문서, 참고 레퍼런스 저장소, 디렉터리, 검증 명령, 브랜치와 커밋)을 1단계의 "옮길 값" 목록과 `package.json`·설정 파일·기존 규칙 문서에서 채운다. 확인할 수 없는 값은 비워 두고 보고한다.
- 커밋 전에 `git diff`의 삭제 줄(`^-`)을 훑어, 사라진 프로젝트 전용 값이 모두 `project.md`나 제외한 파일에 남아 있는지 대조한다. 빠진 값이 있으면 옮긴다.
- 받기 전에 있던 프로젝트 전용 규칙 파일(`docs/agent-rules/*.md`·`.claude/rules/*.md`, 예: nextjs·react-query·tailwind·project-structure)은 `docs/agent-rules/`로 옮기고 `.claude/rules/`에 링크를 둔 뒤 `project.md`의 규칙 표에 적고 `.harness/paths` 끝에 `!경로` 줄로 제외한다.
- 기존 프로젝트 전용 오케스트레이터·커밋 스킬(예: `monitoring-poc-orchestrator`, `hkmold-commit`)이 공용판(`feature-team-orchestrator`, `itd-commit`)과 겹치면 지우지 말고 목록으로 보고해 사용자가 정한다.
- 통합 브랜치가 develop·main·master가 아니면 `.harness/lock.json`에 `"branch"`를 적는다.

## 3. Git 훅

프로젝트 훅 도구에 맞춰 등록한다. Husky면 `.husky/`, `core.hooksPath`가 있으면 그 폴더, 둘 다 없으면 사용자에게 방식을 묻는다.

- commit-msg: `sh .harness/check-scope.sh "$1"`
- 기존 post-commit·post-merge의 `sh .harness/sync.sh commit`은 호환용이며 새 등록은 필요하지 않음
- 프로젝트 규칙에서 통합 브랜치를 확인한 뒤 `node "$HUB/bin/harness-automation.mjs" register . <통합 브랜치>` 실행. 원격 쓰기 권한·브랜치·서버 인증을 검사하고 허브 프로젝트 목록·프로젝트 검사 워크플로·lock의 명시적 브랜치를 함께 준비.
- 프로젝트와 허브 양쪽 변경을 각각 검증하고 메시지 미리보기·승인 후 커밋·push. 허브 등록만 로컬에 남긴 상태를 연결 완료로 보고하지 않음.
- push 후 `node "$HUB/bin/harness-automation.mjs" verify-connection .` 실행. 원격 등록과 검사 워크플로 확인에 실패하면 미완료로 보고.

기존 훅 파일이 있으면 끝에 줄을 추가한다.

## 4. 검증과 커밋

- 프로젝트의 하네스 테스트와 정적 검사를 실행한다. 받은 파일 때문에 실패하면 원인을 고치고, 고칠 수 없으면 커밋하지 않고 보고한다.
- 커밋 메시지 끝에 `Harness-Scope: sync`를 넣는다. 프로젝트에 Claude·Codex 짝 검사가 있고 한쪽만 바뀐 파일이 있으면 그 검사가 요구하는 사유 줄도 넣는다.
- push는 사용자 확인 후에 한다.

## 5. 보고

- 충돌 파일 수와 정리 기준, `project.md`로 옮긴 값, 동기화에서 제외한 파일, 등록한 훅, 테스트 결과, 커밋 해시, push 여부
- 공용으로 올릴 만한 프로젝트 전용 변경이 있었다면 목록과 추천
