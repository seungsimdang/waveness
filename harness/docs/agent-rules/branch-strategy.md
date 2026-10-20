# 브랜치 전략

## 트랙

- **통합 브랜치**: `develop`. 프로젝트가 다른 브랜치를 쓰면 `docs/agent-rules/project.md`와 `.harness/lock.json`의 `branch`에 적는다.
- **작업 브랜치**: `feat/ITD-####` · `fix/ITD-####`. ITD 티켓 번호 필수, 통합 브랜치에서 분기한다.
- `chore/`·`refactor/` 등 전례 없는 prefix를 임의로 만들지 않는다. 프로젝트가 따로 허용한 prefix(예: 긴급 수정용)는 `project.md`에 적는다.

## 규칙

- 기본 브랜치(`main`·`master`·통합 브랜치)에서 직접 파일을 편집하지 않는다. hotfix도 예외 없이 별도 브랜치를 쓴다. `check-branch-guard.sh`가 `main`·`master` 편집을 차단한다.
- 티켓 번호가 없으면 브랜치명을 짓지 않고 사용자에게 티켓 번호 또는 브랜치명을 묻는다.
- 작업 브랜치는 PR로 통합 브랜치에 병합한다. 병합·push는 사용자가 지시할 때만 한다.
- 커밋 메시지와 1 branch 1 commit 여부는 `itd-commit` Skill과 `project.md`의 커밋 절을 따른다.
- 병렬 Agent·worktree 작업은 `git-safety.md`를 따른다.
