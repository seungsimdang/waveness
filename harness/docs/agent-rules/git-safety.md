# git 작업 안전 수칙

`AGENTS.md`의 "고위험 행동 차단"(git commit/push/파일 삭제는 명시적 승인 필요, 파괴적/비가역적 작업 금지)을 대화 중 다짐이 아니라 `git-safety-guard.sh`(PreToolUse Bash 훅, Claude·Codex 공통)로 기계적으로 강제한다.

## 차단 대상

- 프로세스 이름 기준 일괄 종료: `pkill`, `killall` - 사용자가 띄운 dev 서버까지 종료됨. 직접 띄운 서버만 PID나 포트(`kill $(lsof -ti tcp:<port>)`)로 종료
- `git reset --hard`, `git clean -f/-d/-x`, `git branch -D`, 경로 미지정 `git checkout -- .`
- bare `git stash`, `git stash pop` - worktree 사이 공유 스택이라 다른 세션 것을 건드릴 수 있음
- 다른 linked worktree가 살아 있을 때 메인 체크아웃에서 브랜치 생성(`git checkout -b`, `git switch -c`)
- 허브 `.harness/projects.json`에서 `manualMerge: true`로 지정한 저장소의 PR 병합(`gh pr merge`, `gh api .../pulls/N/merge`). 사람이 직접 병합하라는 표시라 예외 없이 막고, 저장소를 변수로 넘겨 판정할 수 없는 병합도 막음(`block-manual-merge-repo.sh`)

되돌릴 수 없거나, 다른 작업 중인 변경사항까지 함께 지울 수 있는 명령이라 사용자 승인 없이 실행하지 않는다.

## 병렬 작업

- 작업 시작 전 `git worktree list`와 `git status`로 다른 세션의 흔적(살아 있는 worktree, 자신이 만들지 않은 미커밋 변경)을 확인한다. 흔적이 있으면 원인을 확인하기 전에 넘어가지 않는다.
- 자신이 수정한 파일만 경로를 명시해 다룬다. 작업 트리 전체를 되돌릴 필요가 있다고 판단되면 직접 실행하지 말고 사용자 승인을 받는다.
- 구현 subagent를 worktree로 격리할 때는 `Agent(isolation: "worktree")`로 스폰하고, orchestrator 자신은 worktree에 들어가지 않는다(`orchestrator-no-worktree.sh`).

## subagent 격리와 결과 회수

`require-isolation-when-dirty.sh`가 아래 1·2번을 강제한다. Codex는 subagent 격리 옵션이 문서화돼 있지 않아 이 절은 Claude에만 적용한다.

1. 파일을 고칠 수 있는 subagent(정의 `tools`에 Edit·Write·NotebookEdit·Bash가 있거나 `tools`가 없는 역할, 이름이 알려지지 않은 내장 에이전트)는 `Agent(isolation: "worktree")`로만 스폰한다. 읽기 전용 역할(`Explore`, `Plan`, `claude-code-guide`, `web-fetch`, 쓰기 도구 없는 정의)은 격리하지 않아도 된다.
2. 격리 worktree는 `.claude/settings.json`의 `worktree.baseRef: "head"`에 따라 커밋된 HEAD에서 만들어지고 미커밋 변경은 빠진다. 스폰 전에 자신의 작업 변경을 브랜치의 작업 커밋에 `git commit --amend --no-edit`로 합쳐 메인 트리를 비운다. 작업 커밋이 아직 없으면 `itd-commit`으로 첫 커밋 승인을 먼저 받는다. 자신이 만들지 않은 변경은 커밋하지 않고 사용자에게 보고한다.
3. 격리된 subagent는 worktree 안에서 커밋하지 않는다. 시작할 때 `pnpm install --frozen-lockfile --prefer-offline`처럼 프로젝트 설치 명령을 먼저 실행한다(worktree에는 `node_modules`가 없음). dev 서버는 메인 세션과 겹치지 않는 포트를 쓴다.
4. 완료 알림의 `worktreePath`에서 변경을 회수한다: `git -C <worktreePath> add -A && git -C <worktreePath> diff --cached --binary | git apply --index`. 적용이 실패하면 메인 트리를 건드리지 않고 사용자에게 보고한다.
5. 회수 후 `git worktree remove --force <worktreePath>`와 `git branch -d <worktreeBranch>`로 정리한다. 3번 규칙대로 커밋이 없으면 `-d`로 지워지며, 지워지지 않으면 강제 삭제하지 않고 보고한다.
6. `.claude/worktrees/`는 `.gitignore`에 넣는다(`.gitignore`는 공용 동기화 대상이 아니라 프로젝트마다 추가).

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
