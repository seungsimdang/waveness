// 공용 하네스(harness/)와 프로젝트 하네스를 3-way 병합으로 주고받는 도구
// pull <프로젝트>: lock 커밋..HEAD 변경을 병합하고 lock 갱신. 충돌 표시를 남기며 커밋은 사람이 함
// push <프로젝트>: 통합 브랜치의 `Harness-Scope: generic` 커밋을 waveness 현재 브랜치에 커밋별로 반영
// auto <프로젝트>: 이전 훅과 호환되는 읽기 전용 상태 안내
// prepare-upstream: 격리 체크아웃의 허브 간 PR 내용 준비, 원격 변경 없음
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HUB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// git 훅에서 실행되면 GIT_DIR 등이 남아 다른 저장소(waveness·seungness·프로젝트) 명령이 호출한 저장소로 향하므로 제거
for (const key of ["GIT_DIR", "GIT_INDEX_FILE", "GIT_WORK_TREE", "GIT_PREFIX", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES"])
  delete process.env[key];
const PREFIX = "harness/";
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const LOCK_STALE_MS = 10 * 60 * 1000;

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, maxBuffer: 1 << 28, stdio: ["pipe", "pipe", "pipe"] });
const gitText = (cwd, ...args) => git(cwd, ...args).toString().trim();
const gitOk = (cwd, ...args) => spawnSync("git", args, { cwd }).status === 0;
const lines = (text) => text.split("\n").filter(Boolean);

// .harness/paths 규칙: `/`로 끝나면 접두 일치, `!` 줄은 제외. check-scope.sh와 같은 해석
function loadPaths(file) {
  const include = [];
  const exclude = [];
  for (const line of lines(readFileSync(file, "utf8"))) {
    if (line.startsWith("#")) continue;
    if (line.startsWith("!")) exclude.push(line.slice(1));
    else include.push(line);
  }
  const hit = (path, rule) =>
    rule.endsWith("/") ? path.startsWith(rule) : path === rule;
  return (path) =>
    include.some((rule) => hit(path, rule)) &&
    !exclude.some((rule) => hit(path, rule));
}

function syncPaths(project) {
  const hubPaths = loadPaths(join(HUB, PREFIX, ".harness/paths"));
  const file = join(project, ".harness/paths");
  const projectPaths = existsSync(file) ? loadPaths(file) : hubPaths;
  return (path) => hubPaths(path) && projectPaths(path);
}

// rev의 path를 { mode, data } 또는 없으면 null로 읽음
function blob(repo, rev, path) {
  const entry = gitText(repo, "ls-tree", rev, "--", path);
  if (!entry) return null;
  const [mode, , sha] = entry.split(/\s+/);
  return { mode, data: git(repo, "cat-file", "blob", sha) };
}

function isLink(file) {
  try {
    return lstatSync(file).isSymbolicLink();
  } catch {
    // 경로가 없으면 링크가 아님
    return false;
  }
}

function readWorking(file) {
  if (isLink(file)) return { mode: "120000", data: Buffer.from(readlinkSync(file)) };
  if (!existsSync(file)) return null;
  // 실행 권한까지 읽어 두어야 apply가 755를 되살리고 same이 권한만 다른 파일을 변경으로 봄
  return { mode: statSync(file).mode & 0o111 ? "100755" : "100644", data: readFileSync(file) };
}

const same = (a, b) => (a && b ? a.mode === b.mode && a.data.equals(b.data) : !a && !b);

