// GUI와 같은 제한된 PATH에서 동기화 셸의 실행 경로·실패 안내 검사
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../harness/.harness/sync.sh"), "utf8");

for (const scenario of ["기존 경로", "Homebrew 보정", "Node.js 없음", "커밋 로그"]) {
  test(`동기화 셸: ${scenario}`, () => {
    const root = mkdtempSync(join(tmpdir(), "sync-shell-"));
    try {
      const bin = join(root, "bin");
      const fallback = join(root, "homebrew");
      for (const dir of [bin, fallback, join(root, ".git")]) mkdirSync(dir);
      writeFileSync(join(bin, "harness.mjs"), "");
      const executable = (file, text) => {
        writeFileSync(file, `#!/bin/sh\n${text}\n`);
        chmodSync(file, 0o755);
      };
      executable(join(bin, "git"), 'case "$2" in --show-toplevel) printf "%s\\n" "$TEST_ROOT" ;; --git-common-dir) printf "%s/.git\\n" "$TEST_ROOT" ;; esac');
      if (scenario === "기존 경로" || scenario === "Homebrew 보정") {
        executable(join(scenario === "기존 경로" ? bin : fallback, "node"), 'printf "%s\\n" "$HARNESS_HOOK_JSON" "$PATH" "$@"');
      }
      // 호스트에 설치된 Node.js와 무관하게 실제 셸의 fallback 분기 검사
      const script = source.replace('/opt/homebrew/bin:/usr/local/bin', fallback);
      const result = spawnSync("/bin/sh", ["-c", script, "sync.sh", scenario === "커밋 로그" ? "commit" : "session"], {
        cwd: root,
        encoding: "utf8",
        env: { PATH: bin, HARNESS_HUB: root, TEST_ROOT: root },
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr, "");
      if (scenario === "Node.js 없음") {
        assert.match(JSON.parse(result.stdout).systemMessage, /동기화 실패: node/);
      } else if (scenario === "커밋 로그") {
        assert.equal(result.stdout, "");
        assert.match(readFileSync(join(root, ".git/harness-sync.log"), "utf8"), /동기화 실패: node/);
      } else {
        const output = result.stdout.trim().split("\n");
        assert.equal(output[0], "1");
        assert.equal(output[1], scenario === "기존 경로" ? bin : `${bin}:${fallback}`);
        assert.deepEqual(output.slice(2), [join(bin, "harness.mjs"), "auto", root, "both"]);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
