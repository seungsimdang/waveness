import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
	canonicalizeText,
	declarationGroups,
	fixFiles,
	lintClasses,
	lintStylesheet,
	loadChecker
} from './check-tailwind-lint.mjs';

const source = dirname(fileURLToPath(import.meta.url));
const script = join(source, 'check-tailwind-lint.mjs');
const project = resolve(process.env.HARNESS_TEST_PROJECT ?? join(source, '..'));

const env = Object.fromEntries(
	Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
);

const git = (root, ...args) => execFileSync('git', args, { cwd: root, env, stdio: 'pipe' });

// 실제 Tailwind 없는 허브에서도 분기를 검증하는 가짜 패키지
const FAKE_LIB = `
const map = { 'top-[16px]': 'top-4', '!mx-0': 'mx-0!' };
const known = new Set([...Object.keys(map), 'text-[16px]', 'flex', 'block', 'hidden']);
export const __unstable__loadDesignSystem = async () => ({
	candidatesToCss: words =>
		words.map(word =>
			known.has(word) ? (['block', 'hidden'].includes(word) ? '.x{display:block;}' : '.x{top:0;}') : null
		),
	canonicalizeCandidates: words => words.map(word => map[word] ?? word)
});
`;

const fixture = ({ version = '4.3.3', lib = FAKE_LIB, css = '@import "tailwindcss";\n' } = {}) => {
	const root = mkdtempSync(join(tmpdir(), 'harness-canonical-test-'));

	git(root, 'init', '-q');
	git(root, 'config', 'user.name', '검사');
	git(root, 'config', 'user.email', 'check@example.com');

	if (version) {
		mkdirSync(join(root, 'node_modules/tailwindcss/dist'), { recursive: true });
		writeFileSync(
			join(root, 'node_modules/tailwindcss/package.json'),
			JSON.stringify({ name: 'tailwindcss', version })
		);
		writeFileSync(join(root, 'node_modules/tailwindcss/dist/lib.mjs'), lib);
	}

	writeFileSync(join(root, '.gitignore'), 'node_modules\n');

	if (css) writeFileSync(join(root, 'app.css'), css);

	git(root, 'add', '-A');
	git(root, 'commit', '-qm', '초기');

	return root;
};

const check = (root, ...args) =>
	spawnSync(process.execPath, [script, ...args], { cwd: root, env, encoding: 'utf8' });

