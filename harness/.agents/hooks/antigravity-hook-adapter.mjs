// Antigravity(Gemini) 훅 입력(camelCase)을 Claude·Codex 공용 훅 형식으로 변환해 실행하는 어댑터
// 사용법: node .agents/hooks/antigravity-hook-adapter.mjs <event> <hook-name> (stdin JSON)
// event: session-start | pre-tool-bash | pre-tool-edit | pre-tool-swarm | post-tool-edit | stop
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ADAPTER_DIR = dirname(fileURLToPath(import.meta.url));
const HARNESS_ROOT = process.env.CLAUDE_PROJECT_DIR || resolve(ADAPTER_DIR, '../..');

function readJsonStdin() {
	try {
		return JSON.parse(readFileSync(0, 'utf8') || '{}');
	} catch {
		return {};
	}
}

function resolveHookScript(hookName) {
	const candidates = [
		join(HARNESS_ROOT, '.codex/hooks', `${hookName}.sh`),
		join(HARNESS_ROOT, '.claude/hooks', `${hookName}.sh`)
	];

	return candidates.find(candidate => existsSync(candidate)) ?? null;
}

function parseJsonSafe(text) {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

function resolveTranscriptPath(transcriptPath) {
	if (!transcriptPath) return '';

	if (basename(transcriptPath) === 'transcript.jsonl') {
		const fullPath = join(dirname(transcriptPath), 'transcript_full.jsonl');

		if (existsSync(fullPath)) return fullPath;
	}

	return transcriptPath;
}

function extractLastAssistantMessage(transcriptPath) {
	const resolvedPath = resolveTranscriptPath(transcriptPath);

	if (!resolvedPath || !existsSync(resolvedPath)) return '';

	try {
		const lines = readFileSync(resolvedPath, 'utf8').trim().split('\n');

		for (let i = lines.length - 1; i >= 0; i -= 1) {
			const entry = parseJsonSafe(lines[i]);

			if (entry?.type === 'PLANNER_RESPONSE' && typeof entry.content === 'string') {
				return entry.content;
			}
		}
	} catch {
		return '';
	}

	return '';
}

function toPreToolDecision(result) {
	const stdout = (result.stdout ?? '').trim();
	const stderr = (result.stderr ?? '').trim();
	const parsed = parseJsonSafe(stdout);

	if (parsed?.hookSpecificOutput?.permissionDecision) {
		const decision = parsed.hookSpecificOutput.permissionDecision;

		if (decision === 'deny' || decision === 'ask') {
			return {
				decision,
				reason:
					parsed.hookSpecificOutput.permissionDecisionReason ||
					stderr ||
					'하네스 훅에 의해 차단 또는 확인이 필요합니다.'
			};
		}
	}

	if (parsed?.decision === 'block') {
		return {
			decision: 'deny',
			reason: parsed.reason || stderr || '하네스 훅에 의해 차단되었습니다.'
		};
	}

	if (result.status === 2) {
		return {
			decision: 'deny',
			reason: stderr || stdout || '하네스 훅에 의해 차단되었습니다.'
		};
	}

	return { decision: 'allow' };
}

function handleSessionStart(input) {
	const syncScript = join(HARNESS_ROOT, '.harness/sync.sh');

	if (!existsSync(syncScript)) return {};

	const result = spawnSync('sh', [syncScript, 'session'], {
		cwd: input.cwd || HARNESS_ROOT,
		encoding: 'utf8'
	});
	const stdout = (result.stdout ?? '').trim();

	if (!stdout) return {};

	const parsed = parseJsonSafe(stdout);
	const message = parsed?.systemMessage ?? stdout;

	if (!message) return {};

	return {
		injectSteps: [
			{
				systemMessage: {
					systemMessage: message
				}
			}
		]
	};
}

function handlePreToolBash(input, hookName) {
	const script = resolveHookScript(hookName);

	if (!script) return { decision: 'allow' };

	const args = input.toolCall?.args ?? {};
	const command = args.CommandLine ?? args.command ?? '';
	const payload = {
		hook_event_name: 'PreToolUse',
		tool_name: 'Bash',
		tool_input: { command },
		cwd: input.cwd || HARNESS_ROOT,
		transcript_path: resolveTranscriptPath(input.transcriptPath),
		session_id: input.conversationId ?? ''
	};
	const result = spawnSync('sh', [script], {
		cwd: input.cwd || HARNESS_ROOT,
		input: JSON.stringify(payload),
		encoding: 'utf8',
		env: { ...process.env, CLAUDE_PROJECT_DIR: HARNESS_ROOT }
	});

	return toPreToolDecision(result);
}

function toEditPayload(input, eventName) {
	const name = input.toolCall?.name?.split('.').at(-1);
	const args = input.toolCall?.args ?? {};
	const filePath = args.Path ?? args.file_path ?? '';

	if (name === 'write_file') {
		return {
			hook_event_name: eventName,
			tool_name: 'Write',
			tool_input: {
				file_path: filePath,
				content: args.Content ?? args.content ?? ''
			},
			cwd: input.cwd || HARNESS_ROOT,
			transcript_path: resolveTranscriptPath(input.transcriptPath),
			session_id: input.conversationId ?? ''
		};
	}

	return {
		hook_event_name: eventName,
		tool_name: 'Edit',
		tool_input: {
			file_path: filePath,
			old_string: args.Target ?? args.old_string ?? '',
			new_string: args.Replacement ?? args.new_string ?? ''
		},
		cwd: input.cwd || HARNESS_ROOT,
		transcript_path: resolveTranscriptPath(input.transcriptPath),
		session_id: input.conversationId ?? ''
	};
}

function handlePreToolEdit(input, hookName) {
	const script = resolveHookScript(hookName);

	if (!script) return { decision: 'allow' };

	const payload = toEditPayload(input, 'PreToolUse');
	const result = spawnSync('sh', [script], {
		cwd: input.cwd || HARNESS_ROOT,
		input: JSON.stringify(payload),
		encoding: 'utf8',
		env: { ...process.env, CLAUDE_PROJECT_DIR: HARNESS_ROOT }
	});

	return toPreToolDecision(result);
}

function handlePostToolEdit(input, hookName) {
	if (input.error) return {};

	if (hookName === 'auto-format') {
		const formatter = join(HARNESS_ROOT, '.harness/auto-format.mjs');

		if (!existsSync(formatter)) return {};

		spawnSync('node', [formatter], {
			cwd: input.cwd || HARNESS_ROOT,
			input: JSON.stringify(input),
			encoding: 'utf8',
			env: { ...process.env, CLAUDE_PROJECT_DIR: HARNESS_ROOT }
		});

		return {};
	}

	const script = resolveHookScript(hookName);

	if (!script) return {};

	const payload = toEditPayload(input, 'PostToolUse');

	spawnSync('sh', [script], {
		cwd: input.cwd || HARNESS_ROOT,
		input: JSON.stringify(payload),
		encoding: 'utf8',
		env: { ...process.env, CLAUDE_PROJECT_DIR: HARNESS_ROOT }
	});

	return {};
}

function handleStop(input, hookName) {
	if (input.continuationActive) return { decision: 'allow' };

	const script = resolveHookScript(hookName);

	if (!script) return { decision: 'allow' };

	const resolvedTranscript = resolveTranscriptPath(input.transcriptPath);
	const payload = {
		hook_event_name: 'Stop',
		last_assistant_message:
			input.lastAssistantMessage ?? extractLastAssistantMessage(resolvedTranscript),
		transcript_path: resolvedTranscript,
		cwd: input.cwd || HARNESS_ROOT,
		session_id: input.conversationId ?? '',
		stop_hook_active: Boolean(input.continuationActive)
	};
	const result = spawnSync('sh', [script], {
		cwd: input.cwd || HARNESS_ROOT,
		input: JSON.stringify(payload),
		encoding: 'utf8',
		env: { ...process.env, CLAUDE_PROJECT_DIR: HARNESS_ROOT }
	});
	const stdout = (result.stdout ?? '').trim();
	const stderr = (result.stderr ?? '').trim();
	const parsed = parseJsonSafe(stdout);

	if (parsed?.decision === 'block') {
		return {
			decision: 'continue',
			reason: parsed.reason || stderr || 'Stop 훅 조건을 충족한 뒤 다시 응답하세요.'
		};
	}

	if (result.status === 2) {
		return {
			decision: 'continue',
			reason: stderr || stdout || 'Stop 훅 조건을 충족한 뒤 다시 응답하세요.'
		};
	}

	return { decision: 'allow' };
}

function handlePreToolSwarm(input) {
	const args = input.toolCall?.args ?? {};

	if (args.action !== 'add') return { decision: 'allow' };

	const agentsDir = join(HARNESS_ROOT, '.agents/agents');

	if (!existsSync(agentsDir)) return { decision: 'allow' };

	const roles = readdirSync(agentsDir)
		.filter(file => file.endsWith('.md'))
		.map(file => file.slice(0, -3))
		.sort((a, b) => b.length - a.length);
	const workerName = String(args.name ?? '');
	const matchedRole = roles.find(
		role =>
			workerName === role ||
			(workerName.startsWith(`${role}-`) && /^\d+$/.test(workerName.slice(role.length + 1))) ||
			workerName.endsWith(`-${role}`)
	);

	if (!matchedRole) return { decision: 'allow' };

	const expectedRef = `.agents/agents/${matchedRole}.md`;
	const specContent = readFileSync(join(agentsDir, `${matchedRole}.md`), 'utf8');
	const frontmatter = specContent.split(/^---$/m)[1] ?? '';
	const expectedModel = frontmatter.match(/^swarm_model:\s*(\S+)\s*$/m)?.[1];
	const brief = String(args.brief ?? '');

	if (!brief.includes(expectedRef)) {
		return {
			decision: 'deny',
			reason: `swarm(action: "add") 호출 시 brief에 ${expectedRef} 경로 참조와 작업 전 필수 읽기 지시를 포함해야 합니다.`
		};
	}

	if (expectedModel && args.model !== expectedModel) {
		return {
			decision: 'deny',
			reason: `역할 ${matchedRole}의 swarm 모델은 ${expectedRef}의 swarm_model(${expectedModel})과 일치해야 합니다 (현재: ${args.model || '미지정'}).`
		};
	}

	return { decision: 'allow' };
}

const [, , event, hookName] = process.argv;
const input = readJsonStdin();
let output = {};

switch (event) {
	case 'session-start':
		output = handleSessionStart(input);
		break;
	case 'pre-tool-bash':
		output = handlePreToolBash(input, hookName);
		break;
	case 'pre-tool-edit':
		output = handlePreToolEdit(input, hookName);
		break;
	case 'pre-tool-swarm':
		output = handlePreToolSwarm(input);
		break;
	case 'post-tool-edit':
		output = handlePostToolEdit(input, hookName);
		break;
	case 'stop':
		output = handleStop(input, hookName);
		break;
	default:
		output = {};
}

process.stdout.write(`${JSON.stringify(output)}\n`);
