#!/bin/sh
# PostToolUse 훅: 아래 하네스 쌍 중 하나가 Edit/Write되면 짝인 반대쪽 파일의 수정 여부를 확인함
# 아직 손대지 않은 상태(git HEAD와 동일)면 리마인더를 출력함
#   .codex/agents/{role}.toml      <-> .claude/agents/{role}.md, .agents/agents/{role}.md
#   .agents/agents/{role}.md       <-> .claude/agents/{role}.md, .codex/agents/{role}.toml
#   .codex/hooks/{name}.sh         <-> .claude/hooks/{name}.sh
#   .agents/skills/{name}/** <-> .claude/skills/{name}/** (references/ 등 하위 파일 포함)
# 커밋 시점 검사는 프로젝트 pre-commit이 담당하고 이 훅은 세션 중 빠른 넛지 역할

input=$(cat)
file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

case "$file_path" in
  .codex/agents/*.toml|*/.codex/agents/*.toml)
    role=$(basename "$file_path" .toml)
    pair_rels=".claude/agents/$role.md .agents/agents/$role.md"
    ;;
  .agents/agents/*.md|*/.agents/agents/*.md)
    role=$(basename "$file_path" .md)
    pair_rels=".claude/agents/$role.md .codex/agents/$role.toml"
    ;;
  .codex/hooks/*.sh|*/.codex/hooks/*.sh)
    name=$(basename "$file_path" .sh)
    pair_rels=".claude/hooks/$name.sh"
    ;;
  .agents/skills/*|*/.agents/skills/*)
    rel=${file_path##*.agents/skills/}
    pair_rels=".claude/skills/$rel"
    ;;
  *)
    exit 0
    ;;
esac

project_dir="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -n "$project_dir" ] || exit 0
cd "$project_dir" 2>/dev/null || exit 0

for pair_rel in $pair_rels; do
  pair_file="$project_dir/$pair_rel"
  if [ -f "$pair_file" ] && git diff --quiet -- "$pair_rel" 2>/dev/null; then
    echo "$file_path 수정 확인: 짝인 $pair_rel 은(는) 아직 안 바뀐 것으로 보임. 같은 내용이면 그쪽도 함께 반영할 것."
  fi
done

exit 0
