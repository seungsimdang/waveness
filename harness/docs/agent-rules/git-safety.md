# git 작업 안전 수칙

`AGENTS.md`의 "고위험 행동 차단"(git commit/push/파일 삭제는 명시적 승인 필요, 파괴적/비가역적 작업 금지)을 대화 중 다짐이 아니라 `git-safety-guard.sh`(PreToolUse Bash 훅, Claude·Codex 공통)로 기계적으로 강제한다.

## 차단 대상

- 프로세스 이름 기준 일괄 종료: `pkill`, `killall` - 사용자가 띄운 dev 서버까지 종료됨. 직접 띄운 서버만 PID나 포트(`kill $(lsof -ti tcp:<port>)`)로 종료
- `git reset --hard`, `git clean -f/-d/-x`, `git branch -D`, 경로 미지정 `git checkout -- .`
- bare `git stash`, `git stash pop` - worktree 사이 공유 스택이라 다른 세션 것을 건드릴 수 있음
- 다른 linked worktree가 살아 있을 때 메인 체크아웃에서 브랜치 생성(`git checkout -b`, `git switch -c`)

되돌릴 수 없거나, 다른 작업 중인 변경사항까지 함께 지울 수 있는 명령이라 사용자 승인 없이 실행하지 않는다.

## 병렬 작업

- 작업 시작 전 `git worktree list`와 `git status`로 다른 세션의 흔적(살아 있는 worktree, 자신이 만들지 않은 미커밋 변경)을 확인한다. 흔적이 있으면 원인을 확인하기 전에 넘어가지 않는다.
- 자신이 수정한 파일만 경로를 명시해 다룬다. 작업 트리 전체를 되돌릴 필요가 있다고 판단되면 직접 실행하지 말고 사용자 승인을 받는다.
- 구현 subagent를 worktree로 격리할 때는 `Agent(isolation: "worktree")`로 스폰하고, orchestrator 자신은 worktree에 들어가지 않는다(`orchestrator-no-worktree.sh`).

## 우회가 필요한 경우

훅은 명령 문자열만 검사하며, 프롬프트에 적은 사유는 읽지 않는다. 우회 방법은 다음 두 가지뿐이다.

- 사용자가 터미널에서 `!<command>`로 직접 실행 (에이전트의 Bash 도구를 거치지 않음)
- 사용자 승인 후 `.claude/settings.json`·`.codex/hooks.json`에서 해당 훅을 일시적으로 제거

## 커밋 메시지 규칙

`enforce-commit-msg-style.sh`(PreToolUse Bash 훅)가 아래를 기계적으로 강제한다. 형식은 `itd-commit` Skill을 따른다.

- 종결어미(`~했다`/`~한다`) 금지, 명사형(`~추가`/`~구현`/`~수정`) 필수
- em-dash 금지, 하이픈(`-`)만 사용
- 본문 임의 줄바꿈 금지 (한 항목은 한 줄로 작성)

`block-attribution-trailers.sh`가 `Co-Authored-By:` 등 공동 작성자 트레일러가 포함된 `git commit` 명령을 차단한다.

## 검사 로직 배치 기준

새 검증 규칙을 추가할 때 어디에 넣을지는 `docs/agent-rules/enforcement-placement.md`를 참고한다.
