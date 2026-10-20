#!/bin/sh
# PostToolUse 훅: 아래 하네스 쌍 중 하나가 Edit/Write되면, 짝인 .claude 쪽 파일이
# 이번 세션에서 이미 존재하는데도 아직 손대지 않은 상태(git HEAD와 동일)면 리마인더를 출력한다.
#   .codex/agents/{role}.toml      <-> .claude/agents/{role}.md
#   .codex/hooks/{name}.sh         <-> .claude/hooks/{name}.sh
#   .agents/skills/{name}/** <-> .claude/skills/{name}/** (references/ 등 하위 파일 포함)
# 커밋 시점 검사는 프로젝트 pre-commit이 있으면 그쪽이 담당하고,
# 이 훅은 세션 중간에 더 빨리 알아차리게 하기 위한 넛지다.

input=$(cat)
file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

case "$file_path" in
  .codex/agents/*.toml|*/.codex/agents/*.toml)
    role=$(basename "$file_path" .toml)
    pair_rel=".claude/agents/$role.md"
    ;;
  .codex/hooks/*.sh|*/.codex/hooks/*.sh)
    name=$(basename "$file_path" .sh)
    pair_rel=".claude/hooks/$name.sh"
    ;;
  .agents/skills/*|*/.agents/skills/*)
    rel=${file_path##*.agents/skills/}
    pair_rel=".claude/skills/$rel"
    ;;
  *)
    exit 0
    ;;
esac

project_dir=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
pair_file="$project_dir/$pair_rel"

if [ ! -f "$pair_file" ]; then
  exit 0
fi

cd "$project_dir" 2>/dev/null || exit 0

if git diff --quiet -- "$pair_rel" 2>/dev/null; then
  echo "$file_path 수정 확인: 짝인 $pair_rel 은(는) 아직 안 바뀐 것으로 보임. 같은 내용이면 그쪽도 함께 반영할 것."
fi

exit 0
