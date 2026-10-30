// 성공한 편집 도구가 지정한 파일만 수정하며 Git 인덱스에는 접근하지 않는다.
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatBuffer } from './biome-check.mjs';

export function editedFiles(input) {
	const args = input.tool_input ?? {};
	const tool = input.tool_name?.split('.').at(-1);

	if (tool === 'apply_patch') {
		const patch =
			typeof args === 'string'
				? args
				: args.command ?? args.patch ?? args.input ?? '';

		return [
			...new Set(
				[
					...patch.matchAll(/^\*\*\* (?:Add File|Update File|Move to): (.+)$/gm)
				].map(match => match[1])
			)
		];
	}

	return ['Edit', 'Write', 'MultiEdit'].includes(tool) &&
		args.file_path
		? [args.file_path]
		: [];
}

export function autoFormat(input) {
	if (
		input.tool_response?.error ||
		input.tool_response?.isError ||
		input.tool_response?.success === false
	)
		return;

	const root = realpathSync(
		input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
	);

	if (!existsSync(resolve(root, 'node_modules/.bin/biome'))) return;

	const changed = [];

	for (const file of editedFiles(input)) {
		if (!/\.[cm]?[jt]sx?$/.test(file) || !existsSync(resolve(root, file)))
			continue;

		const path = realpathSync(resolve(root, file));
		const local = relative(root, path);

		if (local === '..' || local.startsWith('../') || isAbsolute(local))
			throw new Error(`프로젝트 밖 파일은 자동 수정하지 않습니다: ${file}`);

		const before = readFileSync(path, 'utf8');
		const after = formatBuffer(root, path, before);

		if (readFileSync(path, 'utf8') !== before)
			throw new Error(`동시에 변경된 파일은 덮어쓰지 않습니다: ${file}`);

		if (after !== before) {
			writeFileSync(path, after);
			changed.push(local);
		}
	}

	return changed;
}

if (
	process.argv[1] &&
	realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	try {
		const changed = autoFormat(JSON.parse(readFileSync(0, 'utf8')));

		if (changed?.length)
			console.log(
				JSON.stringify({
					hookSpecificOutput: {
						hookEventName: 'PostToolUse',
						additionalContext: `자동 수정 적용: ${changed.join(', ')}. 다음 편집 전 현재 파일을 다시 읽으세요. Git 스테이징은 변경하지 않았습니다.`
					}
				})
			);
	} catch (error) {
		console.error(`자동 수정 실패: ${error.message}`);
		process.exitCode = 1;
	}
}
