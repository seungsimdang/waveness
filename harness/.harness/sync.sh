#!/bin/sh
# SessionStart 훅: 공용 하네스 업데이트 필요 여부만 안내, 현재 작업 저장소 변경 없음
# 인자: session(읽기 전용 상태 안내) | commit(기존 Git 훅과의 호환용, 동작 없음)
# waveness 위치는 HARNESS_HUB, 없으면 프로젝트와 같은 폴더의 waveness
# git 훅이 넘긴 GIT_DIR·GIT_INDEX_FILE이 waveness git 명령을 이 저장소로 향하게 하므로 제거함
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_PREFIX GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES
[ "${1:-}" = commit ] && exit 0
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
hub="${HARNESS_HUB:-$(dirname "$root")/waveness}"
if [ ! -f "$hub/bin/harness-automation.mjs" ]; then
  [ "${1:-}" = session ] && echo "공용 하네스 업데이트 확인 실패: $hub/bin/harness-automation.mjs 없음(허브 업데이트 필요)"
  exit 0
fi

# GUI 훅의 PATH에 Homebrew 경로가 빠진 경우만 보정, 자식 커밋 훅에도 전달
if ! command -v node >/dev/null 2>&1; then
  PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
  export PATH
fi
if ! command -v node >/dev/null 2>&1; then
  if [ "${1:-}" = session ]; then
    echo '{"systemMessage":"공용 하네스 동기화 실패: node를 찾을 수 없습니다. Node.js 설치와 훅 PATH를 확인하세요."}'
  else
    echo "공용 하네스 동기화 실패: node를 찾을 수 없습니다. Node.js 설치와 훅 PATH를 확인하세요." >>"$(git rev-parse --git-common-dir)/harness-sync.log"
  fi
  exit 0
fi

case "${1:-}" in
  session) HARNESS_HOOK_JSON=1 node "$hub/bin/harness-automation.mjs" status "$root" ;;
  commit)
    # origin에 반영된 generic 변경은 서버의 정기 실행에서 PR 생성
    :
    ;;
esac
exit 0