const withFixture = async (options, body) => {
	const root = fixture(options);

	try {
		await body(root);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
};

test('문자열 안 비정규 클래스만 바꾸고 나머지 코드는 보존', () => {
	const checker = {
		canonical: word => ({ 'top-[16px]': 'top-4', '!mx-0': 'mx-0!' })[word] ?? word
	};

	const { fixed, changes } = canonicalizeText(
		'const top = 1;\n<p className="flex top-[16px]" />;\ncn(\'!mx-0\', `a ${b} top-[16px]`);\n// top-[16px]\n',
		checker
	);

	assert.equal(
		fixed,
		'const top = 1;\n<p className="flex top-4" />;\ncn(\'mx-0!\', `a ${b} top-4`);\n// top-[16px]\n'
	);
	assert.equal(changes.length, 3);
});

test('컴파일된 CSS의 문맥과 속성을 클래스 이름과 무관하게 비교 가능한 형태로 변환', () => {
	assert.deepEqual(declarationGroups('.w-4 {\n  width: 1rem;\n}\n', 'w-4'), [
		{ properties: ['width'], context: [] }
	]);
	assert.deepEqual(
		declarationGroups(
			'@media (hover: hover) {\n  .hover\\:w-\\[1\\.5px\\]:hover {\n    width: 1.5px;\n  }\n}\n',
			'hover:w-[1.5px]'
		),
		[{ properties: ['width'], context: ['@media (hover: hover)', '&:hover'] }]
	);
	assert.deepEqual(declarationGroups('.\\32 xl\\:p-1 {\n  padding: 1px;\n}\n', '2xl:p-1'), [
		{ properties: ['padding'], context: [] }
	]);
	assert.deepEqual(declarationGroups(null, 'x'), []);
});

test('같은 목록의 같은 CSS 속성만 충돌로 판정하고 템플릿 분기는 별도 목록으로 분리', () => {
	const groups = {
		block: [{ properties: ['display'], context: [] }],
		hidden: [{ properties: ['display'], context: [] }],
		'md:block': [{ properties: ['display'], context: ['@media'] }],
		'w-4': [{ properties: ['width'], context: [] }]
	};

	const checker = { blocked: new Set(['w-4']), details: word => groups[word] ?? [] };

	assert.deepEqual(lintClasses('cn("block hidden", "md:block")', checker), [
		'block: 같은 CSS 속성 적용 (hidden)'
	]);
	assert.deepEqual(lintClasses('cn("block md:block")', checker), []);
	assert.deepEqual(lintClasses('`md:block ${on ? "block" : "hidden"}`', checker), []);
	assert.deepEqual(lintClasses('"w-4"', checker), ['w-4: 차단 목록의 클래스']);
});

test('CSS 지시문은 IntelliSense v4 규칙으로 검사하고 주석은 무시', () => {
	const checker = { themeExists: path => path === '--color-a' || path === '--breakpoint-md' };

	const check = css => lintStylesheet(css, checker).length;

	for (const css of [
		'@tailwind base;',
		'@tailwind components;',
		'@tailwind nope;',
		'@source;',
		'@source none;',
		'@source foo;',
		'@source "C:/a";',
		'@import "tailwindcss" source(foo);',
		'@variant dark (&.dark);',
		'a { color: theme(--color-b); }',
		'@screen xl { a { color: red; } }'
	])
		assert.equal(check(css), 1, css);

	for (const css of [
		'@tailwind utilities;',
		'@tailwind utilities source("../a");',
		'@source "../a";',
		'@source not "../a";',
		'@source inline("flex");',
		'@import "tailwindcss" source(none);',
		'a { color: theme(--color-a); color: --theme(--color-a inline); }',
		'@screen md { a { color: red; } }',
		'/* @tailwind base; */'
	])
		assert.equal(check(css), 0, css);
});

test('스테이징된 위반은 차단하고 변환값을 출력', () =>
	withFixture({}, root => {
		writeFileSync(join(root, 'a.tsx'), '<p className="top-[16px]" />;\n');
		git(root, 'add', 'a.tsx');

		const result = check(root, '--staged');

		assert.equal(result.status, 1);
		assert.match(result.stderr, /top-\[16px\] -> top-4/);
	}));

test('충돌은 자동 수정하지 않고 --write에서도 위반으로 보고', () =>
	withFixture({}, root => {
		writeFileSync(join(root, 'a.tsx'), '<p className="block hidden" />;\n');
		git(root, 'add', 'a.tsx');

		const result = check(root, '--write', 'a.tsx');

		assert.equal(result.status, 1);
		assert.match(result.stderr, /같은 CSS 속성/);
		assert.equal(readFileSync(join(root, 'a.tsx'), 'utf8'), '<p className="block hidden" />;\n');
	}));

test('canonical 클래스와 스테이징하지 않은 기존 위반은 통과', () =>
	withFixture({}, root => {
		writeFileSync(join(root, 'old.tsx'), '<p className="top-[16px]" />;\n');
		writeFileSync(join(root, 'a.tsx'), '<p className="text-[16px]" />;\n');
		git(root, 'add', 'a.tsx');
		assert.equal(check(root, '--staged').status, 0);
	}));

test('스테이징 검사는 작업 트리가 아니라 인덱스 내용을 기준으로 판정', () =>
	withFixture({}, root => {
		writeFileSync(join(root, 'a.tsx'), '<p className="top-[16px]" />;\n');
		git(root, 'add', 'a.tsx');
		writeFileSync(join(root, 'a.tsx'), '<p className="flex" />;\n');
		assert.equal(check(root, '--staged').status, 1);
	}));

test('테스트 파일의 클래스 문자열은 검사하지 않음', () =>
	withFixture({}, root => {
		mkdirSync(join(root, '__tests__'));
		writeFileSync(join(root, '__tests__/a.ts'), 'const x = "top-[16px]";\n');
		writeFileSync(join(root, 'b.test.tsx'), 'const x = "top-[16px]";\n');
		git(root, 'add', '-A');
		assert.equal(check(root, '--staged').status, 0);
	}));

test('--write는 작업 파일을 고치고 인덱스는 변경하지 않음', () =>
	withFixture({}, root => {
		writeFileSync(join(root, 'a.tsx'), '<p className="top-[16px]" />;\n');
		git(root, 'add', 'a.tsx');
		assert.equal(check(root, '--write', 'a.tsx').status, 0);
		assert.equal(readFileSync(join(root, 'a.tsx'), 'utf8'), '<p className="top-4" />;\n');
		assert.equal(
			execFileSync('git', ['show', ':a.tsx'], { cwd: root, env, encoding: 'utf8' }),
			'<p className="top-[16px]" />;\n'
		);
	}));

test('검사할 수 없는 환경은 사유를 출력하고 커밋을 막지 않음', async () => {
	const cases = [
		[{ version: null }, /미설치/],
		[{ version: '3.4.19' }, /3\.4\.19 미지원/],
		[{ css: null }, /진입 CSS 없음/],
		[{ lib: 'export const other = 1;\n' }, /로드 실패/],
		[
			{
				lib: 'export const __unstable__loadDesignSystem = async () => ({ candidatesToCss: () => [] });\n'
			},
			/canonicalizeCandidates 없음/
		]
	];

	for (const [options, reason] of cases)
		await withFixture(options, async root => {
			writeFileSync(join(root, 'a.tsx'), '<p className="top-[16px]" />;\n');
			git(root, 'add', 'a.tsx');

			const result = check(root, '--staged');

			assert.equal(result.status, 0);
			assert.match(result.stdout, reason);
			assert.deepEqual(await fixFiles(root, ['a.tsx']), []);
		});
});

test('편집 후 수정은 프로젝트 안 소스 파일만 변경', () =>
	withFixture({}, async root => {
		const outside = mkdtempSync(join(tmpdir(), 'harness-canonical-outside-'));

		try {
			const away = join(outside, 'a.tsx');

			writeFileSync(away, 'const x = "top-[16px]";\n');
			writeFileSync(join(root, 'a.tsx'), 'const x = "top-[16px]";\n');
			writeFileSync(join(root, 'b.md'), '"top-[16px]"\n');
			assert.deepEqual(await fixFiles(root, ['a.tsx', 'b.md', away, 'missing.tsx']), ['a.tsx']);
			assert.equal(readFileSync(away, 'utf8'), 'const x = "top-[16px]";\n');
			assert.equal(readFileSync(join(root, 'b.md'), 'utf8'), '"top-[16px]"\n');
		} finally {
			rmSync(outside, { recursive: true, force: true });
		}
	}));

test(
	'실제 Tailwind에서 임의값을 canonical로 변환',
	{
		skip: existsSync(join(project, 'node_modules/tailwindcss/dist/lib.mjs'))
			? false
			: 'HARNESS_TEST_PROJECT에 Tailwind v4 없음'
	},
	async () => {
		const checker = await loadChecker(project);

		if (checker.skip) return;

		assert.equal(checker.canonical('min-w-[720px]').endsWith('[720px]'), false);
		assert.equal(checker.canonical('text-[16px]'), 'text-[16px]');
		assert.equal(checker.canonical('제목'), '제목');
	}
);
