#!/bin/sh
# SessionStart(startup)·post-commit·post-merge 훅: 공용 하네스(waveness)와 양방향 자동 동기화(안내만, 차단 없음)
# 인자: session(받기+올리기, 결과를 세션 맥락으로, 실패는 systemMessage로 화면에도 출력) | commit(올리기만, 백그라운드 실행 후 .git/harness-sync.log에 기록)
# waveness 위치는 HARNESS_HUB, 없으면 프로젝트와 같은 폴더의 waveness
# git 훅이 넘긴 GIT_DIR·GIT_INDEX_FILE이 waveness git 명령을 이 저장소로 향하게 하므로 제거함
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_PREFIX GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
hub="${HARNESS_HUB:-$(dirname "$root")/waveness}"
if [ ! -f "$hub/bin/harness.mjs" ]; then
  [ "${1:-}" = session ] && echo "공용 하네스 동기화 건너뜀: $hub/bin/harness.mjs 없음(HARNESS_HUB로 위치 지정)"
  exit 0
fi

case "${1:-}" in
  session) HARNESS_HOOK_JSON=1 node "$hub/bin/harness.mjs" auto "$root" both ;;
  commit)
    # generic 커밋이 아니면 node를 띄우지 않고 끝냄. 병합 커밋은 병합된 generic 커밋을 올려야 해서 통과
    if [ "$(git rev-list --parents -n 1 HEAD | wc -w)" -le 2 ] &&
      ! git log -1 --format='%(trailers:key=Harness-Scope,valueonly)' | grep -qx generic; then
      exit 0
    fi
    log="$(git rev-parse --git-common-dir)/harness-sync.log"
    # 커밋을 기다리게 하지 않으려고 백그라운드로 실행. 실패는 다음 세션 시작 때 다시 시도됨
    (date '+%F %T' && node "$hub/bin/harness.mjs" auto "$root" push 2>&1) >>"$log" &
    ;;
esac
exit 0
