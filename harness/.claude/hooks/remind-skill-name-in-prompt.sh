#!/bin/sh
# UserPromptSubmit 훅: 사용자 메시지에 설치된 스킬 폴더명이 하이픈형/공백형으로
# 등장하면, 그 이름이 스킬 트리거일 수 있다는 리마인더를 컨텍스트에 추가한다.
# 실제로 Skill 도구를 호출했는지는 사후에도 검증하지 못한다 - 스킬명을
# 서술어로 오독하는 빈도를 줄이는 넛지일 뿐이다.

input=$(cat)
prompt=$(printf '%s' "$input" | jq -r '.prompt // empty' 2>/dev/null)
[ -n "$prompt" ] || exit 0

skills_dir="$CLAUDE_PROJECT_DIR/.claude/skills"
[ -d "$skills_dir" ] || exit 0

matched=''
for d in "$skills_dir"/*/; do
  [ -d "$d" ] || continue
  name=$(basename "$d")
  spaced=$(printf '%s' "$name" | tr '-' ' ')
  case "$prompt" in
    *"$name"*|*"$spaced"*)
      case " $matched " in
        *" $name "*) ;;
        *) matched="$matched $name" ;;
      esac
      ;;
  esac
done

if [ -n "$matched" ]; then
  echo "프롬프트에 설치된 스킬명이 포함되어 있습니다:$matched - 이번 턴에 해당 스킬을 Skill 도구로 호출했는지 확인할 것(일반 서술어로 오독하지 않았는지 재확인)."
fi

exit 0
