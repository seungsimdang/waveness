import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
	cpSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { processedFiles } from './biome-check.mjs';
import {
	loadTypeScript,
	statementSpacing
} from './check-statement-spacing.mjs';

const source = dirname(fileURLToPath(import.meta.url));
const project = resolve(process.env.HARNESS_TEST_PROJECT ?? join(source, '..'));
let ts;

try {
	ts = loadTypeScript(project);
} catch {
	/* 허브에는 앱 의존성이 없다. */
}

const parser = {
	skip:
		!ts &&
		'프로젝트 TypeScript 없음: HARNESS_TEST_PROJECT로 설치된 프로젝트 지정'
};

const fix = text => statementSpacing(ts, text, 'fixture.tsx').fixed;

test(
	'블록 뒤·반환 앞·선언과 실행 사이를 구분하고 짧은 선언은 묶는다',
	parser,
	() => {
		const input =
			'function read() {\n  const a = 1;\n  const b = 2;\n  call(a);\n  if (b) { call(b); }\n  call(a);\n  return b;\n}\n';

		const expected =
			'function read() {\n  const a = 1;\n  const b = 2;\n\n  call(a);\n  if (b) { call(b); }\n\n  call(a);\n\n  return b;\n}\n';

		assert.equal(fix(input), expected);
		assert.equal(fix(expected), expected);
		assert.equal(
			fix('const a = 1;\nconst b = 2;\n'),
			'const a = 1;\nconst b = 2;\n'
		);
	}
);

test(
	'여러 줄 선언 앞뒤를 구분하고 문자열·정규식·JSX 내용은 보존한다',
	parser,
	() => {
		const input =
			'const a = 1;\nconst b = call(\n  a,\n);\nconst c = /a{2}/;\nconst view = <div>hello\nworld</div>;\nconst message = `one\ntwo`;\n';

		const expected =
			'const a = 1;\n\nconst b = call(\n  a,\n);\n\nconst c = /a{2}/;\n\nconst view = <div>hello\nworld</div>;\n\nconst message = `one\ntwo`;\n';

		assert.equal(fix(input), expected);
		assert.equal(fix(expected), expected);
		assert.equal(
			fix('function read() { const a = 1; return a; }'),
			'function read() { const a = 1;\n\nreturn a; }'
		);
	}
);

test(
	'설명 주석은 다음 문장에 붙이고 끝 주석·개행 문자·구문 오류를 보존한다',
	parser,
	() => {
		for (const comment of [
			'// 결과 설명',
			'/** 결과 설명 */',
			'/* 결과\n   설명 */'
		]) {
			const input = `function read() {\n  const a = 1; // 값\n  ${comment}\n  return a;\n}\n`;

			assert.equal(fix(input), input.replace('// 값\n', '// 값\n\n'));
			assert.equal(fix(fix(input)), fix(input));
		}

		const crlf = 'function read() {\r\n  call();\r\n  return 1;\r\n}\r\n';

		assert.equal(fix(crlf), crlf.replace('call();\r\n', 'call();\r\n\r\n'));
		assert.throws(() => fix('const x = ;'), /구문 오류/);
		assert.equal(
			fix('function read() {\n  return 1;\n}\n'),
			'function read() {\n  return 1;\n}\n'
		);
	}
);

test('처리·수정 파일 목록은 공백 경로를 보존하고 알 수 없는 형식은 거부한다', () => {
	assert.deepEqual(
		processedFiles(
			'  i Files processed:\n  \n  - src/a b.ts\n  \n\n  i Files fixed:\n  \n  - src/c.tsx\n  \n\n'
		),
		['src/a b.ts', 'src/c.tsx']
	);
	assert.throws(() => processedFiles('새로운 형식'), /목록을 읽을 수 없습니다/);
	assert.throws(
		() => processedFiles('  i Files processed:\n  * src/a.ts\n\n'),
		/목록을 읽을 수 없습니다/
	);
	assert.deepEqual(
		processedFiles('  i Files processed:\n  ! The list is empty.\n\n'),
		[]
	);
});

test('실제 Biome와 함께 검사·수정하고 제외 파일·실패·반복 실행을 검증한다', {
	timeout: 30_000,
	skip:
		(!ts || !existsSync(join(project, 'node_modules/.bin/biome'))) &&
		'프로젝트 Biome·TypeScript 없음'
}, () => {
	const root = mkdtempSync(join(tmpdir(), 'harness-spacing-'));

	try {
		symlinkSync(
			join(project, 'node_modules'),
			join(root, 'node_modules'),
			'dir'
		);
		for (const file of ['biome-check.mjs', 'check-statement-spacing.mjs'])
			cpSync(join(source, file), join(root, file));

		writeFileSync(join(root, 'package.json'), '{}');
		writeFileSync(
			join(root, 'biome.json'),
			JSON.stringify({
				files: { includes: ['**', '!ignored.ts'] },
				formatter: { indentStyle: 'space' },
				linter: { rules: { recommended: false } }
			})
		);

		const input = 'function read() {\n  const value = 1;\n  return value;\n}\n';

		writeFileSync(join(root, 'a b.ts'), input);
		writeFileSync(join(root, 'ignored.ts'), input);

		const run = (...args) =>
			spawnSync(process.execPath, ['biome-check.mjs', ...args], {
				cwd: root,
				encoding: 'utf8'
			});

		const check = run('check', '.');

		assert.equal(check.status, 1, check.stdout + check.stderr);
		assert.match(check.stderr, /빈 줄/);
		assert.equal(readFileSync(join(root, 'a b.ts'), 'utf8'), input);

		const written = run('check', '--write', '.');

		assert.equal(written.status, 0, written.stdout + written.stderr);
		assert.equal(readFileSync(join(root, 'a b.ts'), 'utf8'), fix(input));
		assert.equal(readFileSync(join(root, 'ignored.ts'), 'utf8'), input);
		for (const mode of ['check', 'lint', 'format', 'ci']) {
			const result = run(mode, '.');

			assert.equal(result.status, 0, result.stdout + result.stderr);
		}

		writeFileSync(join(root, 'a b.ts'), 'const x = ;');
		assert.notEqual(run('check', '--write', '.').status, 0);
		assert.equal(readFileSync(join(root, 'a b.ts'), 'utf8'), 'const x = ;');
		assert.match(
			run('check', '--reporter=json', '.').stderr,
			/지원하지 않습니다/
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
