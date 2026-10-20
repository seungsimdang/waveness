// harness/.claude/hooks/judge-unverified-claims.sh 검사: 판정 입력 구성, 차단 출력, 턴별 차단 상한, 판정기 실패 통과
// 판정기(claude -p)는 STOP_JUDGE_BIN 가짜 스크립트로 바꿔 받은 프롬프트를 파일로 남기고 정해진 판정을 출력함
// 실행: node --test bin/*.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HOOK = resolve(dirname(fileURLToPath(import.meta.url)), "../harness/.claude/hooks/judge-unverified-claims.sh");

function setup(verdict, { result = "742257b chore", answer = "작업했습니다." } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "judge-"));
  const judge = join(dir, "judge.sh");
  writeFileSync(judge, `#!/bin/sh\ncat > "${dir}/prompt.txt"\nprintf '%s' '${verdict}'\n`);
  chmodSync(judge, 0o755);
  const transcript = join(dir, "t.jsonl");
  writeFileSync(transcript, [
    { type: "user", uuid: "u1", message: { content: "첫 질문은?" } },
    { type: "assistant", message: { content: [{ type: "tool_use", input: { command: "git log" } }] } },
    { type: "user", message: { content: [{ type: "tool_result", content: result }] } },
    { type: "attachment", attachment: { type: "queued_command", prompt: "작업 중 질문은?" } },
  ].map((e) => JSON.stringify(e)).join("\n"));
  const run = () => spawnSync("sh", [HOOK], {
    input: JSON.stringify({ session_id: "s", transcript_path: transcript, last_assistant_message: answer }),
    env: { ...process.env, STOP_JUDGE_BIN: judge, TMPDIR: dir, HARNESS_STOP_JUDGE: "" },
    encoding: "utf8",
  });
  return { dir, run };
}

test("판정기에 턴 시작·작업 중 사용자 메시지, 도구 기록, 응답을 넘기고 차단 판정은 턴당 2회까지 block으로 출력", () => {
  const { dir, run } = setup('{"ok": false, "reason": "질문에 답하지 않음"}');
  assert.deepEqual(JSON.parse(run().stdout), { decision: "block", reason: "질문에 답하지 않음" });
  const prompt = readFileSync(join(dir, "prompt.txt"), "utf8");
  assert.match(prompt, /\[사용자 메시지\]\n첫 질문은\?\n---\n작업 중 질문은\?/);
  assert.match(prompt, /\[도구 결과\] 742257b chore/);
  assert.match(prompt, /\[마지막 응답\]\n작업했습니다\./);
  assert.equal(JSON.parse(run().stdout).decision, "block");
  assert.equal(run().stdout, "");
});

test("통과 판정과 해석할 수 없는 판정기 출력은 막지 않음", () => {
  assert.equal(setup('{"ok": true}').run().stdout, "");
  assert.equal(setup("error").run().stdout, "");
});

test("긴 도구 결과는 앞부분과 함께 응답이 인용한 파일명이 든 뒷부분 줄을 넘김", () => {
  const result = `${"x".repeat(2000)}\nother.txt:1: 무관한 줄\nhooks/judge.sh:124: --model haiku`;
  const { dir, run } = setup('{"ok": true}', { result, answer: "`judge.sh:124`에 인자가 있습니다." });
  run();
  const prompt = readFileSync(join(dir, "prompt.txt"), "utf8");
  assert.match(prompt, /응답이 인용한 이름이 든 줄\.\.\.\]\nhooks\/judge\.sh:124: --model haiku/);
  assert.doesNotMatch(prompt, /무관한 줄/);
});
