// 사용자 체크아웃을 바꾸지 않는 하네스 상태 안내·PR 전달·검사 후 병합
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MARKER = "<!-- harness-automation:v1 -->";
const VERIFY = ".github/workflows/harness-verify.yml";
const REPO = /^[\w.-]+\/[\w.-]+$/;
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const json = (file) => JSON.parse(readFileSync(file, "utf8"));

// 기존 Git 훅의 저장소 선택 변수가 격리 체크아웃에 전파되지 않도록 제거
for (const key of ["GIT_DIR", "GIT_INDEX_FILE", "GIT_WORK_TREE", "GIT_PREFIX", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES"])
  delete process.env[key];

export const repository = (url) => {
  const match = url.match(/(?:github\.com[/:]|github-[\w-]+:)([\w.-]+\/[\w.-]+?)(?:\.git)?$/);
  if (!match) throw new Error("GitHub origin 주소를 확인하세요");
  return match[1];
};

const accountTokens = new Map();
const tokenFor = (repo) => {
  const configFile = join(ROOT, ".harness/projects.json");
  const config = existsSync(configFile) ? json(configFile) : {};
  const owner = config.hub?.split("/")[0];
  const company = config.projectAccount && !repo.startsWith(`${owner}/`);
  const configured = company ? process.env.HARNESS_PROJECT_TOKEN : process.env.HARNESS_SYNC_TOKEN;
  if (configured || process.env.GH_TOKEN) return configured ?? process.env.GH_TOKEN;
  const account = company ? config.projectAccount : owner;
  if (!account) return undefined;
  if (!accountTokens.has(account)) {
    const result = spawnSync("gh", ["auth", "token", "--user", account], { encoding: "utf8", timeout: 10000 });
    accountTokens.set(account, result.status === 0 ? result.stdout.trim() : undefined);
  }
  return accountTokens.get(account);
};

const gh = (repo, ...args) => execFileSync("gh", args, {
  encoding: "utf8", timeout: 30000, stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, ...(tokenFor(repo) && { GH_TOKEN: tokenFor(repo) }) },
}).trim();
const api = (repo, path) => JSON.parse(gh(repo, "api", `repos/${repo}${path ? `/${path}` : ""}`));

export const pathMatcher = (text) => {
  const rules = text.split("\n").filter((line) => line && !line.startsWith("#"));
  const hit = (path, rule) => rule.endsWith("/") ? path.startsWith(rule) : path === rule;
  return (path) => !path.split("/").includes("..") && !path.startsWith("/") &&
    rules.some((rule) => !rule.startsWith("!") && hit(path, rule)) &&
    !rules.some((rule) => rule.startsWith("!") && hit(path, rule.slice(1)));
};

export function register(project, branch, request = api, hubRoot = ROOT) {
  const configFile = join(hubRoot, ".harness/projects.json");
  const config = json(configFile);
  const lockFile = join(project, ".harness/lock.json");
  const lock = json(lockFile);
  if (existsSync(join(project, "package.json")) && !["pnpm-lock.yaml", "package-lock.json"].some((file) => existsSync(join(project, file))))
    throw new Error("기본 검사 워크플로는 pnpm·npm 고정 lockfile 필요, 다른 패키지 관리자는 검사 절차 확장 필요");
  if (!branch) throw new Error("프로젝트 규칙에서 확인한 통합 브랜치 필요");
  git(project, "check-ref-format", "--branch", branch);
  const repo = repository(git(project, "remote", "get-url", "origin"));
  if (config.projects.some((entry) => entry.repo === repo && entry.branch !== branch))
    throw new Error("이미 다른 통합 브랜치로 등록된 프로젝트");
  const info = request(repo, "");
  if (!info.permissions?.push) throw new Error("자동 업데이트 계정의 저장소 쓰기 권한 필요");
  request(repo, `git/ref/heads/${branch}`);
  const secrets = request(config.hub, "actions/secrets").secrets.map((entry) => entry.name);
  const required = ["HARNESS_SYNC_TOKEN"];
  if (config.projectAccount && !repo.startsWith(`${config.hub.split("/")[0]}/`)) required.push("HARNESS_PROJECT_TOKEN");
  for (const secret of required) if (!secrets.includes(secret)) throw new Error(`${config.hub}: ${secret} 등록 필요`);
  const workflow = join(project, VERIFY);
  const source = readFileSync(join(hubRoot, "templates/harness-verify.yml"), "utf8");
  if (existsSync(workflow) && readFileSync(workflow, "utf8") !== source)
    throw new Error("기존 하네스 검사 워크플로 내용 검토 필요");
  // 모든 사전 검사 후에만 등록 파일·워크플로·명시적 통합 브랜치를 함께 반영
  if (!config.projects.some((entry) => entry.repo === repo)) config.projects.push({ repo, branch });
  mkdirSync(dirname(workflow), { recursive: true });
  writeFileSync(workflow, source);
  writeFileSync(lockFile, `${JSON.stringify({ ...lock, branch }, null, 2)}\n`);
  writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
  return `${repo} → ${config.hub} 등록 준비 완료. 프로젝트와 허브의 등록 변경을 모두 커밋·push한 뒤 연결 완료 여부 확인 필요`;
}

export function verifyConnection(project, request = api, hubRoot = ROOT) {
  const config = json(join(hubRoot, ".harness/projects.json"));
  const repo = repository(git(project, "remote", "get-url", "origin"));
  const branch = json(join(project, ".harness/lock.json")).branch;
  const read = (target, path) => Buffer.from(request(target, path).content, "base64").toString();
  const registered = JSON.parse(read(config.hub, "contents/.harness/projects.json?ref=main")).projects;
  if (!branch || !registered.some((entry) => entry.repo === repo && entry.branch === branch))
    throw new Error("허브 origin/main에 프로젝트·통합 브랜치 등록 미반영");
  if (read(repo, `contents/${VERIFY}?ref=${encodeURIComponent(branch)}`) !== readFileSync(join(hubRoot, "templates/harness-verify.yml"), "utf8"))
    throw new Error("프로젝트 원격 통합 브랜치에 검사 워크플로 미반영");
  return `${repo}: 서버 자동 PR·검사·병합 연결 등록 확인`;
}

export const checksPassed = (runs, statuses, requireHarness = true) => {
  // 이름만 같은 외부 상태가 필수 Actions 검사를 대신하지 못하도록 app도 확인
  const latest = new Map();
  for (const run of [...runs].sort((a, b) => a.id - b.id)) latest.set(`${run.app?.id}:${run.name}`, run);
  const checks = [...latest.values()];
  const required = checks.filter((run) => run.name === "하네스 검사" && run.app?.slug === "github-actions");
  const contexts = new Map();
  for (const status of statuses) if (!contexts.has(status.context)) contexts.set(status.context, status);
  return (!requireHarness || (required.length === 1 && required[0].conclusion === "success")) &&
    checks.every((run) => run.status === "completed" && ["success", "skipped", "neutral"].includes(run.conclusion)) &&
    [...contexts.values()].every((status) => status.state === "success");
};

export function status(project, request = api) {
  const lockFile = join(project, ".harness/lock.json");
  if (!existsSync(lockFile)) return [];
  const lock = json(lockFile);
  const hub = repository(git(ROOT, "remote", "get-url", "origin"));
  const repo = repository(git(project, "remote", "get-url", "origin"));
  const head = request(hub, "commits/main").sha;
  if (lock.synced === head) return [];
  const prs = request(repo, "pulls?state=open&per_page=100").filter((pr) => pr.body?.includes(MARKER) && pr.head.ref.startsWith("harness/sync/"));
  const pr = prs.find((item) => item.base.ref === lock.branch) ?? prs[0];
  if (pr) return [`[하네스] ${hub} 업데이트 있음\n자동 업데이트 PR: ${pr.html_url}\n상태: 검사·병합 대기 (실패·충돌 시 해당 PR 확인)`];
  const branch = lock.branch ?? ["develop", "main", "master"].find((name) => {
    try { git(project, "rev-parse", "--verify", `refs/heads/${name}`); return true; } catch { return false; }
  });
  const remoteLock = request(repo, `contents/.harness/lock.json?ref=${encodeURIComponent(branch ?? "main")}`);
  const remote = JSON.parse(Buffer.from(remoteLock.content, "base64").toString());
  if (remote.synced !== lock.synced)
    return [`[하네스] 원격 ${branch}에 업데이트가 반영되었습니다. 현재 작업을 정리한 뒤 ${branch}을 받아주세요.`];
  const mapped = pathMatcher(readFileSync(join(project, ".harness/paths"), "utf8"));
  const comparison = request(hub, `compare/${lock.synced}...${head}`);
  if (comparison.files.length < 300 && !comparison.files.some((file) =>
    file.filename.startsWith("harness/") && mapped(file.filename.slice(8)))) return [];
  const runs = request(hub, "actions/runs?branch=main&per_page=20").workflow_runs;
  const sync = runs.find((run) => run.name === "Harness Sync");
  if (sync?.head_sha === head && sync.conclusion === "failure")
    return [`[하네스] 허브 자동 업데이트 실행 실패. 원인 확인: ${sync.html_url}`];
  return [`[하네스] ${hub} 업데이트 있음 (${head.slice(0, 7)}). 자동 업데이트 PR 생성 대기\nhttps://github.com/${repo}/pulls`];
}

function hubsStatus() {
  const configFile = join(ROOT, ".harness/projects.json");
  if (!existsSync(configFile)) return [];
  const config = json(configFile);
  const repos = [config.hub, config.upstream].filter(Boolean);
  const prs = repos.flatMap((repo) => api(repo, "pulls?state=open&per_page=100")
    .filter((pr) => pr.body?.includes(MARKER) && pr.head.ref.startsWith("harness/sync/"))
    .map((pr) => `[하네스] 자동 업데이트 검사·병합 대기: ${pr.html_url}`));
  return prs;
}

const report = (notes) => {
  if (!notes.length) return;
  const message = notes.join("\n");
  if (process.env.HARNESS_HOOK_JSON) console.log(JSON.stringify({
    systemMessage: message,
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: message },
  }));
  else console.log(message);
};

