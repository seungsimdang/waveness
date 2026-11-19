// Antigravity(Gemini) 훅 입력(camelCase)을 Claude·Codex 공용 훅 형식으로 변환해 실행하는 어댑터
// 사용법: node .agents/hooks/antigravity-hook-adapter.mjs <event> <hook-name> (stdin JSON)
// event: session-start | pre-tool-bash | pre-tool-edit | post-tool-edit | stop
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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

function extractLastAssistantMessage(transcriptPath) {
	if (!transcriptPath || !existsSync(transcriptPath)) return '';

	try {
		const lines = readFileSync(transcriptPath, 'utf8').trim().split('\n');

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
		transcript_path: input.transcriptPath ?? '',
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
			transcript_path: input.transcriptPath ?? '',
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
		transcript_path: input.transcriptPath ?? '',
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

	const payload = {
		hook_event_name: 'Stop',
		last_assistant_message:
			input.lastAssistantMessage ?? extractLastAssistantMessage(input.transcriptPath),
		transcript_path: input.transcriptPath ?? '',
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
