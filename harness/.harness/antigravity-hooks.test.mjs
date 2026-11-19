// Antigravity(Gemini) 훅 어댑터 회귀 테스트
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { editedFiles } from './auto-format.mjs';

const H = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ADAPTER = join(H, '.agents/hooks/antigravity-hook-adapter.mjs');

function runAdapter(event, hookName, payload, extraEnv = {}) {
	const result = spawnSync('node', [ADAPTER, event, hookName], {
		input: JSON.stringify(payload),
		encoding: 'utf8',
		env: { ...process.env, CLAUDE_PROJECT_DIR: H, ...extraEnv }
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

const firstRole = readdirSync(join(H, '.agents/agents'))
	.filter(file => file.endsWith('.md'))
	.map(file => file.slice(0, -3))
	.sort()[0];
const firstRoleModel = readFileSync(join(H, `.agents/agents/${firstRole}.md`), 'utf8')
	.split(/^---$/m)[1]
	.match(/^swarm_model:\s*(\S+)\s*$/m)[1];

test('Antigravity PreToolUse swarm에서 add 외 action 호출은 허용함', () => {
	const out = runAdapter('pre-tool-swarm', 'verify-swarm-role', {
		toolCall: {
			id: 'call-swarm-1',
			name: 'swarm',
			args: { action: 'status' }
		},
		cwd: H
	});

	assert.equal(out.decision, 'allow');
});

test('Antigravity PreToolUse swarm에서 등록되지 않은 보조 워커 스폰은 허용함', () => {
	const out = runAdapter('pre-tool-swarm', 'verify-swarm-role', {
		toolCall: {
			id: 'call-swarm-2',
			name: 'swarm',
			args: {
				action: 'add',
				name: 'helper-worker',
				model: 'gemini-4-hydrogen-medium',
				brief: '보조 탐색 수행'
			}
		},
		cwd: H
	});

	assert.equal(out.decision, 'allow');
});

test('Antigravity PreToolUse swarm에서 역할 명세 경로가 빠지면 차단함', () => {
	const out = runAdapter('pre-tool-swarm', 'verify-swarm-role', {
		toolCall: {
			id: 'call-swarm-3',
			name: 'swarm',
			args: {
				action: 'add',
				name: firstRole,
				model: firstRoleModel,
				brief: '명세 참조 없이 작업 수행'
			}
		},
		cwd: H
	});

	assert.equal(out.decision, 'deny');
	assert.match(out.reason, new RegExp(`\\.agents/agents/${firstRole}\\.md`));
});

test('Antigravity PreToolUse swarm에서 모델이 swarm_model과 다르면 차단함', () => {
	const out = runAdapter('pre-tool-swarm', 'verify-swarm-role', {
		toolCall: {
			id: 'call-swarm-4',
			name: 'swarm',
			args: {
				action: 'add',
				name: firstRole,
				model: 'gemini-4-neon-high',
				brief: `.agents/agents/${firstRole}.md 를 먼저 읽고 작업하라.`
			}
		},
		cwd: H
	});

	assert.equal(out.decision, 'deny');
	assert.match(out.reason, new RegExp(firstRoleModel));
});

test('Antigravity PreToolUse swarm에서 명세 경로와 swarm_model이 일치하면 허용함', () => {
	for (const workerName of [firstRole, `${firstRole}-1`]) {
		const out = runAdapter('pre-tool-swarm', 'verify-swarm-role', {
			toolCall: {
				id: 'call-swarm-5',
				name: 'swarm',
				args: {
					action: 'add',
					name: workerName,
					model: firstRoleModel,
					brief: `작업 전 반드시 .agents/agents/${firstRole}.md 명세를 읽고 지시를 따르라.`
				}
			},
			cwd: H
		});

		assert.equal(out.decision, 'allow');
	}
});

test('Antigravity PreToolUse edit_file에서 승인된 harness-plan 청사진이 있으면 하네스 파일 편집을 허용함', () => {
	const project = mkdtempSync(join(tmpdir(), 'agy-approval-'));

	try {
		mkdirSync(join(project, '.harness'), { recursive: true });
		mkdirSync(join(project, '.claude/hooks'), { recursive: true });
		mkdirSync(join(project, '.agents/agents'), { recursive: true });
		mkdirSync(join(project, 'bin'), { recursive: true });

		writeFileSync(join(project, '.harness/paths'), '.agents/\n.claude/hooks/\n');
		writeFileSync(
			join(project, '.harness/harness_edit_approval.py'),
			readFileSync(join(H, '.harness/harness_edit_approval.py'))
		);

		const hookPath = join(project, '.claude/hooks/require-harness-lab-before-harness-edit.sh');

		writeFileSync(
			hookPath,
			readFileSync(join(H, '.claude/hooks/require-harness-lab-before-harness-edit.sh'))
		);
		chmodSync(hookPath, 0o755);

		const targetRel = '.agents/agents/sample.md';
		const targetFile = join(project, targetRel);

		writeFileSync(targetFile, 'old\n');

		const codexMock = join(project, 'bin/codex');

		writeFileSync(
			codexMock,
			`#!/usr/bin/env python3
import json, sys
from pathlib import Path
request = json.load(sys.stdin)
text = request["user_reply"].strip()
if text == "승인":
    decision = "approve"
elif text == "승인 취소":
    decision = "revoke"
else:
    decision = "unclear"
Path(sys.argv[sys.argv.index("-o") + 1]).write_text(json.dumps({"decision": decision, "evidence": text}, ensure_ascii=False))
`
		);
		chmodSync(codexMock, 0o755);

		const beforeSha = createHash('sha256').update('old\n').digest('hex');
		const editPayload = {
			input: {
				file_path: targetFile,
				new_string: 'new\n',
				old_string: 'old\n'
			},
			tool: 'Edit'
		};
		const editSha = createHash('sha256').update(JSON.stringify(editPayload)).digest('hex');
		const plan = {
			id: 'agy-plan',
			skill: 'harness-lab',
			root: project,
			changes: [{ before_sha256: { [targetRel]: beforeSha }, edit_sha256: editSha }]
		};
		const planEntry = {
			type: 'PLANNER_RESPONSE',
			content: `<harness-plan>${JSON.stringify(plan)}</harness-plan>`
		};
		const approveEntry = {
			type: 'USER_INPUT',
			content: '<USER_REQUEST>\n승인\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\n2026-11-19\n</ADDITIONAL_METADATA>'
		};
		const revokeEntry = {
			type: 'USER_INPUT',
			content: '<USER_REQUEST>\n승인 취소\n</USER_REQUEST>'
		};
		const transcript = join(project, 'transcript.jsonl');
		const fullTranscript = join(project, 'transcript_full.jsonl');
		const editEnv = {
			CLAUDE_PROJECT_DIR: project,
			PATH: `${join(project, 'bin')}:${process.env.PATH}`
		};
		const editCall = transcriptPath =>
			runAdapter(
				'pre-tool-edit',
				'require-harness-lab-before-harness-edit',
				{
					toolCall: {
						id: 'call-edit-1',
						name: 'edit_file',
						args: {
							Path: targetFile,
							Target: 'old\n',
							Replacement: 'new\n'
						}
					},
					transcriptPath,
					cwd: project
				},
				editEnv
			);

		writeFileSync(transcript, `${JSON.stringify(planEntry)}\n`);
		assert.equal(editCall(transcript).decision, 'deny');

		writeFileSync(transcript, `${JSON.stringify(planEntry)}\n${JSON.stringify(approveEntry)}\n`);
		assert.equal(editCall(transcript).decision, 'allow');

		writeFileSync(
			transcript,
			`${JSON.stringify(planEntry)}\n${JSON.stringify(approveEntry)}\n${JSON.stringify(revokeEntry)}\n`
		);
		assert.equal(editCall(transcript).decision, 'deny');

		writeFileSync(
			transcript,
			`${JSON.stringify({ type: 'PLANNER_RESPONSE', content: 'truncated', truncated_fields: ['content'] })}\n`
		);
		writeFileSync(fullTranscript, `${JSON.stringify(planEntry)}\n${JSON.stringify(approveEntry)}\n`);
		assert.equal(editCall(transcript).decision, 'allow');
	} finally {
		rmSync(project, { recursive: true, force: true });
	}
});