function clone(repo, branch, path) {
  if (!REPO.test(repo)) throw new Error("저장소 이름 형식 오류");
  gh(repo, "repo", "clone", repo, path, "--", "--branch", branch, "--no-single-branch");
  const author = JSON.parse(gh(repo, "api", "user"));
  git(path, "config", "user.name", author.name || author.login);
  git(path, "config", "user.email", `${author.id}+${author.login}@users.noreply.github.com`);
}

// 준비 중인 프로젝트 코드는 인증 정보 없이 실행, 실제 검사는 PR의 읽기 전용 CI에서 수행
function prepare(hub, command, project, extra = {}) {
  const env = { ...process.env, ...extra, ...(command === "pull" && { HARNESS_PRESERVE_PROJECT_MODELS: "1" }) };
  for (const key of Object.keys(env)) if (/TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(key)) delete env[key];
  const result = spawnSync(process.execPath, [join(hub, "bin/harness.mjs"), command, project], {
    cwd: hub, env, encoding: "utf8", maxBuffer: 1 << 24,
  });
  if (result.status !== 0 || /보류|중단|실패/.test(result.stdout))
    throw new Error(result.stderr || result.stdout || `${command} 실패`);
  return result.stdout;
}

function publish(repo, base, path, key, source, allowed) {
  const baseSha = git(path, "rev-parse", `origin/${base}`);
  const files = git(path, "diff", "--name-only", baseSha, "HEAD").split("\n").filter(Boolean);
  if (!files.length) return;
  if (!files.every(allowed)) throw new Error(`${repo}: 하네스 범위 밖 변경 차단`);
  const tree = git(path, "rev-parse", "HEAD^{tree}");
  const branch = `harness/sync/${key}/${baseSha.slice(0, 12)}-${source.slice(0, 12)}-${tree.slice(0, 12)}`;
  const prs = api(repo, `pulls?state=open&base=${encodeURIComponent(base)}&per_page=100`);
  if (prs.some((pr) => pr.head.ref === branch)) return;
  // 격리 체크아웃의 helper만 설정, 전역 Git 설정·URL·파일에 토큰 저장 없음
  git(path, "config", "--replace-all", "credential.https://github.com.helper", "");
  git(path, "config", "--add", "credential.https://github.com.helper", "!gh auth git-credential");
  const pushed = spawnSync("git", ["push", "origin", `HEAD:refs/heads/${branch}`], {
    cwd: path, encoding: "utf8", env: { ...process.env, GH_TOKEN: tokenFor(repo) },
  });
  if (pushed.status !== 0) {
    // PR 생성 직전에 끊긴 실행은 동일한 트리의 원격 브랜치를 재사용, 재작성 없음
    const fetched = spawnSync("git", ["fetch", "--no-tags", "origin", `refs/heads/${branch}`], {
      cwd: path, encoding: "utf8", env: { ...process.env, GH_TOKEN: tokenFor(repo) },
    });
    if (fetched.status !== 0 || git(path, "rev-parse", "FETCH_HEAD^{tree}") !== tree)
      throw new Error(`${repo}: 자동화 브랜치 push 실패`);
  }
  const body = `${MARKER}\n\n공용 하네스 업데이트. 변경 범위 검사와 모든 CI 통과 후 자동 병합.\n\nSource: ${source}\nBase: ${baseSha}\n`;
  const url = gh(repo, "pr", "create", "--repo", repo, "--base", base, "--head", branch,
    "--title", "chore(harness): 공용 하네스 자동 업데이트", "--body", body);
  console.log(url);
  for (const pr of prs.filter((item) => item.body?.includes(MARKER) && item.head.ref.startsWith(`harness/sync/${key}/`)))
    gh(repo, "pr", "close", String(pr.number), "--repo", repo);
}

