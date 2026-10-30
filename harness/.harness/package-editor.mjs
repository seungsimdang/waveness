// 의존성 설치 없이 시스템 zip으로 VS Code/Cursor용 로컬 VSIX 생성
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function packageEditor(target) {
	const source = join(dirname(fileURLToPath(import.meta.url)), 'editor');
	const pkg = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
	const temp = mkdtempSync(join(tmpdir(), 'harness-editor-vsix-'));

	target = resolve(target);
	try {
		cpSync(source, join(temp, 'extension'), { recursive: true });
		writeFileSync(
			join(temp, '[Content_Types].xml'),
			'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="cjs" ContentType="application/javascript"/><Default Extension="vsixmanifest" ContentType="text/xml"/></Types>'
		);
		writeFileSync(
			join(temp, 'extension.vsixmanifest'),
			`<?xml version="1.0"?><PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011"><Metadata><Identity Language="en-US" Id="${pkg.name}" Version="${pkg.version}" Publisher="${pkg.publisher}"/><DisplayName>${pkg.displayName}</DisplayName><Description xml:space="preserve">${pkg.description}</Description></Metadata><Installation><InstallationTarget Id="Microsoft.VisualStudio.Code" Version="[1.90.0,)"/></Installation><Dependencies/><Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets></PackageManifest>`
		);

		const archive = join(temp, 'extension.vsix');

		execFileSync(
			'zip',
			['-q', '-r', archive, '[Content_Types].xml', 'extension.vsixmanifest', 'extension'],
			{ cwd: temp }
		);
		cpSync(archive, target);

		return target;
	} finally {
		rmSync(temp, { recursive: true, force: true });
	}
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		if (!process.argv[2]?.endsWith('.vsix')) throw new Error('출력할 .vsix 경로가 필요합니다.');

		console.log(packageEditor(process.argv[2]));
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