// ours(작업 트리 파일)에 base→theirs 변경을 반영할 계획을 만듦. 파일은 apply에서만 씀
function plan(file, base, theirs, preserveModels = false) {
  const ours = readWorking(file);
  if (preserveModels && ours && theirs && /\/(?:\.codex|\.claude)\/agents\/[^/]+\.(?:toml|md)$/.test(file)) {
    const codex = file.endsWith(".toml");
    const split = (data) => {
      const text = data.toString();
      const end = codex ? text.indexOf('developer_instructions = """') : text.indexOf("\n---", 4);
      return end < 0 ? [text, ""] : [text.slice(0, end), text.slice(end)];
    };
    const pattern = codex ? /^(model(?:_reasoning_effort)?)\s*=.*$/gm : /^(model|effort):.*$/gm;
    const values = new Map([...split(ours.data)[0].matchAll(pattern)].map(([line, key]) => [key, line]));
    const keep = (entry) => {
      if (!entry) return entry;
      const [header, body] = split(entry.data);
      return { ...entry, data: Buffer.from(header.replace(pattern, (line, key) => values.get(key) ?? line) + body) };
    };
    base = keep(base);
    theirs = keep(theirs);
  }
  if (same(base, theirs)) return null;
  if (!theirs) {
    if (!ours) return null;
    return same(ours, base) ? { file, remove: true } : { file, conflict: "원본에서 삭제됐지만 이쪽에서 수정됨" };
  }
  if (!ours) return base ? { file, conflict: "원본에서 수정됐지만 이쪽에서 삭제됨" } : { file, entry: theirs };
  if (same(ours, theirs)) return null;
  if (same(ours, base)) return { file, entry: theirs };
  if (theirs.mode === "120000" || ours.mode === "120000")
    return { file, conflict: "양쪽에서 다르게 바꾼 심볼릭 링크" };
  const dir = mkdtempSync(join(tmpdir(), "harness-"));
  try {
    const paths = ["ours", "base", "theirs"].map((name) => join(dir, name));
    writeFileSync(paths[0], ours.data);
    writeFileSync(paths[1], base?.data ?? "");
    writeFileSync(paths[2], theirs.data);
    const result = spawnSync("git", [
      "merge-file", "-p", "-L", "이쪽", "-L", "기준", "-L", "원본", ...paths,
    ]);
    // merge-file은 충돌 수를 종료 코드로 돌려주고 오류는 음수(255 이상)로 돌려줌
    if (result.status === null || result.status > 127)
      throw new Error(`git merge-file 실패: ${file}`);
    const entry = { mode: theirs.mode, data: result.stdout };
    return result.status > 0 ? { file, entry, conflict: `충돌 ${result.status}곳` } : { file, entry };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function apply(steps) {
  for (const { file, remove, entry } of steps) {
    if (remove) rmSync(file);
    if (!entry) continue;
    mkdirSync(dirname(file), { recursive: true });
    rmSync(file, { force: true });
    if (entry.mode === "120000") symlinkSync(entry.data.toString(), file);
    else {
      writeFileSync(file, entry.data);
      if (entry.mode === "100755") chmodSync(file, 0o755);
    }
  }
}

const conflictsOf = (steps, root) =>
  steps.filter((step) => step.conflict).map((step) => `  ${relative(root, step.file)}: ${step.conflict}`);

function readLock(project) {
  const file = join(project, ".harness/lock.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

// 통합 브랜치: lock에 적힌 값, 없으면 develop·main·master 중 먼저 있는 것
function integrationBranch(project, lock) {
  const candidates = lock.branch ? [lock.branch] : ["develop", "main", "master"];
  return candidates.find((name) => gitOk(project, "rev-parse", "-q", "--verify", `refs/heads/${name}`));
}

function planPull(project) {
  const lock = readLock(project) ?? { name: basename(project), synced: null };
  const head = gitText(HUB, "rev-parse", "HEAD");
  const base = lock.synced ?? EMPTY_TREE;
  const synced = syncPaths(project);
  const steps = lines(
    gitText(HUB, "diff", "--name-only", "--no-renames", base, head, "--", PREFIX),
  )
    .map((path) => path.slice(PREFIX.length))
    .filter(synced)
    .map((path) =>
      plan(
        join(project, path),
        lock.synced ? blob(HUB, base, PREFIX + path) : null,
        blob(HUB, head, PREFIX + path),
        process.env.HARNESS_PRESERVE_PROJECT_MODELS === "1",
      ),
    )
    .filter(Boolean);
  return { lock, head, steps };
}

// lock 갱신과 프로젝트 규칙 파일 생성. 바뀐 파일 경로(프로젝트 기준) 목록을 돌려줌
function finishPull(project, lock, head, steps) {
  apply(steps);
  const touched = steps.map((step) => step.file.slice(project.length + 1));
  const rules = join(project, "docs/agent-rules/project.md");
  if (!existsSync(rules)) {
    mkdirSync(dirname(rules), { recursive: true });
    copyFileSync(join(HUB, "templates/project.md"), rules);
    touched.push("docs/agent-rules/project.md");
  }
  writeFileSync(join(project, ".harness/lock.json"), `${JSON.stringify({ ...lock, synced: head }, null, 2)}\n`);
  touched.push(".harness/lock.json");
  return touched;
}

function pull(project) {
  const { lock, head, steps } = planPull(project);
  finishPull(project, lock, head, steps);
  console.log(`받기: ${(lock.synced ?? "처음").slice(0, 7)}..${head.slice(0, 7)}, 파일 ${steps.length}개`);
  const conflicts = conflictsOf(steps, project);
  if (conflicts.length) {
    console.error(`충돌 ${conflicts.length}건. 표시를 정리한 뒤 Harness-Scope: sync로 커밋하세요:\n${conflicts.join("\n")}`);
    process.exitCode = 1;
  }
}

// 통합 브랜치의 미반영 generic 커밋을 waveness에 커밋. 충돌이면 그 커밋에서 멈추고 사유를 돌려줌
function push(project, { manual }) {
  const lock = readLock(project);
  if (!lock) throw new Error("연결되지 않은 프로젝트(.harness/lock.json 없음)");
  const branch = integrationBranch(project, lock);
  if (!branch) return { made: 0, stopped: "통합 브랜치 없음" };
  const synced = syncPaths(project);
  const done = new Set(lines(gitText(HUB, "log", "--format=%(trailers:key=Harness-Origin,valueonly)")));
  const commits = lines(
    gitText(project, "log", "--reverse", "--no-merges",
      "--format=%H %(trailers:key=Harness-Scope,valueonly,separator=%x2C)", branch),
  )
    .map((line) => line.split(" "))
    .filter(([sha, scope]) => scope === "generic" && !done.has(`${lock.name}@${sha}`))
    .map(([sha]) => sha);
  let made = 0;
  for (const sha of commits) {
    const parent = gitText(project, "rev-list", "--parents", "-n", "1", sha).split(" ")[1] ?? EMPTY_TREE;
    const steps = lines(gitText(project, "diff", "--name-only", "--no-renames", parent, sha))
      .filter(synced)
      .map((path) => plan(join(HUB, PREFIX, path), blob(project, parent, path), blob(project, sha, path)))
      .filter(Boolean);
    const originalMessage = gitText(project, "log", "-1", "--format=%B", sha);
    const origin = `${lock.name}@${sha}`;
    const message = execFileSync(
      "git", ["interpret-trailers", "--trailer", `Harness-Origin: ${origin}`],
      { input: `${originalMessage}\n` },
    ).toString();
    const author = gitText(project, "log", "-1", "--format=%an <%ae>", sha);
    const conflicts = conflictsOf(steps, join(HUB, PREFIX));
    if (conflicts.length) {
      const stopped = `${lock.name}@${sha.slice(0, 7)} 충돌\n${conflicts.join("\n")}`;
      if (!manual) return { made, stopped };
      apply(steps);
      const msgFile = join(gitText(HUB, "rev-parse", "--absolute-git-dir"), "HARNESS_MSG");
      writeFileSync(msgFile, message);
      return { made, stopped: `${stopped}\n정리 후: git add harness && git commit -F ${msgFile} --author "${author}"` };
    }
    apply(steps);
    git(HUB, "add", "--", PREFIX);
    // 다른 경로로 이미 반영된 변경이면 커밋할 내용이 없음
    if (gitOk(HUB, "diff", "--cached", "--quiet")) continue;
    const changelog = join(HUB, PREFIX, "docs/agent-harness/CHANGELOG.md");
    const history = existsSync(changelog) ? readFileSync(changelog, "utf8") : "# 하네스 변경 이력\n";
    const source = `- Harness-Origin: \`${origin}\``;
    if (!history.split("\n").includes(source)) {
      const [subject, ...body] = originalMessage.split("\n");
      const details = body.filter((line) => !/^Harness-(Scope|Sync|Origin):/.test(line)).join("\n").trim();
      const date = gitText(project, "log", "-1", "--format=%cs", sha);
      const entry = `## ${date} ${subject}\n\n${source}\n${details ? `\n${details.split("\n").map((line) => `> ${line}`).join("\n")}\n` : ""}`;
      const [heading, ...previous] = history.split("\n");
      writeFileSync(changelog, `${heading}\n\n${entry}\n${previous.join("\n").trimStart()}`);
      git(HUB, "add", "--", changelog);
    }
    const committed = spawnSync("git", ["commit", "-q", "-F", "-", "--author", author], { cwd: HUB, input: message });
    if (committed.status !== 0) {
      const reason = `${lock.name}@${sha.slice(0, 7)} waveness 커밋 실패(pre-commit 테스트 등): ${committed.stderr.toString().trim().split("\n").slice(-3).join(" / ")}`;
      if (manual) return { made, stopped: reason };
      // 자동 올리기는 깨끗한 waveness에서만 시작하므로 harness/를 HEAD로 되돌려도 다른 변경을 잃지 않음
      git(HUB, "restore", "--staged", "--worktree", "--source=HEAD", "--", PREFIX);
      git(HUB, "clean", "-fdq", "--", PREFIX);
      return { made, stopped: reason };
    }
    made++;
  }
  return { made, stopped: null };
}

// 같은 저장소의 훅이 겹쳐 실행되면 index.lock 경합이 나므로 git 공용 디렉터리에 잠금을 둠
function withLock(project, fn) {
  const lockDir = join(resolve(project, gitText(project, "rev-parse", "--git-common-dir")), "harness-sync.lock");
  if (existsSync(lockDir) && Date.now() - statSync(lockDir).mtimeMs < LOCK_STALE_MS) return ["다른 동기화가 실행 중이라 건너뜀"];
  rmSync(lockDir, { recursive: true, force: true });
  mkdirSync(lockDir);
  try {
    return fn();
  } finally {
    rmSync(lockDir, { recursive: true, force: true });
  }
}

function autoPull(project) {
  if (!gitOk(project, "diff", "--cached", "--quiet")) return "받기 건너뜀: 스테이징된 변경이 있음";
  const synced = syncPaths(project);
  const dirty = lines(gitText(project, "status", "--porcelain", "--no-renames"))
    .map((line) => line.slice(3))
    .filter(synced);
  if (dirty.length) return `받기 건너뜀: 하네스 파일에 커밋하지 않은 변경이 있음 (${dirty.slice(0, 3).join(", ")})`;
  const { lock, head, steps } = planPull(project);
  if (lock.synced === head) return null;
  const conflicts = conflictsOf(steps, project);
  if (conflicts.length)
    return `받기 보류: 충돌 ${conflicts.length}건. node ${HUB}/bin/harness.mjs pull ${project} 로 수동 처리 필요\n${conflicts.join("\n")}`;
  const touched = finishPull(project, lock, head, steps);
  git(project, "add", "-A", "--", ...touched);
  const commit = spawnSync("git", [
    "commit", "-q", "-m", "chore(harness): 공용 하네스 동기화",
    "-m", `- waveness ${head.slice(0, 7)} 반영(파일 ${steps.length}개)`,
    // Harness-Sync: 프로젝트 짝 검사(check-harness-pair-commit) 통과용. 짝 일치는 waveness spec.test가 검사함
    "-m", "Harness-Sync: 공용 하네스 동기화\nHarness-Scope: sync",
  ], { cwd: project });
  if (commit.status !== 0) {
    // 스테이징된 채로 두면 다음 받기가 '스테이징된 변경이 있음'으로 계속 건너뛰므로 되돌림
    git(project, "restore", "--staged", "--worktree", "--source=HEAD", "--", ...touched);
    return `받기 커밋 실패(변경은 되돌림, 원인을 고치면 다음 세션 시작 때 다시 받음. 바로 받으려면 node ${HUB}/bin/harness.mjs pull ${project}): ${commit.stderr.toString().trim().split("\n").slice(-3).join(" / ")}`;
  }
  return `공용 하네스 받기: waveness ${head.slice(0, 7)}, 파일 ${steps.length}개 커밋`;
}

// git ls-tree -r 결과를 harness/ 기준 경로 → "모드 sha" 맵으로 읽음
function tree(repo, rev, include) {
  const entries = new Map();
  for (const line of lines(gitText(repo, "ls-tree", "-r", rev, "--", PREFIX))) {
    const [meta, path] = line.split("\t");
    const [mode, , sha] = meta.split(" ");
    const rel = path.slice(PREFIX.length);
    if (include(rel)) entries.set(rel, `${mode} ${sha}`);
  }
  return entries;
}

const repoReady = (repo) =>
  gitText(repo, "branch", "--show-current") === "main" && !gitText(repo, "status", "--porcelain");

const HOOK_CONFIGS = [".claude/settings.json", ".codex/hooks.json"];

// 등록 명령이 가리키는 훅 스크립트 경로. Codex 어댑터 경유 명령은 실제 스크립트 경로로 바꿈
const hookPaths = (command = "") => [
  ...[...command.matchAll(/\.(?:claude|codex)\/hooks\/[\w.-]+\.(?:sh|mjs)/g)].map(([path]) => path),
  ...[...command.matchAll(/codex-tool-adapter\.mjs"?\s+([\w-]+)/g)].map(([, name]) => `.codex/hooks/${name}.sh`),
];

const registrationKey = (event, matcher, hook) => JSON.stringify([event, matcher ?? null, hook]);

// hooks 객체를 등록 항목(이벤트·matcher·훅 정의) 맵으로 펼침
function registrations(hooks = {}) {
  const entries = new Map();
  for (const [event, groups] of Object.entries(hooks))
    for (const group of groups)
      for (const hook of group.hooks ?? [])
        entries.set(registrationKey(event, group.matcher, hook), { event, matcher: group.matcher, hook });
  return entries;
}

// 공유 항목 중 shared에 없는 것은 지우고, 빠진 것은 같은 이벤트·matcher 그룹 끝에 붙임. 전용 항목은 그대로 둠
function rebuildHooks(hooks, shared, isShared) {
  const result = {};
  for (const [event, groups] of Object.entries(hooks)) {
    const kept = groups
      .map((group) => ({
        ...group,
        hooks: (group.hooks ?? []).filter((hook) => !isShared(hook) || shared.has(registrationKey(event, group.matcher, hook))),
      }))
      .filter((group) => group.hooks.length);
    if (kept.length) result[event] = kept;
  }
  const present = registrations(result);
  for (const [key, { event, matcher, hook }] of shared) {
    if (present.has(key)) continue;
    const groups = (result[event] ??= []);
    let group = groups.find((candidate) => (candidate.matcher ?? null) === (matcher ?? null));
    if (!group) {
      group = matcher === undefined ? { hooks: [] } : { matcher, hooks: [] };
      groups.push(group);
    }
    group.hooks.push(hook);
  }
  return result;
}

// 훅 등록 파일의 hooks 키만 등록 항목 단위로 3-way 병합. 한쪽의 추가·삭제를 다른 쪽에 반영하고 나머지 설정은 각자 유지
// waveness 전용 훅(upstream-paths 제외)을 가리키는 등록은 공유 대상에서 뺌
function planHookConfigs(up, synced, head, include) {
  const isShared = (hook) => hookPaths(hook.command).every(include);
  const shared = (config) => new Map([...registrations(config?.hooks)].filter(([, { hook }]) => isShared(hook)));
  const steps = { toHub: [], toUp: [] };
  for (const path of HOOK_CONFIGS) {
    const read = (repo, rev) => {
      const found = blob(repo, rev, PREFIX + path);
      return found ? JSON.parse(found.data) : null;
    };
    // 다시 쓸 때 저장소마다 기존 들여쓰기 유지(waveness는 프로젝트 Biome 포맷의 탭, seungness는 공백 2칸)
    const indent = (repo) => (/\n\t/.test(readFileSync(join(repo, PREFIX, path), "utf8")) ? "\t" : 2);
    const ours = read(HUB, "HEAD");
    const theirs = read(up, head);
    if (!ours || !theirs) continue;
    const base = shared(read(up, synced));
    const fromUp = shared(theirs);
    const fromHub = shared(ours);
    const merged = new Map([...fromUp, ...fromHub].filter(([key]) => !base.has(key) || (fromUp.has(key) && fromHub.has(key))));
    for (const [repo, config, list] of [[HUB, ours, steps.toHub], [up, theirs, steps.toUp]]) {
      const hooks = rebuildHooks(config.hooks ?? {}, merged, isShared);
      if (JSON.stringify(hooks) === JSON.stringify(config.hooks ?? {})) continue;
      const data = Buffer.from(`${JSON.stringify({ ...config, hooks }, null, indent(repo))}\n`);
      list.push({ file: join(repo, PREFIX, path), entry: { mode: "100644", data } });
    }
  }
  return steps;
}

// waveness harness/의 훅과 seungness harness/의 같은 경로를 3-way 병합으로 맞춤
// 기준은 .harness/upstream.json의 synced(마지막으로 맞춘 seungness 커밋). 충돌이 하나라도 있으면 아무것도 쓰지 않음
function upstream() {
  const stateFile = join(HUB, ".harness/upstream.json");
  if (!existsSync(stateFile)) return [];
  const up = resolve(process.env.UPSTREAM_HUB ?? join(dirname(HUB), "seungness"));
  // seungness를 받지 않은 PC(회사 동료 등)에서는 조용히 건너뜀
  if (!existsSync(join(up, PREFIX))) return [];
  if (!repoReady(HUB) || !repoReady(up))
    return ["seungness 훅 동기화 건너뜀: waveness 또는 seungness가 main이 아니거나 커밋하지 않은 변경이 있음"];
  return withLock(HUB, () => {
    const state = JSON.parse(readFileSync(stateFile, "utf8"));
    const include = loadPaths(join(HUB, ".harness/upstream-paths"));
    const head = gitText(up, "rev-parse", "HEAD");
    const base = tree(up, state.synced, include);
    const theirs = tree(up, head, include);
    const ours = tree(HUB, "HEAD", include);
    const changed = [...new Set([...base.keys(), ...theirs.keys(), ...ours.keys()])]
      .filter((path) => ours.get(path) !== theirs.get(path) || base.get(path) !== theirs.get(path))
      .sort();
    const configs = planHookConfigs(up, state.synced, head, include);
    if (!changed.length && !configs.toHub.length && !configs.toUp.length) return [];

    const toHub = [...configs.toHub];
    const toUp = [...configs.toUp];
    for (const path of changed) {
      const step = plan(join(HUB, PREFIX, path), blob(up, state.synced, PREFIX + path), blob(up, head, PREFIX + path));
      const final = step ? (step.remove ? null : step.entry) : readWorking(join(HUB, PREFIX, path));
      if (step) toHub.push(step);
      const current = readWorking(join(up, PREFIX, path));
      if (!same(final, current)) toUp.push(final ? { file: join(up, PREFIX, path), entry: final } : { file: join(up, PREFIX, path), remove: true });
    }
    const conflicts = conflictsOf(toHub, join(HUB, PREFIX));
    if (conflicts.length)
      return [`seungness 훅 동기화 보류: 충돌 ${conflicts.length}건. 양쪽 파일을 같은 내용으로 맞춰 각각 커밋하면 다음 waveness 커밋·세션 시작 때 다시 동기화됨\n${conflicts.join("\n")}`];

    const origin = gitText(HUB, "rev-parse", "HEAD");
    // 직전 동기화 커밋 이후 waveness에서 훅을 바꾼 커밋 제목을 seungness 이력에 남김
    const since = gitText(HUB, "log", "-1", "--format=%H", "--", ".harness/upstream.json");
    const notes = [];
    let synced = head;
    if (toUp.length) {
      apply(toUp);
      const files = toUp.map((step) => step.file.slice(up.length + 1 + PREFIX.length));
      const subjects = lines(gitText(HUB, "log", "--format=%s", `${since}..HEAD`, "--", ...files.map((file) => PREFIX + file)));
      const changelog = join(up, PREFIX, "docs/agent-harness/CHANGELOG.md");
      const history = existsSync(changelog) ? readFileSync(changelog, "utf8") : "# 하네스 변경 이력\n";
      const [heading, ...previous] = history.split("\n");
      const entry = [
        `## ${new Date().toISOString().slice(0, 10)} waveness 훅 동기화`, "",
        `- Harness-Origin: \`waveness@${origin}\``,
        `- 대상: ${files.map((file) => `\`${file}\``).join(", ")}`,
        ...(subjects.length ? ["", ...subjects.map((subject) => `> - ${subject}`)] : []),
      ].join("\n");
      writeFileSync(changelog, `${heading}\n\n${entry}\n\n${previous.join("\n").trimStart()}`);
      git(up, "add", "--", PREFIX);
      const committed = spawnSync("git", [
        "commit", "-q", "-m", "chore(harness): waveness 훅 동기화",
        "-m", files.map((file) => `- ${file}`).join("\n"),
        "-m", `Harness-Origin: waveness@${origin}`,
      ], { cwd: up });
      if (committed.status !== 0) {
        git(up, "restore", "--staged", "--worktree", "--source=HEAD", "--", PREFIX);
        git(up, "clean", "-fdq", "--", PREFIX);
        return [`seungness 훅 동기화 중단: seungness 커밋 실패(pre-commit 테스트 등): ${committed.stderr.toString().trim().split("\n").slice(-3).join(" / ")}`];
      }
      notes.push(`seungness로 훅·등록 파일 ${files.length}개 올림 준비`);
      synced = gitText(up, "rev-parse", "HEAD");
    }
    apply(toHub);
    writeFileSync(stateFile, `${JSON.stringify({ ...state, synced }, null, 2)}\n`);
    git(HUB, "add", "--", PREFIX, ".harness/upstream.json");
    const received = toHub.map((step) => step.file.slice(HUB.length + 1));
    const committed = spawnSync("git", [
      "commit", "-q", "-m", "chore(harness): seungness 훅 동기화",
      "-m", `- seungness ${synced.slice(0, 7)} 기준${received.length ? `, 받은 파일 ${received.length}개` : ""}`,
    ], { cwd: HUB });
    if (committed.status !== 0) {
      // 스테이징된 채로 두면 다음 동기화가 미커밋 변경 때문에 계속 건너뛰므로 되돌림. seungness에 올린 커밋은 다음 동기화가 받음
      git(HUB, "restore", "--staged", "--worktree", "--source=HEAD", "--", PREFIX, ".harness/upstream.json");
      return [...notes, `seungness 훅 받기 커밋 실패(변경은 되돌림, 다음 동기화 때 다시 받음): ${committed.stderr.toString().trim().split("\n").slice(-3).join(" / ")}`];
    }
    if (received.length) notes.push(`seungness에서 훅·등록 파일 ${received.length}개 받음`);
    return notes;
  });
}

const failure = (label, error) => `${label} 실패: ${String(error.message).trim().split("\n").slice(-3).join(" / ")}`;

function safeUpstream() {
  try {
    return upstream();
  } catch (error) {
    return [failure("seungness 훅 동기화", error)];
  }
}

function auto(project) {
  const result = spawnSync(process.execPath, [join(HUB, "bin/harness-automation.mjs"), "status", project], { encoding: "utf8", env: process.env });
  if (result.stdout) process.stdout.write(result.stdout);
  return [];
}

// 훅 결과 출력. SessionStart 훅(HARNESS_HOOK_JSON)에서는 문제를 systemMessage로 사용자 화면에도 띄움. 평문 stdout은 에이전트 맥락에만 들어감
function report(notes) {
  const problems = notes.filter((note) => /중단|보류|실패/.test(note));
  if (process.env.HARNESS_HOOK_JSON && problems.length)
    console.log(JSON.stringify({
      systemMessage: `공용 하네스 동기화 문제:\n${problems.join("\n")}`,
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: notes.join("\n") },
    }));
  else if (notes.length) console.log(notes.join("\n"));
}

const [command, target, mode = "both"] = process.argv.slice(2);
if (command === "prepare-upstream") {
  report(safeUpstream());
  process.exit(0);
}
if (command === "receive") {
  const project = gitText(resolve(target), "rev-parse", "--show-toplevel");
  const result = autoPull(project);
  if (result) console.log(result);
  process.exit(/보류|실패/.test(result ?? "") ? 1 : 0);
}
if (command === "upstream") {
  const result = spawnSync(process.execPath, [join(HUB, "bin/harness-automation.mjs"), "status-hubs"], { encoding: "utf8", env: process.env });
  if (result.stdout) process.stdout.write(result.stdout);
  process.exit(0);
}
if (!["pull", "push", "auto"].includes(command) || !target || !["pull", "push", "both"].includes(mode)) {
  console.error("사용법: node bin/harness.mjs pull|push <프로젝트 경로> | auto <프로젝트 경로> [pull|push|both] | upstream");
  process.exit(2);
}
const project = gitText(resolve(target), "rev-parse", "--show-toplevel");
if (command === "pull") pull(project);
if (command === "push") {
  const { made, stopped } = push(project, { manual: true });
  console.log(`올리기: waveness 현재 브랜치에 커밋 ${made}개`);
  if (stopped) {
    console.error(stopped);
    process.exitCode = 1;
  }
}
if (command === "auto") {
  let notes;
  try {
    notes = auto(project, mode);
  } catch (error) {
    notes = [failure("동기화", error)];
  }
  report(notes);
}
