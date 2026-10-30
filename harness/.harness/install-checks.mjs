// 공용 pre-commit 등록 준비. 기존 훅은 검사 설정을 검토한 명시적 마이그레이션에서만 교체
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const hook = `#!/bin/sh
set -eu
cd "$(git rev-parse --show-toplevel)"
if ! command -v node >/dev/null 2>&1; then
  PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
  export PATH
fi
exec node .harness/pre-commit.mjs
`;
export function defaultChecks(root) {
	const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
	const deps = { ...pkg.dependencies, ...pkg.devDependencies };
	const scripts = pkg.scripts ?? {};
	const pm = existsSync(join(root, 'pnpm-lock.yaml')) ? 'pnpm' : 'npm';
	const exec = (tool, ...args) =>
		pm === 'pnpm' ? [pm, 'exec', tool, ...args] : [pm, 'exec', '--', tool, ...args];
	if (!deps.husky || !/\bhusky\b/.test(scripts.prepare ?? ''))
		throw new Error('Husky 의존성과 prepare 등록 필요');
	const lint = deps['@biomejs/biome']
		? ['node', '.harness/biome-check.mjs', 'check', '.', '--error-on-warnings']
		: deps.eslint
			? exec('eslint', '.', '--max-warnings', '0')
			: null;
	if (!lint || !deps.typescript) throw new Error('Biome 또는 ESLint와 TypeScript 설치 필요');
	const name = ['type-check', 'typecheck'].find(key => scripts[key]);
	const typecheck = name
		? [[pm, 'run', name]]
		: deps.vite
			? [exec('tsc', '-b', '--pretty', 'false')]
			: deps.next
				? [exec('next', 'typegen'), exec('tsc', '--noEmit')]
				: [exec('tsc', '--noEmit')];
	return { lint: [lint], typecheck, extra: [] };
}
export function installChecks(root, { replaceReviewedHook = false, activate = false } = {}) {
	const target = join(root, '.husky/pre-commit');
	const config = join(root, '.harness/checks.json');
	const existing = existsSync(target) ? readFileSync(target, 'utf8') : null;
	if (existing && existing !== hook && (!replaceReviewedHook || !existsSync(config)))
		throw new Error(
			'기존 pre-commit 검토 필요: 추가 검사를 .harness/checks.json에 옮긴 뒤 --replace-reviewed-hook 사용'
		);
	const detected = defaultChecks(root);
	const initial = existsSync(config) ? null : detected;
	const paths = join(root, '.harness/paths');
	const lines = readFileSync(paths, 'utf8').trimEnd().split('\n');
	for (const entry of ['.husky/pre-commit', '!.harness/checks.json'])
		if (!lines.includes(entry)) lines.push(entry);
	mkdirSync(dirname(target), { recursive: true });
	if (initial) writeFileSync(config, `${JSON.stringify(initial, null, 2)}\n`);
	writeFileSync(paths, `${lines.join('\n')}\n`);
	writeFileSync(target, hook);
	if (activate) {
		if (process.env.HUSKY === '0') throw new Error('HUSKY=0 환경에서는 로컬 훅 활성화 불가');
		const pm = existsSync(join(root, 'pnpm-lock.yaml')) ? 'pnpm' : 'npm';
		const result = spawnSync(pm, pm === 'pnpm' ? ['exec', 'husky'] : ['exec', '--', 'husky'], {
			cwd: root,
			stdio: 'inherit'
		});
		if (result.status !== 0) throw new Error('Husky 활성화 실패');
	}
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		installChecks(process.cwd(), {
			replaceReviewedHook: process.argv.includes('--replace-reviewed-hook'),
			activate: process.argv.includes('--activate')
		});
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
