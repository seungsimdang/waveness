// 사용법: node .harness/check-tailwind-lint.mjs [--write] [--staged] [파일...]
// Tailwind CSS IntelliSense(@tailwindcss/language-service 0.16.0)의 v4 린트 규칙을 프로젝트에 설치된 Tailwind로 검사
// 자동 수정은 suggestCanonicalClasses만 지원. CSS 충돌은 어느 쪽을 지울지 판단이 필요해 위반으로만 보고
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SOURCE = /\.[cm]?[jt]sx?$/;
const STYLE = /\.css$/;
// 테스트의 클래스 문자열은 비정규 표기를 일부러 담는 픽스처일 수 있어 제외
const TEST_FILE = /(^|\/)__tests__\/|\.(test|spec)\.[cm]?[jt]sx?$/;
const isSource = file => SOURCE.test(file) && !TEST_FILE.test(file);
const isTarget = file => isSource(file) || STYLE.test(file);
// shortcut: AST 대신 줄 단위 문자열 리터럴 정규식 사용. 오탐이 실제로 생기면 TypeScript 파서로 교체.
const LITERAL = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\[\s\S])*`/g;
const WORD = /[^\s"'`]+/g;

const git = (root, args) =>
	spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// 진입 CSS의 @import만 따라가고, 패키지 CSS 등 테마와 무관한 파일은 빈 내용으로 처리
const stylesheetLoader = root => async (id, base) => {
	const packageFile = /^tailwindcss(\/|$)/.test(id)
		? join(root, 'node_modules', id === 'tailwindcss' ? 'tailwindcss/index.css' : id)
		: null;

	const file = packageFile ?? (id.startsWith('.') ? resolve(base, id) : null);
	const path = file && existsSync(file) ? file : id;

	return {
		path,
		base: dirname(path),
		content: file && existsSync(file) ? readFileSync(file, 'utf8') : ''
	};
};

