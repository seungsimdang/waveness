#!/bin/sh
# PreToolUse(Bash) 훅: 허브 .harness/projects.json에서 manualMerge: true로 지정한 저장소의 PR 병합을 에이전트가 실행하지 못하게 차단
# manualMerge는 사람이 직접 병합하라는 표시라 예외 없음
# 사용자는 GitHub 화면이나 터미널 `! gh pr merge`로 직접 병합
# 허브 위치: HARNESS_HUB, 프로젝트 루트, 프로젝트 옆 waveness·seungness 순으로 찾고 등록 파일이 하나도 없으면 통과
# ponytail: `cd 경로 && gh pr merge`처럼 명령 안에서 옮긴 디렉터리는 보지 않음. -R 없이 쓰는 경우가 생기면 경로 추적 추가

input=$(cat)

printf '%s' "$input" | node -e '
const { execFileSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

let data;

try {
	data = JSON.parse(readFileSync(0, "utf8"));
} catch {
	process.exit(0);
}

const command = String(data.tool_input?.command ?? "");

// heredoc 본문과 따옴표 문자열 안의 글자를 명령으로 오인하지 않도록 제거한 실행 구문
const kept = [];
let delimiter = null;

for (const line of command.split("\n")) {
	if (delimiter) {
		if (line.trim() === delimiter) delimiter = null;

		continue;
	}

	kept.push(line);

	const doc = line.match(/<<-?\s*["\x27]?([A-Za-z_]\w*)["\x27]?/);

	if (doc) delimiter = doc[1];
}

const exec = kept.join("\n").replace(/"[^"]*"|\x27[^\x27]*\x27/g, "");
// 명령 시작: 줄 처음, 구분자 뒤, 반복문·조건문의 do·then·else 뒤
const start = String.raw`(^|[;&|(]\s*|\b(?:do|then|else)\s+)`;
const merge = new RegExp(start + String.raw`gh\s+pr\s+merge\b`, "m").test(exec);
const apiMerge = exec.match(new RegExp(start + String.raw`gh\s+api\b[^;&|]*repos/(\S+?)/pulls/[^/\s]+/merge\b`, "m"));

if (!merge && !apiMerge) process.exit(0);

const cwd = data.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();

const git = (...args) => {
	try {
		return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
	} catch {
		return "";
	}
};

const normalize = value =>
	value
		.replace(/\.git$/, "")
		.replace(/^.*github\.com[:/]/, "")
		.replace(/^[^:/]+:/, "")
		.toLowerCase();

const flag = exec.match(/(?:-R|--repo)(?:\s+|=)(\S+)/);
const url = exec.match(/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/\d+/);
const target = apiMerge?.[2] ?? flag?.[1] ?? url?.[1] ?? git("remote", "get-url", "origin");

if (!target) process.exit(0);

// 반복문 변수처럼 실행 전에는 값을 알 수 없는 저장소는 판정할 수 없어 차단
if (/[$`]/.test(target)) {
	console.error("차단: 병합 대상 저장소를 변수로 지정해 manualMerge 여부를 판정할 수 없습니다. 저장소 이름을 직접 적어 PR마다 따로 실행하세요.");
	process.exit(2);
}

const repo = normalize(target);
const root = git("rev-parse", "--show-toplevel") || cwd;

const files = [process.env.HARNESS_HUB, root, join(root, "../waveness"), join(root, "../seungness")]
	.filter(Boolean)
	.map(path => join(resolve(path), ".harness/projects.json"))
	.filter(file => existsSync(file));

for (const file of new Set(files)) {
	let projects = [];

	try {
		projects = JSON.parse(readFileSync(file, "utf8")).projects ?? [];
	} catch {
		continue;
	}

	const entry = projects.find(item => typeof item.repo === "string" && normalize(item.repo) === repo);

	if (entry?.manualMerge === true) {
		console.error(
			`차단: ${entry.repo}는 허브 등록(${file})에서 manualMerge로 지정돼 사람이 직접 병합합니다. GitHub에서 병합하거나 터미널에서 ! gh pr merge로 실행하세요.`
		);
		process.exit(2);
	}
}
'
