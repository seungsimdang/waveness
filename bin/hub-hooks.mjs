// harness/의 훅 등록·설정을 이 허브 루트용 .claude/settings.json·.codex/hooks.json으로 바꾸는 도구
// 훅은 CLAUDE_PROJECT_DIR을 harness/로 넘겨 프로젝트에서와 같은 경로로 동작시킨다
// 허브는 main에서 작업하므로 check-branch-guard를, 프로젝트 동기화용 .harness/sync.sh를 빼고, 허브 자체 훅(bin/)은 유지한다
// 실행: node bin/hub-hooks.mjs (루트와 harness/ 등록 일치는 spec.test.mjs가 검사)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = { ".claude/settings.json": "$CLAUDE_PROJECT_DIR", ".codex/hooks.json": "$(git rev-parse --show-toplevel)" };
export const HUB_CONFIGS = Object.keys(DIRS);
const SKIP = /check-branch-guard|\.harness\/sync\.sh/;

const readJson = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {});
const harnessPath = (rule) => rule.replace(/^(\w+\(\/?)/, "$1harness/");

export function hubConfig(file) {
  const dir = DIRS[file];
  const { hooks: harnessHooks = {}, permissions, ...rest } = readJson(join(ROOT, "harness", file));
  const hooks = {};
  for (const [event, groups] of Object.entries(readJson(join(ROOT, file)).hooks ?? {})) {
    const own = groups.filter((g) => g.hooks.every((h) => h.command.includes(`${dir}/bin/`)));
    const kept = own.map((group) => ({ ...group, hooks: group.hooks.filter((hook) =>
      !/bin\/harness(?:-automation)?\.mjs.* (?:upstream|status-hubs)$/.test(hook.command),
    ) })).filter((group) => group.hooks.length);
    if (kept.length) hooks[event] = kept;
  }
  (hooks.SessionStart ??= []).unshift({ matcher: "startup", hooks: [{
    type: "command", command: `HARNESS_HOOK_JSON=1 node "${dir}/bin/harness-automation.mjs" status-hubs`,
  }] });
  for (const [event, groups] of Object.entries(harnessHooks)) {
    for (const group of groups) {
      const list = group.hooks
        .filter((h) => !SKIP.test(h.command))
        .map((h) => ({ ...h, command: `CLAUDE_PROJECT_DIR="${dir}/harness" ${h.command.replaceAll(`${dir}/`, `${dir}/harness/`)}` }));
      if (list.length) (hooks[event] ??= []).push({ ...group, hooks: list });
    }
  }
  const mapped = permissions && Object.fromEntries(Object.entries(permissions).map(([k, rules]) => [k, rules.map(harnessPath)]));
  return { ...(mapped && { permissions: mapped }), ...rest, hooks };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const file of HUB_CONFIGS) writeFileSync(join(ROOT, file), `${JSON.stringify(hubConfig(file), null, 2)}\n`);
}
