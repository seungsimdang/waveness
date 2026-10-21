# 허브 저장소 작업 규칙

이 저장소에서도 연결된 프로젝트와 같은 하네스를 따른다. 작업 전에 `harness/AGENTS.md`와 `harness/docs/agent-rules/README.md`를 읽고, 그 문서의 경로는 `harness/` 기준으로 읽는다.

- 루트 `.claude/settings.json`·`.codex/hooks.json`은 `node bin/hub-hooks.mjs`로 `harness/`의 등록에서 만든다. 직접 고치지 않고 `harness/` 쪽을 고친 뒤 다시 만든다. 일치는 `bin/spec.test.mjs`가 검사한다.
- 허브는 main에서 직접 작업하고 커밋 후 push한다. 그래서 main 편집을 막는 `check-branch-guard`는 등록하지 않는다.
- 프로젝트 동기화용 `.harness/sync.sh`는 등록하지 않는다. 허브에는 `.harness/lock.json`이 없어 동작하지 않는다.
- 커밋 제목은 기존 이력처럼 `type(scope): 내용` 형식으로 쓴다. ITD 티켓 번호는 쓰지 않는다.
- 그래서 허브 커밋에는 `itd-commit` Skill을 쓰지 않는다(main에서 중단하고 ITD 제목을 강제함). 메시지 미리보기 후 사용자 승인을 받고 커밋하는 절차와 공동 작성자 트레일러 금지는 그대로 따른다.
- 허브에는 `docs/agent-rules/project.md`가 없다(연결 시 `templates/project.md`에서 생성됨). 그 문서를 가리키는 검증 명령은 허브에서 `node --test bin/*.test.mjs`로 대신한다.
