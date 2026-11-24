"""훅 LLM 판정기 명령 단일 정의

런타임별 개별 판정기: Claude는 claude, Codex는 codex, Antigravity는 agy, effort는 모두 medium
런타임은 HARNESS_RUNTIME(Antigravity 어댑터가 antigravity로 지정)을 우선하고, 없으면 훅 사본 위치나 transcript 위치가 .codex면 codex, 그 밖은 claude로 정함
고른 판정기가 실패해도 다른 판정기로 넘어가지 않음, 실패 처리는 호출한 훅이 정함
STOP_JUDGE_BIN은 테스트용 가짜 판정기, 판정 입력은 표준입력으로 전달
"""

import os

AGY_TIMEOUT = "40s"


def runtime(script_path="", transcript_path=""):
    if os.environ.get("HARNESS_RUNTIME") == "antigravity":
        return "antigravity"
    # Codex가 .claude 사본을 등록한 훅도 있어 Codex 세션 transcript 위치(~/.codex/sessions)를 함께 봄
    if "/.codex/" in os.path.abspath(script_path) or "/.codex/sessions/" in str(transcript_path or ""):
        return "codex"
    return "claude"


def judge_command(kind, prompt, output_path):
    """(명령, 표준입력) 반환. codex만 output_path에 결과를 씀"""
    custom = os.environ.get("STOP_JUDGE_BIN")
    if custom:
        return [custom], prompt
    if kind == "codex":
        return [
            "codex", "exec", "-m", "gpt-6-luna", "-c", "model_reasoning_effort=\"medium\"", "--disable", "hooks",
            "-s", "read-only", "--skip-git-repo-check", "--ephemeral", "--color", "never", "-o", output_path, "-",
        ], prompt
    if kind == "antigravity":
        # agy print 모드는 프롬프트를 인자로 받음
        return [
            "agy", "--disable-slash-commands", "--output-format", "text", "--sandbox", "--print-timeout", AGY_TIMEOUT,
            "--model", "gemini-4-hydrogen-medium", "--effort", "medium", "-p", prompt,
        ], None
    return [
        "claude", "-p", "--safe-mode", "--model", "haiku", "--effort", "medium", "--tools", "", "--no-session-persistence",
    ], prompt
