#!/bin/sh
# PreToolUse(Edit|Write|NotebookEdit, 파일 쓰는 Bash) 훅(차단): 하네스 파일을 harness-lab 절차 없이 고치는 것을 막음
# 대상은 .harness/paths의 동기화 대상 경로(`!` 제외 줄 반영), worktree 안 경로도 저장소 기준 경로로 바꿔 판정
# 통과: 청사진 이후 승인된 작업 경로·변경 전 파일 해시·편집 내용 해시가 모두 일치함
# Bash는 쓰기 명령 패턴에 걸리고 명령에 하네스 경로가 들어 있을 때만 판정
# transcript를 읽지 못하면 하네스 편집을 차단하고 조회·진단은 허용

input=$(cat)

printf '%s' "$input" | python3 -c '
import json, os, re, sys

BASH_WRITE = re.compile(
    r"\bsed\s+(-\w+\s+)*-i|(^|[^0-9&>])>>?\s*(?!&|/dev/null)[\w\"\x27./$~-]|\btee\b|(^|[\s;&|(])(cp|mv|rm|mkdir|touch)\s"
    r"|open\([^)]*[\"\x27][wa]|\.(write|write_text|write_bytes)\s*\(|writeFileSync|\bgit\s+(apply|checkout|restore|rm|mv)\b"
)

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)

if data.get("hook_event_name") != "PreToolUse" or data.get("agent_id"):
    sys.exit(0)

root = os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or os.getcwd()

try:
    with open(os.path.join(root, ".harness/paths"), encoding="utf-8") as paths:
        rules = [line.strip() for line in paths if line.strip() and not line.startswith("#")]
except OSError:
    sys.exit(0)

include = [r for r in rules if not r.startswith("!")]
exclude = [r[1:] for r in rules if r.startswith("!")]

def relative(path):
    path = os.path.relpath(os.path.join(root, path), root) if not os.path.isabs(path) else os.path.relpath(path, root)
    # worktree 안 파일은 저장소 기준 경로로 판정
    parts = path.split(os.sep)
    if parts[:2] == [".claude", "worktrees"] and len(parts) > 3:
        path = os.sep.join(parts[3:])
    return path

def hits(rule, path):
    return path.startswith(rule) if rule.endswith("/") else path == rule

def harness(path):
    return any(hits(r, path) for r in include) and not any(hits(r, path) for r in exclude)

tool = data.get("tool_name")
args = data.get("tool_input") or {}

if tool == "apply_patch":
    targets = [relative(path) for path in re.findall(r"^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$", str(args.get("command") or ""), re.M)]
elif tool == "Bash":
    command = str(args.get("command") or "")
    if not BASH_WRITE.search(command):
        sys.exit(0)
    targets = [relative(t) for t in re.findall(r"[\w./~-]+", command) if "/" in t or "." in t]
else:
    targets = [relative(str(args.get("file_path") or args.get("notebook_path") or ""))]

targets = [t for t in targets if t and harness(t)]
if not targets:
    sys.exit(0)

try:
    with open(data.get("transcript_path") or "", encoding="utf-8") as transcript:
        entries = [json.loads(line) for line in transcript if line.strip()]
except Exception:
    sys.stderr.write("청사진 승인 기록을 읽지 못해 하네스 편집을 차단합니다.\n")
    sys.exit(2)

sys.path.insert(0, os.path.join(root, ".harness"))
from harness_edit_approval import approved_change

if approved_change(entries, root, data, targets):
    sys.exit(0)

sys.stderr.write(
    "하네스 파일(" + ", ".join(sorted(set(targets))) + ")을 harness-lab 절차 없이 고치려 함. "
    "harness-lab 청사진의 전체 경로·before_sha256·edit_sha256을 본문 <harness-plan> 블록이나 계획 파일 참조 <harness-plan-file path=\"절대경로\" sha256=\"파일 해시\"/>로 제시하고 그 청사진 이후 사용자 승인을 받아야 합니다.\n"
)
sys.exit(2)
'
