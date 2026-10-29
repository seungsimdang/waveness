import { spawnSync } from "node:child_process";
import { existsSync, cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
const H = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// biome를 순차로 여러 번 실행해 병렬 실행 시 기본 5초를 넘겨 개별 상한을 둠
test("한글 제목은 허용하고 플러그인이 영문 설명과 동적 제목을 차단한다", {
  timeout: 15_000,
  skip: !existsSync(join(H, "node_modules/.bin/biome")) && "프로젝트에 Biome가 설치되지 않음",
}, () => {
  const fixture = mkdtempSync(join(tmpdir(), "portfolio-test-titles-"));
  try {
    cpSync(join(H, ".harness/korean-test-titles.grit"), join(fixture, "titles.grit"));
    writeFileSync(
      join(fixture, "biome.json"),
      JSON.stringify({
        plugins: ["./titles.grit"],
        linter: { rules: { recommended: false } },
        formatter: { enabled: false },
      }),
    );
    const check = (body        , expected = 0) => {
      const file = join(fixture, "fixture.spec.ts");
      writeFileSync(file, body);
      const result = spawnSync(
        join(H, "node_modules/.bin/biome"),
        ["lint", `--config-path=${fixture}`, file],
        { encoding: "utf8" },
      );
      assert.equal(result.status, expected, `${body}\n${result.stdout}\n${result.stderr}`);
      if (expected) assert.match(result.stderr, /테스트 제목의 설명/);
    };
    const source = (body        ) =>
      `import { test } from '@playwright/test'; ${body}`;
    check(source("test('페이지를 표시한다', () => {});"));
    check(source("test(`" + "$" + "{path} 페이지를 표시한다`, () => {});"));
    check(source("test('english', () => {});"), 1);
    check(source("test('페이지 renders', () => {});"), 1);
    check(source("test(`" + "$" + "{path} 페이지 renders`, () => {});"), 1);
    check(source("test(title, () => {});"), 1);
    check(source("test.describe.only('suite', () => {});"), 1);
    check(source("test.skip('english', () => {});"), 1);
    check(source("test('페이지를 표시한다', {tag: '@smoke'}, () => {});"));
    check(
      source(
        "test.describe(() => {}); test.skip(true, 'reason'); test.skip(condition, 'reason');",
      ),
    );
    check(
      "import {test as scenario, expect} from '@playwright/test'; scenario('english', () => {});",
      1,
    );
    check(
      "import {test as scenario} from '@playwright/test'; scenario.describe.only('suite', () => {});",
      1,
    );
    check(
      "import {test as scenario} from '@playwright/test'; scenario('한글 제목', () => {}); scenario.extend({});",
    );
    check(
      "import scenario from 'node:test'; scenario('english', () => {});",
      1,
    );
    check("import scenario from 'node:test'; scenario('한글 제목', () => {});");
    check(
      "import * as runner from '@playwright/test'; runner.test('english', () => {});",
      1,
    );
    check(
      "import * as runner from '@playwright/test'; runner.test('한글 제목', () => {});",
    );
    check("import helper from './helper'; helper('english', () => {});");
    check("import { it } from 'vitest'; it('페이지를 표시한다', () => {});");
    check("import { it } from 'vitest'; it('english', () => {});", 1);
    check(
      "import { describe } from 'vitest'; describe('탐색 기능', () => {});",
    );
    check(
      "import { describe } from 'vitest'; describe('navigation', () => {});",
      1,
    );
    check(
      "import { it as scenario } from 'vitest'; scenario('english', () => {});",
      1,
    );
    check(
      "import { it as scenario } from 'vitest'; scenario('페이지를 표시한다', () => {});",
    );
    check(
      "import * as runner from 'vitest'; runner.describe('navigation', () => {});",
      1,
    );
    check(
      "import * as runner from 'vitest'; runner.it('페이지를 표시한다', () => {});",
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
