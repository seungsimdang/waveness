// Antigravity(Gemini) 훅 어댑터 회귀 테스트
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { editedFiles } from './auto-format.mjs';

const H = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ADAPTER = join(H, '.agents/hooks/antigravity-hook-adapter.mjs');

function runAdapter(event, hookName, payload) {
	const result = spawnSync('node', [ADAPTER, event, hookName], {
		input: JSON.stringify(payload),
		encoding: 'utf8',
		env: { ...process.env, CLAUDE_PROJECT_DIR: H }
	});

	assert.equal(result.status, 0, result.stderr);

	return JSON.parse(result.stdout);
}

test('Antigravity PreToolUse run_command에서 일반 명령은 허용함', () => {
	const out = runAdapter('pre-tool-bash', 'block-attribution-trailers', {
		toolCall: {
			id: 'call-1',
			name: 'run_command',
			args: { CommandLine: 'git status' }
		},
		cwd: H
	});

	assert.equal(out.decision, 'allow');
});

test('Antigravity PreToolUse run_command에서 Co-Authored-By 커밋을 차단함', () => {
	const out = runAdapter('pre-tool-bash', 'block-attribution-trailers', {
		toolCall: {
			id: 'call-2',
			name: 'run_command',
			args: {
				CommandLine: 'git commit -m "feat: add feature\n\nCo-Authored-By: Claude <noreply@anthropic.com>"'
			}
		},
		cwd: H
	});

	assert.equal(out.decision, 'deny');
	assert.ok(out.reason);
});

test('Antigravity PreToolUse edit_file에서 소스 내 엠대시를 차단함', () => {
	const out = runAdapter('pre-tool-edit', 'block-em-dash-in-source', {
		toolCall: {
			id: 'call-3',
			name: 'edit_file',
			args: {
				Path: join(H, 'src/example.ts'),
				Target: 'const a = 1;',
				Replacement: 'const a = 1; // 설명 — 엠대시'
			}
		},
		cwd: H
	});

	assert.equal(out.decision, 'deny');
	assert.ok(out.reason);
});

test('Antigravity Stop에서 continuationActive가 true이면 무한 루프 방지를 위해 허용함', () => {
	const out = runAdapter('stop', 'require-korean-response', {
		continuationActive: true,
		lastAssistantMessage: 'All English response without Korean',
		cwd: H
	});

	assert.equal(out.decision, 'allow');
});

test('Antigravity Stop에서 transcript의 영문 전용 응답을 continue로 전환함', () => {
	const dir = mkdtempSync(join(tmpdir(), 'agy-stop-'));

	try {
		const transcript = join(dir, 'transcript.jsonl');

		writeFileSync(
			transcript,
			`${JSON.stringify({ type: 'PLANNER_RESPONSE', content: 'This response is written only in English without any Korean characters at all.' })}\n`
		);

		const out = runAdapter('stop', 'require-korean-response', {
			continuationActive: false,
			transcriptPath: transcript,
			cwd: H
		});

		assert.equal(out.decision, 'continue');
		assert.ok(out.reason);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('auto-format editedFiles가 Antigravity edit_file·write_file 경로를 추출함', () => {
	assert.deepEqual(
		editedFiles({
			toolCall: { name: 'edit_file', args: { Path: '/tmp/a.ts' } }
		}),
		['/tmp/a.ts']
	);
	assert.deepEqual(
		editedFiles({
			toolCall: { name: 'write_file', args: { Path: '/tmp/b.tsx' } }
		}),
		['/tmp/b.tsx']
	);
	assert.deepEqual(
		editedFiles({
			toolCall: { name: 'read_file', args: { Path: '/tmp/c.ts' } }
		}),
		[]
	);
});
