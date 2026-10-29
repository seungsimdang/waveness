import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { hook, installChecks } from './install-checks.mjs';
import { checkPlan, command, runChecks } from './pre-commit.mjs';

const source = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
	Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_') && key !== 'HUSKY')
);
const git = (root, ...args) =>
	execFileSync('git', args, { cwd: root, env, encoding: 'utf8', stdio: 'pipe' }).trim();
const fixture = () => {
	const root = mkdtempSync(join(tmpdir(), 'harness-checks-test-'));
	mkdirSync(join(root, '.harness'));
	writeFileSync(join(root, '.harness/paths'), '.harness/\n');
	writeFileSync(
		join(root, '.harness/ok.test.mjs'),
		'import { test } from "node:test"; test("성공", () => {});\n'
	);
	writeFileSync(
		join(root, 'package.json'),
		JSON.stringify({
			scripts: { prepare: 'husky', typecheck: 'tsc --noEmit' },
			devDependencies: { husky: '9', typescript: '5', '@biomejs/biome': '2' }
		})
	);
	writeFileSync(join(root, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n");
	git(root, 'init', '-q');
	git(root, 'config', 'user.name', '검사');
	git(root, 'config', 'user.email', 'check@example.com');
	git(root, 'add', '-A');
	git(root, 'commit', '-qm', '초기');
	return root;
};
const config = (root, data = {}) =>
	writeFileSync(
		join(root, '.harness/checks.json'),
		JSON.stringify({
			lint: [['pnpm', 'exec', 'biome', 'check', '.', '--error-on-warnings']],
			typecheck: [['pnpm', 'run', 'typecheck']],
			extra: [],
			...data
		})
	);

test('필수 설정·경고 차단·타입 검사가 없으면 성공으로 건너뛰지 않음', () => {
	const root = fixture();
	try {
		assert.throws(() => checkPlan(root), /checks.json 없음/);
		config(root, { lint: [['pnpm', 'lint']] });
		assert.throws(() => checkPlan(root), /경고|error-on-warnings/);
		config(root, { typecheck: [] });
		assert.throws(() => checkPlan(root), /typecheck/);
		config(root);
		assert.equal(checkPlan(root).tasks.length, 3);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('추가 검사 실패는 lint·타입·하네스 검사보다 먼저 커밋을 차단', () => {
	const root = fixture();
	try {
		config(root, { extra: [['신원후추가검사']] });
		const calls = [];
		assert.throws(
			() =>
				runChecks(root, {
					execute: args => {
						calls.push(args);
						throw new Error('실패');
					}
				}),
			/실패/
		);
		assert.deepEqual(calls, [['신원후추가검사']]);
		config(root, { identity: { name: '다른이름', email: 'other@example.com' } });
		assert.throws(
			() => runChecks(root, { execute: () => assert.fail('검사 실행 금지') }),
			/신원 불일치/
		);
		config(root, { identity: { name: '검사', email: 'check@example.com' } });
		const previous = process.env.GIT_AUTHOR_EMAIL;
		process.env.GIT_AUTHOR_EMAIL = 'override@example.com';
		try {
			assert.throws(
				() => runChecks(root, { execute: () => assert.fail('검사 실행 금지') }),
				/신원 불일치/
			);
		} finally {
			if (previous === undefined) delete process.env.GIT_AUTHOR_EMAIL;
			else process.env.GIT_AUTHOR_EMAIL = previous;
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('CI는 PR 변경을 임시 인덱스에 구성하고 실제 인덱스·작성자 설정을 보존', () => {
	const root = fixture();
	try {
		const base = git(root, 'rev-parse', 'HEAD');
		config(root, {
			identity: { name: '로컬전용', email: 'local@example.com' },
			extra: [{ command: ['추가검사'], staged: true }]
		});
		git(root, 'add', '-A');
		git(root, 'commit', '-qm', '설정');
		let index;
		const before = git(root, 'write-tree');
		const originalHead = git(root, 'rev-parse', 'HEAD');
		const oldCommon = process.env.GIT_COMMON_DIR;
		const oldObjects = process.env.GIT_OBJECT_DIRECTORY;
		process.env.GIT_COMMON_DIR = join(root, '.git');
		process.env.GIT_OBJECT_DIRECTORY = join(root, '.git/objects');
		try {
			runChecks(root, {
				ci: true,
				base,
				execute: (args, cwd, childEnv) => {
					if (args[0] === 'git') return command(args, cwd, { ...env, ...childEnv });
					if (args[0] !== '추가검사') {
						assert.equal(childEnv.GIT_INDEX_FILE, undefined);
						assert.equal(childEnv.GIT_DIR, undefined);
						return;
					}
					index = childEnv.GIT_INDEX_FILE;
					assert.match(
						execFileSync('git', ['diff', '--cached', '--name-only'], {
							cwd,
							env: { ...env, ...childEnv },
							encoding: 'utf8'
						}),
						/checks.json/
					);
				}
			});
		} finally {
			if (oldCommon === undefined) delete process.env.GIT_COMMON_DIR;
			else process.env.GIT_COMMON_DIR = oldCommon;
			if (oldObjects === undefined) delete process.env.GIT_OBJECT_DIRECTORY;
			else process.env.GIT_OBJECT_DIRECTORY = oldObjects;
		}
		assert.equal(git(root, 'rev-parse', 'HEAD'), originalHead);
		assert.equal(git(root, 'write-tree'), before);
		assert.equal(existsSync(index), false);
		assert.throws(() => runChecks(root, { ci: true }), /base SHA/);
		assert.throws(
			() =>
				runChecks(root, {
					ci: true,
					base,
					execute: (args, cwd, childEnv) => {
						if (args[0] === 'git') return command(args, cwd, { ...env, ...childEnv });
						writeFileSync(join(root, 'package.json'), '{}\n');
					}
				}),
			/검사 실패/
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('등록은 기존 훅의 묵시적 덮어쓰기를 거부하고 반복해도 동일', () => {
	const root = fixture();
	try {
		mkdirSync(join(root, '.husky'));
		writeFileSync(join(root, '.husky/pre-commit'), '프로젝트 전용 검사\n');
		assert.throws(() => installChecks(root), /기존 pre-commit 검토/);
		assert.equal(existsSync(join(root, '.harness/checks.json')), false);
		config(root);
		installChecks(root, { replaceReviewedHook: true });
		installChecks(root);
		assert.equal(readFileSync(join(root, '.husky/pre-commit'), 'utf8'), hook);
		assert.equal(
			readFileSync(join(root, '.harness/paths'), 'utf8').match(/^\.husky\/pre-commit$/gm).length,
			1
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('새 등록은 strict lint 설정을 생성하고 실제 Git 커밋은 검사 실패 시 거절', () => {
	const root = fixture();
	try {
		installChecks(root);
		assert.ok(checkPlan(root).tasks.length);
		for (const file of ['pre-commit.mjs', 'install-checks.mjs'])
			cpSync(join(source, file), join(root, '.harness', file));
		config(root, {
			lint: [[process.execPath, '-e', 'process.exit(1)', '--', 'biome', '--error-on-warnings']]
		});
		git(root, 'config', 'core.hooksPath', '.husky');
		execFileSync('chmod', ['+x', join(root, '.husky/pre-commit')]);
		git(root, 'add', '-A');
		const before = git(root, 'rev-parse', 'HEAD');
		const result = spawnSync('git', ['commit', '-qm', '차단할 커밋'], {
			cwd: root,
			env,
			encoding: 'utf8'
		});
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /검사 실패/);
		assert.equal(git(root, 'rev-parse', 'HEAD'), before);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
