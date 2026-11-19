#!/bin/sh
# PostToolUse 훅: 아래 하네스 쌍 중 하나가 Edit/Write되면 짝인 반대쪽 파일의 수정 여부를 확인함
# 아직 손대지 않은 상태(git HEAD와 동일)면 리마인더를 출력함
#   .claude/agents/{role}.md <-> .codex/agents/{role}.toml, .agents/agents/{role}.md
#   .claude/hooks/{name}.sh  <-> .codex/hooks/{name}.sh
#   .claude/skills/{name}/** <-> .agents/skills/{name}/** (references/ 등 하위 파일 포함)
# 커밋 시점 검사는 프로젝트 pre-commit이 담당하고 이 훅은 세션 중 빠른 넛지 역할

input=$(cat)
file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

case "$file_path" in
  .claude/agents/*.md|*/.claude/agents/*.md)
    role=$(basename "$file_path" .md)
    pair_rels=".codex/agents/$role.toml .agents/agents/$role.md"
    ;;
  .claude/hooks/*.sh|*/.claude/hooks/*.sh)
    name=$(basename "$file_path" .sh)
    pair_rels=".codex/hooks/$name.sh"
    ;;
  .claude/skills/*|*/.claude/skills/*)
    rel=${file_path##*.claude/skills/}
    pair_rels=".agents/skills/$rel"
    ;;
  *)
    exit 0
    ;;
esac

cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0

for pair_rel in $pair_rels; do
  pair_file="$CLAUDE_PROJECT_DIR/$pair_rel"
  if [ -f "$pair_file" ] && git diff --quiet -- "$pair_rel" 2>/dev/null; then
    echo "$file_path 수정 확인: 짝인 $pair_rel 은(는) 아직 안 바뀐 것으로 보임. 같은 내용이면 그쪽도 함께 반영할 것."
  fi
done

exit 0
