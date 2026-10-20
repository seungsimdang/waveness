// harness/의 Claude·Codex 짝 일치 검사: 역할 본문·설명, 스킬 파일 집합, 훅 등록 파일 존재
// 실행: node --test bin/*.test.mjs
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const H = resolve(dirname(fileURLToPath(import.meta.url)), "../harness");
const read = (path) => readFileSync(join(H, path), "utf8");
const names = (dir, ext) => readdirSync(join(H, dir)).filter((f) => f.endsWith(ext)).map((f) => f.slice(0, -ext.length)).sort();
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );

const roleBody = (body) => body.replaceAll("`CLAUDE.md` · ", "").replaceAll(".claude/skills/", ".agents/skills/").trim();

test("역할은 Claude판과 Codex판의 집합·설명·본문이 같음", () => {
  assert.deepEqual(names(".claude/agents", ".md"), names(".codex/agents", ".toml"));
  for (const role of names(".claude/agents", ".md")) {
    const [, front, ...rest] = read(`.claude/agents/${role}.md`).split(/^---$/m);
    const toml = read(`.codex/agents/${role}.toml`);
    const description = front.match(/^description: (.*)$/m)[1];
    assert.equal(JSON.parse(toml.match(/^description = (".*")$/m)[1]), description, role);
    const body = toml.match(/^developer_instructions = """\n([\s\S]*?)"""$/m)[1];
    // Codex는 CLAUDE.md를 읽지 않아 Claude판에만 있는 참조는 비교에서 뺌
    assert.equal(roleBody(rest.join("---")), roleBody(body), role);
  }
});

test("역할 본문의 도구별 스킬 경로 차이는 허용하되 절차 차이는 구분함", () => {
  const claude = "커밋 전 `.claude/skills/git-commit/SKILL.md`를 읽는다.";
  const codex = "커밋 전 `.agents/skills/git-commit/SKILL.md`를 읽는다.";
  assert.equal(roleBody(claude), roleBody(codex));
  assert.notEqual(roleBody(claude), roleBody(codex.replace("읽는다", "읽지 않는다")));
});

test("스킬은 .claude/skills와 .agents/skills의 파일 집합이 같음", () => {
  const files = (dir) => walk(join(H, dir)).map((f) => relative(join(H, dir), f)).sort();
  assert.deepEqual(files(".claude/skills"), files(".agents/skills"));
});

test("훅 등록이 가리키는 파일이 모두 있음", () => {
  const commands = [
    ...JSON.stringify(JSON.parse(read(".claude/settings.json")).hooks).matchAll(/\.(?:claude|codex|harness)\/[\w/-]+\.(?:sh|mjs)/g),
    ...JSON.stringify(JSON.parse(read(".codex/hooks.json")).hooks).matchAll(/\.(?:claude|codex|harness)\/[\w/-]+\.(?:sh|mjs)/g),
  ].map(([path]) => path);
  assert.ok(commands.length > 0);
  for (const path of commands) assert.ok(existsSync(join(H, path)), path);
});

test("루트 훅 등록은 harness/ 등록을 허브용으로 바꾼 결과와 같음", async () => {
  const { HUB_CONFIGS, hubConfig } = await import("./hub-hooks.mjs");
  for (const file of HUB_CONFIGS) {
    const root = JSON.parse(readFileSync(join(H, "..", file), "utf8"));
    assert.deepEqual(root, hubConfig(file), `${file}: node bin/hub-hooks.mjs로 다시 생성`);
  }
});
