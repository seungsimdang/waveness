// 로컬 커밋과 PR에서 같은 검사를 실행하고 스테이징 기반 검사의 CI 입력을 구성
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const command = (args, cwd, env = process.env) => {
	const result = spawnSync(args[0], args.slice(1), { cwd, env, stdio: 'inherit' });
	if (result.error || result.status !== 0)
		throw new Error(`검사 실패: ${args.join(' ')} (${result.error?.message ?? result.status})`);
};
const commands = (value, label) => {
	if (
		!Array.isArray(value) ||
		!value.length ||
		value.some(
			args =>
				!Array.isArray(args) || !args.length || args.some(arg => typeof arg !== 'string' || !arg)
		)
	)
		throw new Error(`${label}: 비어 있지 않은 명령 배열 필요`);
	return value;
};
export function checkPlan(root) {
	const hub =
		existsSync(join(root, 'bin/harness.mjs')) &&
		existsSync(join(root, 'harness/.harness')) &&
		!existsSync(join(root, 'package.json'));
	if (hub)
		return {
			hub: true,
			tasks: [
				[
					process.execPath,
					'--test',
					...readdirSync(join(root, 'bin'))
						.filter(name => name.endsWith('.test.mjs'))
						.map(name => `bin/${name}`),
					...readdirSync(join(root, 'harness/.harness'))
						.filter(name => name.endsWith('.test.mjs'))
						.map(name => `harness/.harness/${name}`)
				]
			]
		};
	const file = join(root, '.harness/checks.json');
	if (!existsSync(file))
		throw new Error('.harness/checks.json 없음: node .harness/install-checks.mjs 실행 필요');
	const config = JSON.parse(readFileSync(file, 'utf8'));
	const lint = commands(config.lint, 'lint');
	// 경고 차단 옵션은 프로젝트 설정에서도 빠뜨릴 수 없도록 확인
	if (
		!lint.some(
			args =>
				(args.includes('biome') && args.includes('--error-on-warnings')) ||
				(args.includes('eslint') &&
					(args.includes('--max-warnings=0') ||
						args.some((arg, i) => arg === '--max-warnings' && args[i + 1] === '0')))
		)
	)
		throw new Error('lint에 Biome --error-on-warnings 또는 ESLint --max-warnings 0 필요');
	const entries = config.extra ?? [];
	if (!Array.isArray(entries)) throw new Error('extra: 검사 목록 필요');
	const extras = entries.length
		? commands(
				entries.map(entry => entry.command ?? entry),
				'extra'
			)
		: [];
	const stagedTasks = new Set(
		entries.flatMap((entry, index) => (entry.staged === true ? [index] : []))
	);
	const tests = readdirSync(join(root, '.harness'))
		.filter(name => name.endsWith('.test.mjs'))
		.map(name => `.harness/${name}`);
	if (!tests.length) throw new Error('공용 하네스 테스트 없음');
	return {
		identity: config.identity,
		stagedTasks,
		tasks: [
			...extras,
			...lint,
			...commands(config.typecheck, 'typecheck'),
			[process.execPath, '--test', ...tests]
		]
	};
}
export function runChecks(root, { ci = false, base, execute = command } = {}) {
	const plan = checkPlan(root);
	const plainEnv = { ...process.env };
	for (const key of Object.keys(plainEnv)) if (key.startsWith('GIT_')) delete plainEnv[key];
	if (plan.identity && !ci) {
		const { name, email } = plan.identity;
		const identityEnv = {
			...plainEnv,
			...Object.fromEntries(
				Object.entries(process.env).filter(([key]) => /^GIT_(AUTHOR|COMMITTER)_/.test(key))
			)
		};
		if (!name || !email) throw new Error('커밋 신원 name·email 필요');
		const read = (...args) => {
			const result = spawnSync('git', args, { cwd: root, env: identityEnv, encoding: 'utf8' });
			if (result.status !== 0) throw new Error('Git 커밋 신원 조회 실패');
			return result.stdout.trim();
		};
		if (
			read('config', 'user.name') !== name ||
			read('config', 'user.email') !== email ||
			!read('var', 'GIT_AUTHOR_IDENT').startsWith(`${name} <${email}> `)
		)
			throw new Error(`커밋 신원 불일치: ${name} <${email}> 필요`);
	}
	let temp;
	let head;
	const env = { ...process.env };
	try {
		if (ci && !plan.hub) {
			if (!base || !/^[a-f0-9]{40}$/.test(base))
				throw new Error('CI 검사에 검증할 base SHA(40자리) 필요');
			temp = mkdtempSync(join(tmpdir(), 'harness-check-index-'));
			const cleanEnv = { ...env };
			for (const key of Object.keys(cleanEnv)) if (key.startsWith('GIT_')) delete cleanEnv[key];
			const readGit = (...args) => {
				const result = spawnSync('git', args, { cwd: root, env: cleanEnv, encoding: 'utf8' });
				if (result.status !== 0) throw new Error('CI Git 기준 조회 실패');
				return result.stdout.trim();
			};
			head = readGit('rev-parse', 'HEAD');
			const objects = readGit('rev-parse', '--path-format=absolute', '--git-path', 'objects');
			execute(['git', 'init', '-q', join(temp, 'repo')], root, cleanEnv);
			// --cached 검사는 HEAD와 비교하므로 임시 HEAD도 PR 기준으로 격리
			for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
			Object.assign(env, {
				GIT_DIR: join(temp, 'repo/.git'),
				GIT_WORK_TREE: root,
				GIT_INDEX_FILE: join(temp, 'index'),
				GIT_ALTERNATE_OBJECT_DIRECTORIES: objects
			});
			execute(['git', 'update-ref', '--no-deref', 'HEAD', base], root, env);
			execute(['git', 'read-tree', base], root, env);
			execute(['git', 'add', '-A'], root, env);
		}
		for (const [index, task] of plan.tasks.entries())
			execute(task, root, plan.stagedTasks?.has(index) ? env : plainEnv);
		// CI에서 포매터가 고친 상태를 성공으로 오인하지 않도록 작업 트리 변경도 차단
		if (ci && !plan.hub) {
			execute(['git', 'add', '-A'], root, env);
			execute(['git', 'diff', '--cached', '--exit-code', head, '--'], root, env);
		}
	} finally {
		if (temp) rmSync(temp, { recursive: true, force: true });
	}
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		const args = process.argv.slice(2);
		runChecks(resolve(args.includes('--root') ? args[args.indexOf('--root') + 1] : process.cwd()), {
			ci: args.includes('--ci'),
			base: process.env.HARNESS_BASE_SHA
		});
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
