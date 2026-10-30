import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
	cpSync,
	existsSync,
	mkdirSync,
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
import { autoFormat, editedFiles } from './auto-format.mjs';
import { formatBuffer } from './biome-check.mjs';

const source = dirname(fileURLToPath(import.meta.url));
const project = resolve(process.env.HARNESS_TEST_PROJECT ?? join(source, '..'));

const realTools =
	existsSync(join(project, 'node_modules/.bin/biome')) &&
	existsSync(join(project, 'node_modules/typescript'));

const env = Object.fromEntries(
	Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
);

test('편집 대상 추출은 패치의 중복·이동·삭제와 실패한 도구를 구분한다', () => {
	assert.deepEqual(
		editedFiles({
			tool_name: 'apply_patch',
			tool_input: {
				command:
					'*** Update File: a.ts\n@@\n+a\n*** Update File: a.ts\n*** Delete File: b.ts\n*** Update File: old.ts\n*** Move to: new.ts'
			}
		}),
		['a.ts', 'old.ts', 'new.ts']
	);
	assert.deepEqual(
		editedFiles({
			tool_name: 'functions.apply_patch',
			tool_input: '*** Add File: new.ts\n+export const x = 1;'
		}),
		['new.ts']
	);
	assert.deepEqual(
		editedFiles({ tool_name: 'Write', tool_input: { file_path: 'a.ts' } }),
		['a.ts']
	);
	assert.deepEqual(
		editedFiles({
			tool_name: 'Bash',
			tool_input: { command: 'echo a > a.ts' }
		}),
		[]
	);
	assert.equal(autoFormat({ tool_response: { success: false } }), undefined);
});

test('실제 도구로 저장 버퍼·에이전트 편집을 수정하고 제외 파일·원본·인덱스를 보존한다', {
	timeout: 30_000,
	skip: !realTools && '프로젝트 Biome·TypeScript 없음'
}, () => {
	const root = mkdtempSync(join(tmpdir(), 'harness-auto-format-'));

	const git = (...args) =>
		execFileSync('git', args, { cwd: root, env, encoding: 'utf8' });

	try {
		symlinkSync(
			join(project, 'node_modules'),
			join(root, 'node_modules'),
			'dir'
		);
		mkdirSync(join(root, '.harness'));
		for (const file of [
			'biome-check.mjs',
			'check-statement-spacing.mjs',
			'auto-format.mjs'
		])
			cpSync(join(source, file), join(root, '.harness', file));

		writeFileSync(join(root, 'package.json'), '{}');
		writeFileSync(join(root, '.gitignore'), 'node_modules/\n');
		writeFileSync(
			join(root, 'biome.json'),
			JSON.stringify({
				files: { includes: ['**', '!ignored.ts'] },
				formatter: { indentStyle: 'space' },
				linter: { rules: { recommended: false } }
			})
		);

		const original = 'export const untouched = 1;\n';
		const input = 'export function read(){const value=2;return value}';

		const expected =
			'export function read() {\n  const value = 2;\n\n  return value;\n}\n';

		writeFileSync(join(root, 'a.ts'), original);
		writeFileSync(join(root, 'ignored.ts'), original);
		git('init', '-q');
		git('add', 'a.ts');

		const index = git('show', ':a.ts');

		assert.equal(formatBuffer(root, 'a.ts', input), expected);
		assert.equal(readFileSync(join(root, 'a.ts'), 'utf8'), original);
		assert.equal(formatBuffer(root, 'ignored.ts', input), input);
		assert.equal(formatBuffer(root, join(root, 'ignored.ts'), input), input);
		assert.throws(() => formatBuffer(root, 'a.ts', 'const invalid = ;'));
		assert.equal(readFileSync(join(root, 'a.ts'), 'utf8'), original);

		const cli = spawnSync(
			process.execPath,
			[
				'.harness/biome-check.mjs',
				'check',
				'--write',
				'--stdin-file-path=a.ts'
			],
			{ cwd: root, input, encoding: 'utf8', env }
		);

		assert.equal(cli.status, 0, cli.stderr);
		assert.equal(cli.stdout, expected);
		writeFileSync(join(root, 'a.ts'), input);
		writeFileSync(join(root, 'unrelated.ts'), input);
		assert.deepEqual(
			autoFormat({
				cwd: root,
				tool_name: 'Edit',
				tool_input: { file_path: 'a.ts' }
			}),
			['a.ts']
		);
		assert.equal(readFileSync(join(root, 'a.ts'), 'utf8'), expected);
		assert.equal(readFileSync(join(root, 'unrelated.ts'), 'utf8'), input);
		assert.equal(git('show', ':a.ts'), index);
		assert.deepEqual(
			autoFormat({
				cwd: root,
				tool_name: 'Write',
				tool_input: { file_path: 'a.ts' }
			}),
			[]
		);
		symlinkSync(join(source, 'auto-format.mjs'), join(root, 'outside.mjs'));
		assert.throws(
			() =>
				autoFormat({
					cwd: root,
					tool_name: 'Edit',
					tool_input: { file_path: 'outside.mjs' }
				}),
			/프로젝트 밖/
		);
		for (const tool of ['.claude', '.codex']) {
			writeFileSync(join(root, 'a.ts'), input);

			const response = spawnSync(
				'sh',
				[join(source, '..', tool, 'hooks/auto-format.sh')],
				{
					cwd: root,
					env,
					encoding: 'utf8',
					input: JSON.stringify({
						cwd: root,
						tool_name: 'apply_patch',
						tool_input: { command: '*** Update File: a.ts' }
					})
				}
			);

			assert.equal(response.status, 0, response.stderr);
			assert.match(
				JSON.parse(response.stdout).hookSpecificOutput.additionalContext,
				/자동 수정 적용/
			);
			assert.equal(readFileSync(join(root, 'a.ts'), 'utf8'), expected);
			assert.equal(git('show', ':a.ts'), index);
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
