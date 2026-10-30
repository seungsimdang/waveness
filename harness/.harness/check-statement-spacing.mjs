// Biome가 선택한 파일에만 적용하는 문장 사이 빈 줄 검사. 프로젝트의 TypeScript 파서를 사용한다.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

export const loadTypeScript = root =>
	createRequire(join(root, 'package.json'))('typescript');

export function statementSpacing(ts, text, file) {
	const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);

	if (source.parseDiagnostics.length)
		throw new Error(`${file}: 구문 오류가 있어 빈 줄 검사를 중단합니다.`);

	const edits = [];
	const eol = text.match(/\r\n|\n/)?.[0] ?? '\n';
	const line = pos => source.getLineAndCharacterOfPosition(pos).line;
	const variable = node => ts.isVariableStatement(node);
	const multiline = node => line(node.getStart(source)) !== line(node.end);

	const block = node =>
		ts.isBlock(node) ||
		ts.isIfStatement(node) ||
		ts.isIterationStatement(node, false) ||
		ts.isSwitchStatement(node) ||
		ts.isTryStatement(node) ||
		ts.isFunctionDeclaration(node) ||
		ts.isClassDeclaration(node) ||
		ts.isInterfaceDeclaration(node) ||
		ts.isEnumDeclaration(node);

	const check = (previous, next) => {
		if (
			!(
				block(previous) ||
				ts.isReturnStatement(next) ||
				variable(previous) !== variable(next) ||
				(variable(previous) && multiline(previous)) ||
				(variable(next) && multiline(next))
			)
		)
			return;

		let left = previous.end;
		let right = next.getStart(source);

		// 같은 줄의 주석은 앞 문장에 남기고, 다음 문장의 설명 주석 앞에 빈 줄을 넣는다.
		for (const comment of ts.getTrailingCommentRanges(text, left) ?? [])
			left = comment.end;

		const comments = ts.getLeadingCommentRanges(text, left) ?? [];

		if (comments.length) right = comments[0].pos;

		if (/\r?\n[\t ]*\r?\n/.test(text.slice(left, right))) return;

		const start = text.lastIndexOf('\n', right - 1) + 1;
		const indent = text.slice(start).match(/^[\t ]*/)[0];

		if (line(left) < line(right)) {
			edits.push({ start, end: start, text: eol, line: line(right) + 1 });
		} else {
			edits.push({
				start: left,
				end: right,
				text: eol + eol + indent,
				line: line(right) + 1
			});
		}
	};

	const visit = node => {
		if (node.statements)
			for (let i = 1; i < node.statements.length; i++)
				check(node.statements[i - 1], node.statements[i]);

		ts.forEachChild(node, visit);
	};

	visit(source);

	let fixed = text;

	for (const edit of [...edits].sort((a, b) => b.start - a.start))
		fixed = fixed.slice(0, edit.start) + edit.text + fixed.slice(edit.end);

	return { edits, fixed };
}

export function checkStatementFiles(root, files, write = false) {
	const selected = files.filter(file => /\.[cm]?[jt]sx?$/.test(file));

	if (!selected.length) return true;

	const ts = loadTypeScript(root);

	// 모든 파일의 구문을 확인한 뒤 써서 구문 오류로 인한 부분 수정을 피한다.
	const results = selected.map(file => ({
		file,
		...statementSpacing(ts, readFileSync(resolve(root, file), 'utf8'), file)
	}));

	for (const { file, edits, fixed } of results) {
		if (write && edits.length) writeFileSync(resolve(root, file), fixed);
		else
			for (const edit of edits)
				console.error(
					`${file}:${edit.line}: 문장 사이에 빈 줄이 필요합니다. --write로 수정하세요.`
				);
	}

	if (write)
		console.log(
			`문장 간격: ${results.filter(result => result.edits.length).length}개 파일 수정`
		);

	return write || results.every(result => !result.edits.length);
}
