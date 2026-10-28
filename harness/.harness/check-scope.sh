#!/bin/sh
# commit-msg 훅: 공용 하네스 동기화 대상(.harness/paths)을 바꾼 커밋에 Harness-Scope 줄을 요구하고, generic 커밋에 대상 밖 파일이 섞이면 차단
# 프로젝트 commit-msg 훅에서 `sh .harness/check-scope.sh "$1"`로 호출
set -eu
msg_file="$1"
root=$(git rev-parse --show-toplevel)
# 첫 커밋은 HEAD가 없어 빈 트리와 비교함
base=$(git rev-parse -q --verify HEAD || git hash-object -t tree /dev/null)
staged=$(git diff --cached --name-only --no-renames "$base")
[ -n "$staged" ] || exit 0

# 줄마다 S(동기화 대상) 또는 P(프로젝트 소유)를 붙임. `/`로 끝나는 줄은 접두 일치, `!` 줄은 제외
classified=$(printf '%s\n' "$staged" | awk -v paths="$root/.harness/paths" '
  BEGIN {
    while ((getline l < paths) > 0) {
      if (l == "" || l ~ /^#/) continue
      if (substr(l, 1, 1) == "!") ex[++ne] = substr(l, 2); else inc[++ni] = l
    }
  }
  function hit(f, p) { return substr(p, length(p)) == "/" ? index(f, p) == 1 : f == p }
  {
    s = 0
    for (i = 1; i <= ni; i++) if (hit($0, inc[i])) s = 1
    for (i = 1; i <= ne; i++) if (hit($0, ex[i])) s = 0
    print (s ? "S " : "P ") $0
  }')
synced=$(printf '%s\n' "$classified" | sed -n 's/^S /  /p')
other=$(printf '%s\n' "$classified" | sed -n 's/^P /  /p')
[ -n "$synced" ] || exit 0

# 배포한 공용 명세·훅 회귀 검사 전체 실행
node --test "$root"/.harness/*.test.mjs >/dev/null 2>&1 || {
  echo "공용 하네스 검사 실패: node --test .harness/*.test.mjs 로 원인을 확인하세요."
  exit 1
}

scope=$(git interpret-trailers --parse "$msg_file" | sed -n 's/^Harness-Scope: *//p' | head -n 1)
case "$scope" in
  project | sync) exit 0 ;;
  generic)
    [ -z "$other" ] && exit 0
    echo "Harness-Scope: generic 커밋에 동기화 대상 밖 파일이 섞였습니다. 공용 변경만 따로 커밋하세요."
    printf '%s\n' "$other"
    exit 1
    ;;
esac
echo "공용 하네스 동기화 대상 파일을 바꿨습니다. 커밋 메시지 끝에 Harness-Scope: generic|project|sync 줄을 넣으세요(기준: docs/agent-harness/sync.md)."
printf '%s\n' "$synced"
exit 1
