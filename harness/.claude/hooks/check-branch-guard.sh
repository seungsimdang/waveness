#!/bin/sh
# PreToolUse(Edit|Write|MultiEdit) 훅: docs/agent-rules/branch-strategy.md(기본 브랜치 직접
# 작업 금지, hotfix도 예외 없이 별도 브랜치 사용)을 대화 중 다짐이 아니라 기계적으로 강제.
#
# 네트워크 호출(fetch) 없이 로컬 브랜치명만 확인 - origin 대비 뒤처짐(behind) 여부까지
# 검사하려면 매 Edit/Write 호출마다 fetch가 필요해 지연이 생기므로 범위에서 제외.
#
# git repo가 아니거나 브랜치를 알 수 없으면(예: CI, 임시 디렉터리) 판단 불가로 통과.

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

[ -n "$branch" ] || exit 0

case "$branch" in
  main|master)
    echo "차단: main/master에서 직접 파일 편집 금지. git checkout -b feat/ITD-#### (또는 fix/ITD-####)로 브랜치 생성 후 진행하세요. (docs/agent-rules/branch-strategy.md)" >&2
    exit 2
    ;;
esac

exit 0
