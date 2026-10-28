import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
const H = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("공용 소스·문서 검사가 작업 트리 대신 인덱스 내용을 확인한다", () => {
  const fixture = mkdtempSync(join(tmpdir(), "portfolio-git-guards-"));
  const run = (
    command        ,
    args          ,
    expected = 0,
    extraEnv                             = {},
  ) => {
    const result = spawnSync(command, args, {
      cwd: fixture,
      encoding: "utf8",
      env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))), ...extraEnv },
    });
    assert.equal(result.status, expected, `${result.stdout}\n${result.stderr}`);
  };
  try {
    cpSync(join(H, ".harness"), join(fixture, "scripts"), { recursive: true });
    mkdirSync(join(fixture, "src/app"), { recursive: true });
    run("git", ["init", "-q"]);
    run("git", ["config", "user.name", "SeungHyun Lee"]);
    run("git", ["config", "user.email", "oak20005@naver.com"]);
    const source = join(fixture, "src/app/page.tsx");
    writeFileSync(source, 'export const text = "clean";\n');
    run("git", ["add", "src/app/page.tsx"]);
    run("sh", ["scripts/check-em-dash-in-source.sh", "src/app/page.tsx"]);
    run("sh", ["scripts/check-ephemeral-comment-refs.sh", "src/app/page.tsx"]);
    writeFileSync(source, 'export const text = "bad — text";\n');
    run("git", ["add", "src/app/page.tsx"]);
    writeFileSync(source, 'export const text = "clean working tree";\n');
    run("sh", ["scripts/check-em-dash-in-source.sh", "src/app/page.tsx"], 1);
    writeFileSync(
      source,
      '// code-review-1.md\nexport const text = "clean";\n',
    );
    run("git", ["add", "src/app/page.tsx"]);
    run(
      "sh",
      ["scripts/check-ephemeral-comment-refs.sh", "src/app/page.tsx"],
      1,
    );

    const doc = join(fixture, "sample.md");
    writeFileSync(doc, "A complete paragraph.\n");
    run("git", ["add", "sample.md"]);
    run("sh", ["scripts/check-markdown-line-wrap.sh", "sample.md"]);
    writeFileSync(doc, "A paragraph broken\nin the middle.\n");
    run("git", ["add", "sample.md"]);
    run("sh", ["scripts/check-markdown-line-wrap.sh", "sample.md"], 1);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