// 진입 CSS 탐색. shortcut: 모노레포는 첫 진입 CSS만 사용, 앱별 테마가 달라지면 경로 인자 추가.
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// @source not inline("...")의 차단 목록. shortcut: 중괄호 확장은 미지원, 쓰게 되면 확장 추가.
const blockedClasses = css =>
	new Set(
		[...css.matchAll(/@source\s+not\s+inline\(\s*["']([^"']*)["']/g)]
			.flatMap(match => match[1].split(/\s+/))
			.filter(word => word && !word.includes('{'))
	);

const entryStylesheet = root => {
	const listed = git(root, ['ls-files', '*.css']);

	if (listed.status !== 0) return null;

	return (
		listed.stdout
			.split('\n')
			.filter(Boolean)
			.map(file => join(root, file))
			.find(
				file =>
					existsSync(file) && /@import\s+["']tailwindcss[/"']/.test(readFileSync(file, 'utf8'))
			) ?? null
	);
};

// 검사할 수 없는 환경은 사유와 함께 null 반환(커밋을 막지 않음)
export async function loadChecker(root) {
	const skip = reason => ({ skip: reason });
	const manifest = join(root, 'node_modules/tailwindcss/package.json');

	if (!existsSync(manifest)) return skip('Tailwind 미설치');

	const { version } = JSON.parse(readFileSync(manifest, 'utf8'));

	if (Number.parseInt(version, 10) < 4) return skip(`Tailwind ${version} 미지원`);

	const entry = entryStylesheet(root);

	if (!entry) return skip('Tailwind 진입 CSS 없음');

	try {
		const tailwind = await import(
			pathToFileURL(join(root, 'node_modules/tailwindcss/dist/lib.mjs')).href
		);

		const css = readFileSync(entry, 'utf8');

		const system = await tailwind.__unstable__loadDesignSystem(css, {
			base: dirname(entry),
			loadStylesheet: stylesheetLoader(root),
			loadModule: async (id, base) => ({ path: id, base, module: () => {} })
		});

		if (typeof system.canonicalizeCandidates !== 'function')
			return skip(`Tailwind ${version}에 canonicalizeCandidates 없음`);

		const cache = new Map();
		const groups = new Map();

		const compile = word => {
			if (!cache.has(word)) cache.set(word, system.candidatesToCss([word])[0] ?? null);

			return cache.get(word);
		};

		return {
			blocked: blockedClasses(css),
			canonical: word =>
				compile(word) ? system.canonicalizeCandidates([word], { rem: 16 })[0] : word,
			// 클래스별 (문맥, 속성) 목록. IntelliSense의 recordClassDetails와 같은 비교 기준
			details(word) {
				if (!groups.has(word)) groups.set(word, declarationGroups(compile(word), word));

				return groups.get(word);
			},
			themeExists(path) {
				try {
					return Boolean(system.candidatesToCss([`[--custom:theme(${path})]`])[0]);
				} catch {
					return false;
				}
			}
		};
	} catch (error) {
		return skip(`디자인 시스템 로드 실패: ${error.message}`);
	}
}

// CSS.escape의 식별자 이스케이프(Node에 CSS 전역이 없어 직접 구현)
const escapeClass = word =>
	[...word]
		.map((char, index) =>
			/[\w-]/.test(char) && !(index === 0 && /\d/.test(char))
				? char
				: /\d/.test(char)
					? `\\${char.codePointAt(0).toString(16)} `
					: char.codePointAt(0) >= 0x80
						? char
						: `\\${char}`
		)
		.join('');

// 컴파일된 CSS를 문맥 경로와 선언 속성 묶음으로 변환. 클래스 선택자는 &로 치환해 이름과 무관하게 비교
export function declarationGroups(css, word) {
	if (!css) return [];

	const groups = [];
	const stack = [];
	let buffer = '';

	const declaration = () => {
		const name = buffer.trim().split(':')[0].trim();

		buffer = '';

		if (!name) return;

		const top = stack.at(-1);

		if (top) top.properties.push(name);
	};

	for (const char of css) {
		if (char === '{') {
			const selector = buffer.trim();

			buffer = '';
			stack.push({ selector: selector.replaceAll(`.${escapeClass(word)}`, '&'), properties: [] });
		} else if (char === ';') {
			declaration();
		} else if (char === '}') {
			declaration();

			const node = stack.pop();

			if (node?.properties.length)
				groups.push({
					properties: node.properties,
					context: [...stack, node].map(item => item.selector).filter(item => item !== '&')
				});
		} else buffer += char;
	}

	return groups;
}

const sameGroups = (first, second) =>
	first.length > 0 &&
	first.length === second.length &&
	first.every(
		(group, index) =>
			group.properties.join() === second[index].properties.join() &&
			group.context.join() === second[index].context.join()
	);

// 문자열별 클래스 목록. 템플릿의 ${...} 안은 별도 목록으로 분리
const classLists = text =>
	[...text.matchAll(LITERAL)].flatMap(([literal]) => {
		if (!literal.startsWith('`')) return [literal.slice(1, -1).split(/\s+/).filter(Boolean)];

		const inner = literal.slice(1, -1);
		const lists = [];
		let outer = '';

		for (let index = 0; index < inner.length; index++) {
			if (inner[index] === '$' && inner[index + 1] === '{') {
				let depth = 1;
				let end = index + 2;

				while (end < inner.length && depth) {
					if (inner[end] === '{') depth++;
					else if (inner[end] === '}') depth--;

					end++;
				}

				lists.push(...classLists(inner.slice(index + 2, end - 1)));
				outer += ' ';
				index = end - 1;
			} else outer += inner[index];
		}

		return [outer.split(/\s+/).filter(Boolean), ...lists];
	});

// cssConflict·usedBlocklistedClass
export function lintClasses(text, checker) {
	const messages = [];

	for (const words of classLists(text)) {
		words.forEach((word, index) => {
			if (checker.blocked.has(word)) messages.push(`${word}: 차단 목록의 클래스`);

			const conflicts = words.filter(
				(other, otherIndex) =>
					otherIndex > index && sameGroups(checker.details(word), checker.details(other))
			);

			if (conflicts.length) messages.push(`${word}: 같은 CSS 속성 적용 (${conflicts.join(', ')})`);
		});
	}

	return messages;
}

// invalidTailwindDirective·invalidSourceDirective·deprecatedAtRule·invalidConfigPath·invalidScreen
export function lintStylesheet(source, checker) {
	const text = source.replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' '));
	const messages = [];
	const add = (index, message) => messages.push(`${lineOf(text, index)}줄: ${message}`);

	for (const match of text.matchAll(/(?:\s|^)@tailwind\s+([^;]+)/g)) {
		const value = match[1].trim();

		if (['base', 'preflight'].includes(value))
			add(match.index, `@tailwind ${value}는 v4에서 제거됨. @import "tailwindcss/preflight" 사용`);
		else if (['components', 'screens', 'variants'].includes(value))
			add(match.index, `@tailwind ${value}는 v4에서 제거됨. @tailwind utilities 사용`);
		else if (value !== 'utilities' && !/^utilities\s+source\(/.test(value))
			add(match.index, `@tailwind 값이 유효하지 않음: ${value}`);
	}

	const sources = [
		...text.matchAll(
			/(?:\s|^)@(?<directive>import|reference)\s*(?:'[^']*'|"[^"]*")\s*(?:layer\([^)]+\)\s*)?source\((?<source>'[^']*'?|"[^"]*"?|[a-z]*|\)|;)/g
		),
		...text.matchAll(
			/(?:\s|^)@(?<directive>tailwind)\s+\S+\s+source\((?<source>'[^']*'?|"[^"]*"?|[a-z]*|\)|;)/g
		),
		...text.matchAll(
			/(?:\s|^)@(?<directive>source)\s*(?:not)?\s*(?<source>'[^']*'?|"[^"]*"?|[a-z]*(?:\([^)]+\))?|\)|;)/g
		)
	];

	for (const match of sources) {
		const { directive, source: raw } = match.groups;
		const quoted = /^['"]|['"]$/.test(raw.trim());
		const value = raw.trim().replace(/^['"]|['"]$/g, '').trim();

		if (!value || value === ')' || value === ';') add(match.index, 'source 지시문에 경로 필요');
		else if (directive !== 'source' && value !== 'none' && !quoted)
			add(match.index, `source(${value})가 유효하지 않음. source(none) 확인`);
		else if (value.includes('\\') || /^[A-Z]:/.test(value))
			add(match.index, `source 경로는 POSIX 형식 필요: ${value}`);
		else if (directive === 'source' && value === 'none')
			add(match.index, '@source none은 유효하지 않음. @import의 source(none) 사용');
		else if (directive === 'source' && !value.startsWith('inline(') && !quoted)
			add(match.index, `@source ${raw}가 유효하지 않음`);
	}

	for (const match of text.matchAll(/(?:\s|^)@variant\s+[-_a-zA-Z0-9]+\s+\([^;{}]+\)\s*;/g))
		add(match.index, '단문 @variant는 폐기 예정. @custom-variant 사용');

	for (const match of text.matchAll(/(?:--)?\btheme\(\s*['"]?([^)'"\s,/]+)/g))
		if (!checker.themeExists(match[1]))
			add(match.index, `테마에 없는 값: ${match[1]}`);

	for (const match of text.matchAll(/(?:\s|^)@screen\s+([^\s{]+)/g))
		if (!checker.themeExists(`--breakpoint-${match[1]}`))
			add(match.index, `테마에 없는 screen: ${match[1]}`);

	return messages;
}

export function canonicalizeText(text, checker) {
	const changes = [];

	const fixed = text.replace(LITERAL, literal =>
		literal.replace(WORD, word => {
			const canonical = checker.canonical(word);

			if (canonical === word) return word;

			changes.push([word, canonical]);

			return canonical;
		})
	);

	return { fixed, changes };
}

// 편집 후 훅용. 프로젝트 안의 JS·TS 파일만 수정하고 수정한 상대 경로 반환
export async function fixFiles(projectRoot, files) {
	// macOS의 /tmp·/var처럼 루트가 심볼릭 링크면 파일 realpath와 비교가 어긋나므로 루트도 정규화
	const root = realpathSync(projectRoot);

	const targets = files
		.map(file => resolve(root, file))
		.filter(file => isSource(file) && existsSync(file))
		.map(file => realpathSync(file))
		.filter(file => {
			const local = relative(root, file);

			return local !== '..' && !local.startsWith('../') && !isAbsolute(local);
		});

	if (!targets.length) return [];

	const checker = await loadChecker(root);

	if (checker.skip) return [];

	return targets.flatMap(file => {
		const before = readFileSync(file, 'utf8');
		const { fixed } = canonicalizeText(before, checker);

		if (fixed === before) return [];

		writeFileSync(file, fixed);

		return [relative(root, file)];
	});
}

const stagedFiles = root => {
	const result = git(root, ['diff', '--cached', '--name-only', '--diff-filter=ACMR']);

	if (result.status !== 0) throw new Error('스테이징 파일 목록 조회 실패');

	return result.stdout.split('\n').filter(Boolean);
};

const trackedFiles = root => {
	const result = git(root, ['ls-files']);

	if (result.status !== 0) throw new Error('추적 파일 목록 조회 실패');

	return result.stdout.split('\n').filter(Boolean);
};

export async function run(root, args) {
	const write = args.includes('--write');
	const staged = args.includes('--staged');

	if (write && staged) throw new Error('--write와 --staged는 함께 쓸 수 없습니다.');

	const named = args.filter(arg => !arg.startsWith('--'));

	const files = (staged ? stagedFiles(root) : named.length ? named : trackedFiles(root)).filter(
		isTarget
	);

	if (!files.length) return 0;

	const checker = await loadChecker(root);

	if (checker.skip) {
		console.log(`Tailwind 린트 건너뜀: ${checker.skip}`);

		return 0;
	}

	let violations = 0;
	const rewritten = [];

	for (const file of files) {
		// 커밋 대상과 같도록 스테이징 검사는 인덱스 내용을 읽음
		const shown = staged ? git(root, ['show', `:${file}`]) : null;

		if (shown && shown.status !== 0) throw new Error(`스테이징 내용 조회 실패: ${file}`);

		if (!shown && !existsSync(join(root, file))) continue;

		const text = shown ? shown.stdout : readFileSync(join(root, file), 'utf8');
		const { fixed, changes } = STYLE.test(file)
			? { fixed: text, changes: [] }
			: canonicalizeText(text, checker);

		if (write && changes.length) {
			writeFileSync(join(root, file), fixed);
			rewritten.push(file);
			console.log(`수정: ${file} (${changes.length}건)`);
		}

		const messages = [
			...(write ? [] : changes.map(([word, canonical]) => `${word} -> ${canonical}`)),
			...(STYLE.test(file)
				? lintStylesheet(text, checker)
				: lintClasses(write ? fixed : text, checker))
		];

		if (!messages.length) continue;

		violations += messages.length;
		console.error(file);

		for (const message of messages) console.error(`  ${message}`);
	}

	// 클래스가 바뀌면 줄바꿈·클래스 정렬 결과가 달라지므로 수정한 파일만 Biome 안전 수정 적용
	const biome = join(root, 'node_modules/.bin/biome');

	if (rewritten.length && existsSync(biome)) {
		const format = spawnSync(biome, ['check', '--write', ...rewritten], {
			cwd: root,
			stdio: 'inherit'
		});

		if (format.error || format.status !== 0) throw new Error('수정 파일 Biome 수정 실패');
	}

	if (!violations) return 0;

	console.error(
		`Tailwind 린트 위반 ${violations}건. 표기 위반 수정: node .harness/check-tailwind-lint.mjs --write <파일>`
	);

	return 1;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		process.exitCode = await run(realpathSync(process.cwd()), process.argv.slice(2));
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
