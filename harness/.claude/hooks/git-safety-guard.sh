#!/bin/sh
# PreToolUse(Bash) 훅: docs/agent-rules/git-safety.md의 절차를 대화 중 다짐이 아니라 기계적으로 강제
#
# 차단 대상:
#   0) 프로세스 이름 기준 일괄 종료(pkill, killall) - 사용자가 띄운 dev 서버 등 다른 세션의 프로세스까지 종료함
#   1) 파괴적 명령: git reset --hard, git clean(-f/-d/-x), git branch -D, git checkout -- .(경로 미지정)
#   2) bare git stash / git stash pop - worktree 간 공유 스택이라 다른 세션 것을 건드릴 수 있음
#   3) 메인 체크아웃에서 브랜치 생성(git checkout -b / git switch -c) - 다른 linked worktree가 살아 있으면 다른 세션이 쓰는 중일 수 있어 `Agent(isolation:"worktree")` 격리 스폰으로 유도
#
# 이 훅을 우회해야 하는 정당한 사유(예: 사용자가 직접 승인한 destructive 작업)가 있으면, 사용자가 터미널에서 `!<command>`로 직접 실행하거나(에이전트의 Bash 도구를 거치지 않음), 이 훅을 일시적으로 settings.json에서 제거

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)

# 커밋 메시지·heredoc 본문 속 글자를 명령으로 오인하지 않도록 heredoc 본문과 따옴표 문자열을 지운 실행 구문
# ponytail: sh -c "..." 안의 명령도 함께 지워져 통과하지만 이 훅은 실수 방지용이라 허용
exec_cmd=$(printf '%s\n' "$cmd" | awk '
  in_doc { if ($0 ~ "^[ \t]*" delim "[ \t]*$") in_doc = 0; next }
  {
    print
    if (match($0, /<<-?[ \t]*["\047]?[A-Za-z_][A-Za-z0-9_]*["\047]?/)) {
      d = substr($0, RSTART, RLENGTH)
      sub(/^<<-?[ \t]*["\047]?/, "", d); sub(/["\047]$/, "", d)
      delim = d; in_doc = 1
    }
  }' | tr '\n' '\036' | sed -e 's/"[^"]*"//g' -e "s/'[^']*'//g" | tr '\036' '\n')

# 0) 이름 패턴 종료는 git 명령 여부와 무관하게 차단
if printf '%s' "$exec_cmd" | grep -qE '(^|[;&|(]\s*)(pkill|killall)\b'; then
  echo "차단: pkill/killall 금지. 다른 세션이나 사용자가 띄운 프로세스까지 종료됩니다. 직접 띄운 서버는 포트로 지정해 종료하세요: kill \$(lsof -ti tcp:<port>)" >&2
  exit 2
fi

printf '%s' "$cmd" | grep -qE '(^|[;&|]\s*)git\b' || exit 0

deny() {
  echo "차단: $1 (docs/agent-rules/git-safety.md)" >&2
  exit 2
}

# 1) 파괴적 명령
if printf '%s' "$cmd" | grep -qE '\bgit[[:space:]]+reset[[:space:]]+--hard\b'; then
  deny "git reset --hard 금지. 되돌릴 필요가 있으면 orchestrator/사용자에게 상황을 보고하고 승인받아 실행하세요."
fi
if printf '%s' "$cmd" | grep -qE '\bgit[[:space:]]+clean\b[^|;&]*-[a-zA-Z]*[fdx]'; then
  deny "git clean -f/-d/-x 금지. 다른 worktree/세션의 미커밋 변경사항까지 지울 수 있습니다."
fi
if printf '%s' "$cmd" | grep -qE '\bgit[[:space:]]+branch[[:space:]]+(-D|--delete[[:space:]]+--force)\b'; then
  deny "git branch -D 금지. 다른 worktree가 그 브랜치를 쓰고 있을 수 있습니다. 필요하면 사용자 승인을 받으세요."
fi
if printf '%s' "$cmd" | grep -qE '\bgit[[:space:]]+checkout[[:space:]]+(--[[:space:]]+)?\.[[:space:]]*($|[;&|])'; then
  deny "경로 미지정 git checkout -- . 금지. 되돌릴 파일 경로를 구체적으로 지정하세요."
fi

# 2) bare stash / stash pop
if printf '%s' "$cmd" | grep -qE '\bgit[[:space:]]+stash[[:space:]]*($|[;&|])'; then
  deny "bare git stash 금지 - stash 스택은 모든 worktree/세션이 공유합니다. 'git stash push -u -m \"<고유-태그>\"'로 태그를 남기세요."
fi
if printf '%s' "$cmd" | grep -qE '\bgit[[:space:]]+stash[[:space:]]+push\b'; then
  if ! printf '%s' "$cmd" | grep -qE '\-m[[:space:]]'; then
    deny "태그 없는 git stash push 금지 - 'git stash push -u -m \"<고유-태그>\"'로 자신의 항목을 나중에 식별 가능하게 남기세요."
  fi
fi
if printf '%s' "$cmd" | grep -qE '\bgit[[:space:]]+stash[[:space:]]+pop\b'; then
  deny "git stash pop 금지 - 다른 세션이 방금 올린 stash를 팝할 수 있습니다. 'git stash list --format=%H %gs'로 자신의 태그를 찾아 'git stash apply <sha>'를 쓰고, 확인 후 직접 drop하세요."
fi

# 3) 메인 체크아웃에서 새 브랜치 생성 - 다른 linked worktree가 살아 있으면 차단
# 한 체크아웃은 브랜치 하나만 쓰므로 다른 세션이 별도 브랜치에서 작업하려면 worktree가 필요함
# 브랜치 개수(원격·병합 완료 브랜치 포함)는 동시 사용 근거가 아니라서 판정에서 제외
# 디렉터리가 사라진 prunable worktree도 사용 중이 아니므로 제외
if printf '%s' "$cmd" | grep -qE '\bgit[[:space:]]+(checkout[[:space:]]+-b|switch[[:space:]]+-c)\b'; then
  # .git이 디렉터리면 메인 체크아웃, 파일이면(gitdir 참조) linked worktree.
  if [ -d .git ]; then
    worktree_count=$(git worktree list 2>/dev/null | grep -vc ' prunable$')
    if [ "${worktree_count:-1}" -gt 1 ]; then
      deny "메인 체크아웃에서 새 브랜치 생성 시도가 감지됐고, worktree가 메인 포함 ${worktree_count}개 살아 있어 다른 세션이 동시 사용 중일 수 있습니다. orchestrator가 Agent(isolation:\"worktree\")로 격리 스폰한 뒤 그 안에서 브랜치를 만드세요 (subagent가 직접 EnterWorktree를 호출하지 마세요 - 관리형/child 세션에서 실패합니다)."
    fi
  fi
fi

exit 0
