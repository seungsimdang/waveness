const { execFile } = require('node:child_process');
const { existsSync } = require('node:fs');
const { delimiter, dirname, join } = require('node:path');

function projectRoot(file, workspace) {
	for (let dir = dirname(file); ; dir = dirname(dir)) {
		if (
			existsSync(join(dir, '.harness/biome-check.mjs')) &&
			existsSync(join(dir, 'node_modules/.bin/biome'))
		)
			return dir;

		if (dir === workspace || dir === dirname(dir)) return undefined;
	}
}

function activate(context) {
	const vscode = require('vscode');
	const output = vscode.window.createOutputChannel('Seungness Save Format');

	context.subscriptions.push(output);
	context.subscriptions.push(
		vscode.workspace.onWillSaveTextDocument(event => {
			const document = event.document;
			const workspace = vscode.workspace.getWorkspaceFolder(document.uri);

			if (
				!vscode.workspace.isTrusted ||
				document.uri.scheme !== 'file' ||
				!workspace ||
				!/\.[cm]?[jt]sx?$/.test(document.uri.fsPath)
			)
				return;

			const root = projectRoot(document.uri.fsPath, workspace.uri.fsPath);

			if (!root) return;

			const version = document.version;
			const text = document.getText();

			// 에디터가 저장 중인 버퍼에만 수정 결과를 적용한다. 디스크·Git 인덱스는 쓰지 않는다.
			event.waitUntil(
				new Promise(resolve => {
					const child = execFile(
						'node',
						[
							join(root, '.harness/biome-check.mjs'),
							'check',
							'--write',
							`--stdin-file-path=${document.uri.fsPath}`
						],
						{
							cwd: root,
							env: {
								...process.env,
								PATH: [process.env.PATH, '/opt/homebrew/bin', '/usr/local/bin']
									.filter(Boolean)
									.join(delimiter)
							},
							timeout: 1000,
							maxBuffer: 64 * 1024 * 1024
						},
						(error, fixed, stderr) => {
							if (error) {
								output.appendLine(stderr || error.message);
								vscode.window.setStatusBarMessage(
									'자동 수정 실패: Seungness Save Format 출력 확인',
									5000
								);

								return resolve([]);
							}

							if (document.isClosed || document.version !== version || fixed === text)
								return resolve([]);

							resolve([
								vscode.TextEdit.replace(
									new vscode.Range(document.positionAt(0), document.positionAt(text.length)),
									fixed
								)
							]);
						}
					);

					child.stdin.on('error', () => {});
					child.stdin.end(text);
				})
			);
		})
	);
}

module.exports = { activate, projectRoot };
