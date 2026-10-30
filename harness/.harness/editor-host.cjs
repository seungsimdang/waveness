// VS Code --extensionTestsPath로 실행하는 실제 저장 검증. 격리된 테스트 작업 공간에서만 사용한다.
const assert = require('node:assert/strict');
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const vscode = require('vscode');

exports.run = async () => {
	const root = vscode.workspace.workspaceFolders[0].uri.fsPath;

	await vscode.extensions.getExtension('seungness.harness-save-format').activate();

	const input = 'export function read(){const value=2;return value}';

	const expected = 'export function read() {\n  const value = 2;\n\n  return value;\n}\n';

	for (const file of ['save.ts', 'ignored.ts']) {
		const document = await vscode.workspace.openTextDocument(join(root, file));
		const edit = new vscode.WorkspaceEdit();

		edit.replace(
			document.uri,
			new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)),
			input
		);
		assert.equal(await vscode.workspace.applyEdit(edit), true);
		assert.equal(await document.save(), true);
		assert.equal(document.getText(), file === 'ignored.ts' ? input : expected);
		assert.equal(readFileSync(join(root, file), 'utf8'), document.getText());
	}

	console.log('실제 VS Code: 미저장 버퍼의 안전한 수정·빈 줄 보정·제외 파일 보존 통과');
	writeFileSync(join(root, 'editor-host-result.json'), JSON.stringify({ passed: true }));
};