export function mergeReady(repo, base, allowed, source, call = gh) {
  const request = (path) => JSON.parse(call(repo, "api", `repos/${repo}/${path}`));
  const prs = request(`pulls?state=open&base=${encodeURIComponent(base)}&per_page=100`);
  for (const item of prs) {
    if (!item.body?.includes(MARKER) || !item.head.ref.startsWith("harness/sync/") || item.head.repo?.full_name !== repo) continue;
    const pr = request(`pulls/${item.number}`);
    if (source && !pr.body.includes(`Source: ${source}\n`)) continue;
    const account = JSON.parse(call(repo, "api", "user")).login;
    if (pr.user?.login !== account) continue;
    // 다른 변경이 먼저 병합되면 새 base에서 재생성, 과거 base 검사 결과로 병합하지 않음
    const baseSha = request(`git/ref/heads/${base}`).object.sha;
    if (!pr.body.includes(`Base: ${baseSha}\n`) || pr.mergeable !== true || pr.draft) continue;
    const files = JSON.parse(call(repo, "api", "--paginate", "--slurp", `repos/${repo}/pulls/${pr.number}/files?per_page=100`)).flat();
    if (!files.length || !files.every((file) => allowed(file.filename) && (!file.previous_filename || allowed(file.previous_filename)))) continue;
    if (files.some((file) => file.filename === VERIFY)) {
      const workflow = request(`contents/${VERIFY}?ref=${pr.head.sha}`);
      if (Buffer.from(workflow.content, "base64").toString() !== readFileSync(join(ROOT, "templates/harness-verify.yml"), "utf8")) continue;
    }
    const results = [];
    // GitHub가 테스트 병합 커밋에 연결한 검사도 확인, head 검사만으로 병합하지 않음
    for (const sha of new Set([pr.head.sha, pr.merge_commit_sha].filter(Boolean))) {
      const runs = JSON.parse(call(repo, "api", "--paginate", "--slurp", `repos/${repo}/commits/${sha}/check-runs?per_page=100`)).flatMap((page) => page.check_runs);
      const statuses = JSON.parse(call(repo, "api", "--paginate", "--slurp", `repos/${repo}/commits/${sha}/statuses?per_page=100`)).flat();
      results.push({ runs, statuses });
    }
    const selected = results.findLast((result) => result.runs.length || result.statuses.length) ?? results[0];
    if (!results.every((result) => checksPassed(result.runs, result.statuses, false)) || !checksPassed(selected.runs, selected.statuses)) continue;
    if (request(`git/ref/heads/${base}`).object.sha !== baseSha) continue;
    const result = JSON.parse(call(repo, "api", "--method", "PUT", `repos/${repo}/pulls/${pr.number}/merge`,
      "-f", `sha=${pr.head.sha}`, "-f", "merge_method=merge"));
    if (!result.merged) throw new Error(`${repo}#${pr.number}: GitHub 병합 거절`);
    console.log(`${repo}#${pr.number}: 검사 통과 후 병합`);
    break;
  }
}

