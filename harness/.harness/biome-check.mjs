// 사용법: node .harness/biome-check.mjs check [--write] [Biome 옵션·경로...]
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	checkStatementFiles,
	loadTypeScript,
	statementSpacing
} from './check-statement-spacing.mjs';

export function processedFiles(output) {
	// shortcut: Biome의 공개 --verbose 파일 목록 형식 사용. 형식이 바뀌면 조용히 생략하지 않고 실패한다.
	const unsupported = () => {
		throw new Error('Biome 처리 파일 목록을 읽을 수 없습니다. --verbose 출력 형식을 확인하세요.');
	};

	if (!output.includes('  i Files processed:\n')) unsupported();

	return [
		...new Set(
			[...output.matchAll(/ {2}i Files (?:processed|fixed):\n([\s\S]*?)(?:\n\n|$)/g)].flatMap(
				match => {
					const lines = match[1].split('\n').filter(line => line.trim());

					if (!lines.length) unsupported();

					return lines.flatMap(line => {
						if (line === '  ! The list is empty.') return [];

						const file = line.match(/^ {2}- (.+)$/);

						if (!file) unsupported();

						return [file[1]];
					});
				}
			)
		)
	];
}

export function runBiome(args, root = process.cwd()) {
	if (
		!['check', 'lint', 'format', 'ci'].includes(args[0]) ||
		args.some(arg => /^--(?:reporter|stdin-file-path)(?:=|$)/.test(arg))
	)
		throw new Error(
			'check·lint·format·ci와 파일 경로를 사용하세요. reporter·stdin 모드는 지원하지 않습니다.'
		);

	const result = spawnSync(
		resolve(root, 'node_modules/.bin/biome'),
		[...args, '--verbose', '--colors=off', '--files-ignore-unknown=true'],
		{ cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
	);

	if (result.error) throw result.error;

	process.stdout.write(result.stdout);
	process.stderr.write(result.stderr);
	if (result.status !== 0) return result.status ?? 1;

	const files = processedFiles(result.stdout.replaceAll('\r\n', '\n'));

	const write = args.some(arg => ['--write', '--fix', '--write=true', '--fix=true'].includes(arg));

	return checkStatementFiles(root, files, write) ? 0 : 1;
}

export function formatBuffer(root, file, text) {
	root = realpathSync(root);
	// shortcut: 최초 저장 전 파일은 제외 여부 확인 불가. 첫 저장 지원 시 저장 이벤트 연결 확장.
	if (!existsSync(resolve(root, file))) return text;

	file = relative(root, realpathSync(resolve(root, file)));
	if (file === '..' || file.startsWith('../') || isAbsolute(file))
		throw new Error('프로젝트 밖 파일은 자동 수정하지 않습니다.');

	const biome = resolve(root, 'node_modules/.bin/biome');

	const options = {
		cwd: root,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
		timeout: 10_000
	};

	// Biome의 stdin 모드는 includes를 적용하지 않으므로 실제 파일 선택을 먼저 확인한다.
	const scope = spawnSync(
		biome,
		[
			'check',
			'--verbose',
			'--colors=off',
			'--files-ignore-unknown=true',
			'--no-errors-on-unmatched',
			'--max-diagnostics=0',
			file
		],
		options
	);

	if (scope.error) throw scope.error;

	if (!processedFiles(scope.stdout.replaceAll('\r\n', '\n')).length) return text;

	const result = spawnSync(
		biome,
		['check', '--write', `--stdin-file-path=${file}`, '--colors=off'],
		{ ...options, input: text }
	);

	if (result.error || result.status !== 0)
		throw new Error(result.error?.message ?? result.stderr ?? 'Biome 자동 수정 실패');

	if (!/\.[cm]?[jt]sx?$/.test(file)) return result.stdout;

	return statementSpacing(loadTypeScript(root), result.stdout, file).fixed;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		const args = process.argv.slice(2);
		const stdin = args.find(arg => arg.startsWith('--stdin-file-path='));

		if (stdin && args.length === 3 && args[0] === 'check' && args.includes('--write'))
			process.stdout.write(
				formatBuffer(
					process.cwd(),
					stdin.slice('--stdin-file-path='.length),
					readFileSync(0, 'utf8')
				)
			);
		else process.exitCode = runBiome(args);
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
