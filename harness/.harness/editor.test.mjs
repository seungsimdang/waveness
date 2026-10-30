import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { packageEditor } from './package-editor.mjs';

const source = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

test('저장 훅은 버퍼를 전달하고 동시 편집·수정 실패·신뢰하지 않는 작업 공간을 보존한다', async () => {
	let listener;
	let callback;
	let received;
	let warning;

	const vscode = {
		workspace: {
			isTrusted: true,
			getWorkspaceFolder: () => ({ uri: { fsPath: '/project' } }),
			onWillSaveTextDocument: fn => {
				listener = fn;

				return { dispose() {} };
			}
		},
		window: {
			createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
			setStatusBarMessage: value => {
				warning = value;
			}
		},
		TextEdit: { replace: (range, text) => ({ range, text }) },
		Range: class {
			constructor(start, end) {
				this.start = start;
				this.end = end;
			}
		}
	};

	const extensionModule = { exports: {} };

	runInNewContext(readFileSync(join(source, 'editor/extension.cjs'), 'utf8'), {
		module: extensionModule,
		process,
		require: name => {
			if (name === 'vscode') return vscode;

			if (name === 'node:fs') return { existsSync: () => true };

			if (name === 'node:child_process')
				return {
					execFile: (_cmd, args, _options, cb) => {
						callback = cb;

						return {
							stdin: {
								on() {},
								end: text => {
									received = { args, text };
								}
							}
						};
					}
				};

			return require(name);
		}
	});
	extensionModule.exports.activate({ subscriptions: [] });

	const document = {
		uri: { scheme: 'file', fsPath: '/project/a.ts' },
		version: 1,
		isClosed: false,
		getText: () => 'unsaved source',
		positionAt: n => n
	};

	let waiting;

	const save = () =>
		listener({
			document,
			waitUntil: promise => {
				waiting = promise;
			}
		});

	save();
	assert.equal(received.text, 'unsaved source');
	assert.ok(received.args.includes('--stdin-file-path=/project/a.ts'));
	callback(null, 'fixed source', '');
	assert.equal((await waiting)[0].text, 'fixed source');
	save();
	document.version++;
	callback(null, 'old source', '');
	assert.equal((await waiting).length, 0);
	save();
	callback(new Error('failed'), '', '진단');
	assert.equal((await waiting).length, 0);
	assert.match(warning, /실패/);
	waiting = undefined;
	vscode.workspace.isTrusted = false;
	save();
	assert.equal(waiting, undefined);
});

test('로컬 확장 패키지는 실행 파일·매니페스트·신뢰 설정을 포함한다', () => {
	const root = mkdtempSync(join(tmpdir(), 'harness-vsix-test-'));

	try {
		const target = packageEditor(join(root, 'format.vsix'));

		const entries = execFileSync('unzip', ['-Z1', target], {
			encoding: 'utf8'
		});

		assert.match(entries, /extension\/extension.cjs/);

		const pkg = JSON.parse(
			execFileSync('unzip', ['-p', target, 'extension/package.json'], {
				encoding: 'utf8'
			})
		);

		assert.equal(pkg.capabilities.untrustedWorkspaces.supported, false);
		assert.match(
			execFileSync('unzip', ['-p', target, 'extension.vsixmanifest'], {
				encoding: 'utf8'
			}),
			/Microsoft.VisualStudio.Code.Manifest/
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
