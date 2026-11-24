#!/bin/sh
# PreToolUse(Edit|Write) 훅(차단): 구현자 subagent가 테스트 파일을 새로 만들거나 테스트 케이스를 늘리는 편집을 막음
# 대상 역할: 훅 입력 agent_type이 frontend-developer, backend-developer, bug-fixer인 호출
# 메인 세션·QA·리뷰어는 통과
# 테스트 경로: 경로 마디에 tests·test·__tests__·e2e가 있거나 파일 이름이 *.test.*·*.spec.*·test_*.py·*_test.py인 파일
# 차단 1: 테스트 경로에 아직 없는 파일을 Write로 만듦(테스트 파일, fixture, 측정 spec 신설)
# 차단 2: 테스트 경로 파일의 편집 뒤 테스트 케이스 수(it·test 호출, def test_)가 편집 전보다 늘어남
# 기존 테스트 삭제·갱신처럼 케이스 수가 같거나 줄어드는 편집은 통과
# Codex는 codex-tool-adapter.mjs가 apply_patch를 Write·Edit 입력으로 나눠 같은 본문 훅으로 판정
# ponytail: Bash 리다이렉트로 만드는 파일은 보지 않음, 우회가 실제로 나오면 git-safety-guard 방식으로 확장

input=$(cat)

printf '%s' "$input" | python3 -c '
import json, os, re, sys

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)

if data.get("agent_type") not in ("frontend-developer", "backend-developer", "bug-fixer"):
    sys.exit(0)

tool = data.get("tool_name")
args = data.get("tool_input") or {}
path = str(args.get("file_path") or "")
if tool not in ("Write", "Edit") or not path:
    sys.exit(0)

parts = re.split(r"[\\/]+", path)
name = parts[-1]
if not (
    any(part in ("tests", "test", "__tests__", "e2e") for part in parts[:-1])
    or re.search(r"\.(test|spec)\.[cm]?[jt]sx?$", name)
    or re.fullmatch(r"test_\w+\.py|\w+_test\.py", name)
):
    sys.exit(0)

CASE = re.compile(r"(?<![\w.$])(?:it|test)(?:\.(?:each|only|skip|concurrent|fixme|fail|todo)\b[^(\n]*)?\s*\(|^\s*(?:async\s+)?def\s+test_", re.M)

def cases(text):
    return len(CASE.findall(text or ""))

full = path if os.path.isabs(path) else os.path.join(data.get("cwd") or ".", path)
if tool == "Write":
    if not os.path.exists(full):
        reason = "테스트 경로에 새 파일(" + path + ")을 만들려 함"
    else:
        try:
            before = open(full, encoding="utf-8").read()
        except OSError:
            sys.exit(0)
        reason = "테스트 케이스를 늘리려 함(" + path + ")" if cases(args.get("content")) > cases(before) else ""
else:
    reason = "테스트 케이스를 늘리려 함(" + path + ")" if cases(args.get("new_string")) > cases(args.get("old_string")) else ""

if not reason:
    sys.exit(0)

sys.stderr.write(
    "차단: 구현자가 " + reason + ". 신규 테스트·fixture·측정 spec은 QA(T09) 담당이고, 구현자는 이번 변경으로 깨진 기존 테스트의 갱신·삭제만 함.\n"
    "필요한 검증은 구현 기록의 \"QA 필요\" 절에 적어 넘기세요.\n"
)
sys.exit(2)
'