const hubAllowed = (path) => path.startsWith("harness/") || [".claude/settings.json", ".codex/hooks.json"].includes(path);

function regenerate(hub) {
  execFileSync(process.execPath, [join(hub, "bin/hub-hooks.mjs")], { cwd: hub, stdio: "pipe" });
  const configs = [".claude/settings.json", ".codex/hooks.json"];
  if (!git(hub, "status", "--porcelain", "--", ...configs)) return;
  git(hub, "add", "--", ...configs);
  git(hub, "commit", "-q", "-m", "chore(hooks): 허브 훅 등록 갱신", "-m", "Harness-Scope: sync");
}

export function coordinate() {
  const config = json(join(ROOT, ".harness/projects.json"));
  const errors = [];
  for (const target of config.projects) {
    const temp = mkdtempSync(join(tmpdir(), "harness-pr-"));
    try {
      const hub = join(temp, "hub");
      const project = join(temp, "project");
      clone(config.hub, "main", hub);
      clone(target.repo, target.branch, project);
      const lock = json(join(project, ".harness/lock.json"));
      if (lock.branch && lock.branch !== target.branch) throw new Error("등록과 lock의 통합 브랜치 불일치");
      const originalPaths = readFileSync(join(project, ".harness/paths"), "utf8");
      const allowed = (path) => path === VERIFY || path === ".harness/lock.json" ||
        (pathMatcher(readFileSync(join(hub, "harness/.harness/paths"), "utf8"))(path) && pathMatcher(originalPaths)(path));
      mergeReady(target.repo, target.branch, allowed, git(hub, "rev-parse", "HEAD"));
      // 병합으로 base가 바뀐 경우 이번 체크아웃은 버리고 다음 실행에서 최신 base 사용
      if (api(target.repo, `git/ref/heads/${target.branch}`).object.sha !== git(project, "rev-parse", "HEAD")) continue;
      const source = git(hub, "rev-parse", "HEAD");
      prepare(hub, "pull", project);
      mkdirSync(join(project, ".github/workflows"), { recursive: true });
      cpSync(join(ROOT, "templates/harness-verify.yml"), join(project, VERIFY));
      const meaningful = git(project, "diff", "--name-only").split("\n").filter((path) => path && path !== ".harness/lock.json");
      meaningful.push(...git(project, "ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean));
      // 이미 내용이 같아도 공용 파일이 바뀌었으면 다음 3-way 기준을 PR로 갱신
      const relevant = git(hub, "diff", "--name-only", lock.synced, source, "--", "harness/").split("\n")
        .some((path) => path.startsWith("harness/") && allowed(path.slice(8)));
      if (meaningful.length || relevant) {
        git(project, "add", "-A");
        git(project, "commit", "-q", "-m", "chore(harness): 공용 하네스 자동 업데이트", "-m", "Harness-Sync: 공용 하네스 동기화\nHarness-Scope: sync");
        publish(target.repo, target.branch, project, "receive", source, allowed);
      } else git(project, "restore", "--", ".harness/lock.json");

      // 프로젝트 generic 변경은 별도의 허브 체크아웃에 반영
      prepare(hub, "push", project);
      regenerate(hub);
      mergeReady(config.hub, "main", hubAllowed);
      if (api(config.hub, "git/ref/heads/main").object.sha !== git(hub, "rev-parse", "origin/main")) continue;
      publish(config.hub, "main", hub, `return-${basename(target.repo)}`, git(project, "rev-parse", `origin/${target.branch}`), hubAllowed);
    } catch (error) {
      // Git·gh 오류에는 인증 URL이 들어갈 수 있어 외부 명령 stderr를 공개 로그에 재출력하지 않음
      const message = `${target.repo}: 동기화 중단 (${error instanceof Error ? error.message.split("\n")[0].replace(/https:\/\/[^\s]+/g, "[URL]") : "오류"})`;
      console.error(message);
      errors.push(target.repo);
    } finally { rmSync(temp, { recursive: true, force: true }); }
  }
  if (config.upstream) {
    const temp = mkdtempSync(join(tmpdir(), "harness-hubs-"));
    try {
      const hub = join(temp, "waveness");
      const up = join(temp, "seungness");
      clone(config.hub, "main", hub);
      clone(config.upstream, "main", up);
      const allowed = (path) => hubAllowed(path) || path === ".harness/upstream.json";
      mergeReady(config.hub, "main", allowed);
      mergeReady(config.upstream, "main", hubAllowed);
      if (api(config.hub, "git/ref/heads/main").object.sha !== git(hub, "rev-parse", "HEAD") || api(config.upstream, "git/ref/heads/main").object.sha !== git(up, "rev-parse", "HEAD")) return;
      const hubHead = git(hub, "rev-parse", "HEAD");
      const upHead = git(up, "rev-parse", "HEAD");
      prepare(hub, "prepare-upstream", up, { UPSTREAM_HUB: up });
      regenerate(hub);
      regenerate(up);
      if (git(up, "rev-parse", "HEAD") !== upHead)
        publish(config.upstream, "main", up, "from-waveness", hubHead, hubAllowed);
      // upstream PR 병합 전의 커밋을 waveness lock 기준으로 사용하지 않음
      else publish(config.hub, "main", hub, "from-seungness", upHead, allowed);
    } catch { errors.push(config.upstream); console.error("허브 간 동기화 중단: Actions 로그와 로컬 prepare-upstream 결과 확인"); }
    finally { rmSync(temp, { recursive: true, force: true }); }
  }
  if (errors.length) throw new Error(`동기화 실패: ${errors.join(", ")}`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, target] = process.argv.slice(2);
  if (command === "status") {
    try { report(status(resolve(target ?? "."))); }
    catch { report(["[하네스] 업데이트 확인 실패. GitHub 인증·네트워크와 자동 업데이트 Actions 실행 결과를 확인하세요."]); }
  } else if (command === "status-hubs") {
    try { report(hubsStatus()); }
    catch { report(["[하네스] 업데이트 PR 조회 실패. GitHub 인증·네트워크를 확인하세요."]); }
  } else if (command === "run") {
    try { coordinate(); } catch (error) { console.error(error.message); process.exitCode = 1; }
  } else if (command === "register") {
    try { console.log(register(resolve(target ?? "."), process.argv[4])); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  } else if (command === "verify-connection") {
    try { console.log(verifyConnection(resolve(target ?? "."))); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  } else { console.error("사용법: node bin/harness-automation.mjs status <프로젝트> | status-hubs | run | register <프로젝트> <통합 브랜치> | verify-connection <프로젝트>"); process.exitCode = 2; }
}
