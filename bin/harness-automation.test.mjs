import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { checksPassed, cleanupBranches, deleteBranch, mergeReady, pathMatcher, register, repository, status, verifyConnection } from "./harness-automation.mjs";

// 실제 pre-commit의 작성자·인덱스 환경이 임시 원격 검사의 작성자를 덮어쓰지 않도록 격리
for (const key of Object.keys(process.env)) if (key.startsWith("GIT_")) delete process.env[key];

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const init = (path, branch = "main") => {
  mkdirSync(path, { recursive: true });
  git(path, "init", "-q", "-b", branch);
  git(path, "config", "user.name", "test");
  git(path, "config", "user.email", "test@example.com");
};
const commit = (path, message = "test") => { git(path, "add", "-A"); git(path, "commit", "-qm", message); };

test("새 프로젝트 등록은 권한·브랜치·서버 인증을 검사하고 원격 반영 전에는 완료로 판정하지 않음", () => {
  const temp = mkdtempSync(join(tmpdir(), "harness-register-"));
  try {
    const hub = join(temp, "hub");
    const project = join(temp, "project");
    init(project);
    git(project, "remote", "add", "origin", "https://github.com/test/new-project.git");
    mkdirSync(join(project, ".harness"));
    writeFileSync(join(project, ".harness/lock.json"), '{"synced":"source"}\n');
    mkdirSync(join(hub, ".harness"), { recursive: true });
    mkdirSync(join(hub, "templates"));
    writeFileSync(join(hub, ".harness/projects.json"), '{"hub":"test/hub","projects":[]}\n');
    writeFileSync(join(hub, "templates/harness-verify.yml"), "검사 워크플로\n");
    const before = readFileSync(join(hub, ".harness/projects.json"), "utf8");
    const request = (_repo, path) => {
      if (!path) return { permissions: { push: true } };
      if (path === "actions/secrets") return { secrets: [{ name: "HARNESS_SYNC_TOKEN" }] };
      if (path.startsWith("git/ref/heads/")) return { object: { sha: "base" } };
      throw new Error("원격 등록 미반영");
    };
    assert.throws(() => register(project, "main", (_repo, path) => path === "actions/secrets" ? { secrets: [] } : request(_repo, path), hub), /TOKEN 등록 필요/);
    assert.equal(readFileSync(join(hub, ".harness/projects.json"), "utf8"), before);
    assert.throws(() => register(project, "main", (_repo, path) => path === "" ? { permissions: { push: false } } : request(_repo, path), hub), /쓰기 권한/);
    assert.match(register(project, "main", request, hub), /등록 준비 완료/);
    assert.equal(JSON.parse(readFileSync(join(hub, ".harness/projects.json"))).projects.length, 1);
    register(project, "main", request, hub);
    assert.equal(JSON.parse(readFileSync(join(hub, ".harness/projects.json"))).projects.length, 1);
    assert.throws(() => register(project, "develop", request, hub), /다른 통합 브랜치/);
    assert.throws(() => verifyConnection(project, request, hub), /원격 등록 미반영/);
    const remote = (_repo, path) => ({ content: Buffer.from(path.includes("projects.json")
      ? readFileSync(join(hub, ".harness/projects.json")) : readFileSync(join(hub, "templates/harness-verify.yml"))).toString("base64") });
    assert.match(verifyConnection(project, remote, hub), /연결 등록 확인/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("GitHub 주소는 개인·회사 SSH 별칭을 해석하고 다른 호스트는 거부", () => {
  assert.equal(repository("https://github.com/owner/repo.git"), "owner/repo");
  assert.equal(repository("git@github-sollink:owner/repo.git"), "owner/repo");
  assert.equal(repository("git@github.com:owner/repo.git"), "owner/repo");
  assert.throws(() => repository("https://example.com/owner/repo.git"));
});

test("하네스 변경 범위는 제외 경로·상위 경로·제품 소스를 거부", () => {
  const allowed = pathMatcher(".harness/\n.codex/\n!.codex/local.toml\n");
  assert.ok(allowed(".harness/sync.sh"));
  for (const path of [".codex/local.toml", "src/app.ts", "../.harness/a", ".harness/../secret", "/.harness/a"])
    assert.equal(allowed(path), false, path);
});

test("필수 Actions 검사와 모든 최신 검사가 통과해야만 병합 가능", () => {
  const check = { id: 1, name: "하네스 검사", app: { id: 1, slug: "github-actions" }, status: "completed", conclusion: "success" };
  assert.equal(checksPassed([check], []), true);
  assert.equal(checksPassed([], []), false);
  for (const conclusion of ["failure", "cancelled", "skipped", "neutral", null])
    assert.equal(checksPassed([{ ...check, conclusion }], []), false);
  assert.equal(checksPassed([{ ...check, status: "in_progress" }], []), false);
  assert.equal(checksPassed([{ ...check, app: { id: 2, slug: "other" } }], []), false);
  assert.equal(checksPassed([check, { ...check, id: 2, conclusion: "failure" }], []), false);
  assert.equal(checksPassed([{ ...check, conclusion: "failure" }, { ...check, id: 2 }], []), true);
  assert.equal(checksPassed([check], [{ context: "deploy", state: "pending" }]), false);
  assert.equal(checksPassed([check], [{ context: "deploy", state: "success" }, { context: "deploy", state: "failure" }]), true);
  assert.equal(checksPassed([check, { ...check, id: 2, name: "선택 검사", conclusion: "skipped" }], []), true);
});

test("닫히거나 병합된 자동화 PR은 같은 계정·저장소·SHA이고 대체 열린 PR이 없을 때만 ref를 삭제", () => {
  for (const scenario of ["대체로 닫힘", "자동 병합", "열린 PR", "열린 대상 PR", "외부 저장소", "다른 작성자", "새 SHA", "이미 삭제", "삭제 경합", "삭제 실패", "표식 없음", "범위 밖 ref"]) {
    const branch = "harness/sync/receive/base-source-tree";
    const merged = scenario === "자동 병합";
    const pr = {
      number: 7, body: scenario === "표식 없음" ? "" : "<!-- harness-automation:v1 -->", user: { login: scenario === "다른 작성자" ? "other" : "bot" },
      head: { ref: scenario === "범위 밖 ref" ? "release/base-source-tree" : branch, sha: "head-sha", repo: { full_name: scenario === "외부 저장소" ? "fork/project" : "test/project" } },
    };
    const latest = { ...pr, state: scenario === "열린 대상 PR" ? "open" : "closed", merged };
    let refs = 0;
    const calls = [];
    const pushed = [];
    const call = (_repo, ...args) => {
      const path = args.at(-1);
      calls.push(path);
      if (path === "user") return JSON.stringify({ login: "bot" });
      if (path === `repos/test/project/pulls/${pr.number}`) return JSON.stringify(latest);
      if (path === "repos/test/project/pulls?state=open&per_page=100")
        return JSON.stringify(scenario === "열린 PR" ? [[{ number: 8, head: pr.head }]] : [[]]);
      if (path === `repos/test/project/git/ref/heads/${branch}`) {
        if (scenario === "이미 삭제") throw new Error("HTTP 404: Not Found");
        refs++;
        return JSON.stringify({ object: { sha: scenario === "새 SHA" || (scenario === "삭제 경합" && refs > 1) ? "new-sha" : "head-sha" } });
      }
      throw new Error(`예상하지 않은 API ${path}`);
    };
    const push = (command, args) => {
      pushed.push({ command, args });
      return { status: scenario === "삭제 실패" || scenario === "삭제 경합" ? 1 : 0 };
    };
    const run = () => deleteBranch("test/project", pr, merged, "harness/sync/receive/", call, push);
    if (scenario === "삭제 실패") assert.throws(run, /자동화 브랜치 삭제 실패/);
    else assert.equal(run(), ["대체로 닫힘", "자동 병합"].includes(scenario), scenario);
    assert.equal(pushed.length, ["대체로 닫힘", "자동 병합", "삭제 실패", "삭제 경합"].includes(scenario) ? 1 : 0, scenario);
    if (pushed.length) {
      assert.equal(pushed[0].command, "git");
      assert.ok(pushed[0].args.includes("--force-with-lease=refs/heads/" + branch + ":head-sha"));
      assert.ok(pushed[0].args.includes("https://github.com/test/project.git"));
      assert.ok(pushed[0].args.includes(`:refs/heads/${branch}`));
      assert.ok(pushed[0].args.includes("credential.helper=!gh auth git-credential"));
    }
    if (scenario === "외부 저장소") assert.equal(calls.length, 0);
  }
});

test("수동 병합과 대체 PR이 생긴 종료 PR만 정리하고 실패한 정리는 다음 실행에서 재시도", () => {
  const pr = (number, key, mergedAt = null) => ({
    number, body: "<!-- harness-automation:v1 -->", merged_at: mergedAt, user: { login: "bot" },
    head: { ref: `harness/sync/${key}/base-source-${number}`, repo: { full_name: "test/project" } },
  });
  const closed = [pr(1, "receive"), pr(3, "receive", "2026-10-30T00:00:00Z"), pr(7, "receive"),
    pr(10, "receive"), pr(11, "receive", "2026-10-30T00:00:00Z")];
  const open = [pr(2, "receive"), pr(8, "receive"), pr(9, "return-other", "2026-10-30T00:00:00Z")];
  const call = (_repo, ...args) => {
    const path = args.at(-1);
    if (path === "repos/test/project/git/matching-refs/heads/harness/sync/")
      return JSON.stringify([[...closed.filter((item) => item.number !== 11), ...open]
        .map((item) => ({ ref: `refs/heads/${item.head.ref}` }))]);
    if (path === "user") return JSON.stringify({ login: "bot" });
    if (path === "repos/test/project/pulls?state=open&per_page=100") return JSON.stringify([open]);
    if (path === "repos/test/project/pulls?state=closed&per_page=100") return JSON.stringify([closed]);
    throw new Error(`예상하지 않은 API ${path}`);
  };
  const removed = [];
  cleanupBranches("test/project", "harness/sync/", call, (...args) => removed.push(args));
  assert.deepEqual(removed.map((args) => args[1].number), [1, 3, 7, 10]);
  assert.ok(removed.every((args) => args[3] === "harness/sync/receive/"));
  assert.ok(!removed.some((args) => args[1].number === 2));
  const emptyCalls = [];
  cleanupBranches("test/project", "harness/sync/", (_repo, ...args) => {
    emptyCalls.push(args.at(-1));
    return "[[]]";
  }, () => assert.fail("ref 없는 저장소에서 삭제를 호출하지 않음"));
  assert.deepEqual(emptyCalls, ["repos/test/project/git/matching-refs/heads/harness/sync/"]);

  let attempts = 0;
  const retryCall = (_repo, ...args) => {
    const path = args.at(-1);
    if (path === "repos/test/project/git/matching-refs/heads/harness/sync/")
      return JSON.stringify([[{ ref: "refs/heads/harness/sync/receive/base-source-1" },
        { ref: "refs/heads/harness/sync/receive/base-source-2" }]]);
    if (path === "user") return JSON.stringify({ login: "bot" });
    if (path === "repos/test/project/pulls?state=open&per_page=100") return JSON.stringify([[pr(2, "receive")]]);
    if (path === "repos/test/project/pulls?state=closed&per_page=100") return JSON.stringify([[pr(1, "receive")]]);
    throw new Error(`예상하지 않은 API ${path}`);
  };
  const retry = () => cleanupBranches("test/project", "harness/sync/", retryCall, () => {
    attempts++;
    if (attempts === 1) throw new Error("자동화 브랜치 삭제 실패");
  });
  assert.throws(retry, /삭제 실패/);
  assert.doesNotThrow(retry);
  assert.equal(attempts, 2);
});

test("자동 병합은 작성 계정·출처·base·변경 경로·검사를 확인하고 최신 PR SHA를 전달", () => {
  for (const scenario of ["정상", "회사 Vercel", "개인 Vercel", "다른 작성자", "이전 출처", "이전 기준", "검사 없음", "검사 실패", "병합 커밋 검사 실패", "제품 변경", "제품 경로에서 이름 변경", "검사 중 기준 변경", "GitHub 거절"]) {
    const merged = [];
    const deleted = [];
    let refs = 0;
    const pr = {
      number: 1, body: `<!-- harness-automation:v1 -->\nSource: ${scenario === "이전 출처" ? "old" : "source"}\nBase: ${scenario === "이전 기준" ? "old" : "base"}\n`,
      head: { ref: "harness/sync/receive/a-b", sha: "latest-head", repo: { full_name: "test/project" } },
      ...(scenario === "병합 커밋 검사 실패" && { merge_commit_sha: "merge-head" }),
      user: { login: scenario === "다른 작성자" ? "other" : "owner" }, mergeable: true,
    };
    const call = (_repo, ...args) => {
      const path = args.find((arg) => arg.startsWith("repos/")) ?? args.at(-1);
      if (args.includes("PUT")) {
        merged.push(args);
        return JSON.stringify({ merged: scenario !== "GitHub 거절" });
      }
      if (path === "user") return '{"login":"owner"}';
      if (path.includes("pulls?")) return JSON.stringify([pr]);
      if (path.endsWith("pulls/1")) return JSON.stringify(pr);
      if (path.includes("git/ref/")) return JSON.stringify({ object: { sha: scenario === "검사 중 기준 변경" && refs++ > 0 ? "other-base" : "base" } });
      if (path.includes("/files?")) return JSON.stringify([[{ filename: scenario === "제품 변경" ? "src/app.ts" : ".harness/sync.sh", ...(scenario === "제품 경로에서 이름 변경" && { previous_filename: "src/app.ts" }) }]]);
      if (path.includes("/check-runs?")) return JSON.stringify([{ check_runs: scenario === "검사 없음" ? [] : [{ id: path.includes("merge-head") ? 1 : 2, app: { id: 1, slug: "github-actions" }, name: "하네스 검사", status: "completed", conclusion: scenario === "검사 실패" || path.includes("merge-head") ? "failure" : "success" }] }]);
      if (path.includes("/statuses?")) return scenario.endsWith("Vercel") ? '[[{"context":"Vercel","state":"success"}]]' : '[[]]';
      throw new Error(path);
    };
    const run = () => mergeReady("test/project", "develop", (path) => path.startsWith(".harness/"), "source", call,
      scenario === "회사 Vercel", (...args) => deleted.push(args));
    if (scenario === "GitHub 거절") assert.throws(run, /병합 거절/);
    else run();
    assert.equal(merged.length, ["정상", "개인 Vercel", "GitHub 거절"].includes(scenario) ? 1 : 0, scenario);
    assert.equal(deleted.length, ["정상", "개인 Vercel"].includes(scenario) ? 1 : 0, scenario);
    if (deleted.length) assert.deepEqual(deleted[0].slice(0, 4), ["test/project", pr, true, "harness/sync/"]);
    if (merged.length) assert.ok(merged[0].includes("sha=latest-head"));
  }
});

test("세션 상태 안내는 최신·PR 대기·원격 반영·대상 밖 변경을 구분하고 작업 트리를 보존", () => {
  const temp = mkdtempSync(join(tmpdir(), "harness-status-"));
  try {
    init(temp, "develop");
    git(temp, "remote", "add", "origin", "https://github.com/test/project.git");
    mkdirSync(join(temp, ".harness"));
    writeFileSync(join(temp, ".harness/paths"), ".harness/\nAGENTS.md\n!.harness/local.json\n");
    writeFileSync(join(temp, ".harness/lock.json"), JSON.stringify({ synced: "old", branch: "develop" }));
    writeFileSync(join(temp, "product.txt"), "제품 작업\n");
    commit(temp);
    writeFileSync(join(temp, "product.txt"), "진행 중인 제품 작업\n");
    const before = [git(temp, "rev-parse", "HEAD"), git(temp, "diff"), git(temp, "status", "--porcelain"), readFileSync(join(temp, ".harness/lock.json"), "utf8")];
    const request = (_repo, path) => {
      if (path === "commits/main") return { sha: "new" };
      if (path.startsWith("pulls?")) return [];
      if (path.startsWith("contents/")) return { content: Buffer.from('{"synced":"old"}').toString("base64") };
      if (path.startsWith("compare/")) return { files: [{ filename: "harness/AGENTS.md" }] };
      if (path.startsWith("actions/runs?")) return { workflow_runs: [] };
      throw new Error(`예상하지 않은 경로 ${path}`);
    };
    assert.match(status(temp, request)[0], /업데이트 있음.*자동 업데이트 PR 생성 대기/s);
    assert.match(status(temp, (_repo, path) => path.startsWith("actions/runs?") ? { workflow_runs: [{ name: "Harness Sync", head_sha: "new", conclusion: "failure", html_url: "https://github.com/test/hub/actions/runs/1" }] } : request(_repo, path))[0], /자동 업데이트 실행 실패/);
    assert.deepEqual(status(temp, (_repo, path) => path === "commits/main" ? { sha: "old" } : request(_repo, path)), []);
    assert.deepEqual(status(temp, (_repo, path) => path.startsWith("compare/") ? { files: [{ filename: "harness/.harness/local.json" }] } : request(_repo, path)), []);
    assert.match(status(temp, (_repo, path) => path.startsWith("contents/") ? { content: Buffer.from('{"synced":"new"}').toString("base64") } : request(_repo, path))[0], /원격 develop에 업데이트가 반영/);
    assert.match(status(temp, (_repo, path) => path.startsWith("pulls?") ? [{ body: "<!-- harness-automation:v1 -->", head: { ref: "harness/sync/receive/a-b" }, base: { ref: "develop" }, html_url: "https://github.com/test/project/pull/1" }] : request(_repo, path))[0], /pull\/1/);
    const after = [git(temp, "rev-parse", "HEAD"), git(temp, "diff"), git(temp, "status", "--porcelain"), readFileSync(join(temp, ".harness/lock.json"), "utf8")];
    assert.deepEqual(after, before);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("기존 auto와 실제 세션 셸은 조회 실패에서도 HEAD·인덱스·미커밋 작업을 보존", () => {
  const temp = mkdtempSync(join(tmpdir(), "harness-session-"));
  try {
    init(temp);
    mkdirSync(join(temp, ".harness"));
    writeFileSync(join(temp, ".harness/lock.json"), '{"synced":"old"}');
    writeFileSync(join(temp, "product.txt"), "제품\n");
    commit(temp);
    writeFileSync(join(temp, "product.txt"), "스테이징된 작업\n");
    git(temp, "add", "product.txt");
    writeFileSync(join(temp, "untracked.txt"), "작업 중\n");
    mkdirSync(join(temp, "bin"));
    writeFileSync(join(temp, "bin/gh"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    const snapshot = () => [git(temp, "rev-parse", "HEAD"), git(temp, "diff", "--cached"), git(temp, "status", "--porcelain")];
    const before = snapshot();
    const env = { ...process.env, PATH: `${join(temp, "bin")}:${process.env.PATH}`, HARNESS_HUB: ROOT };
    const auto = spawnSync(process.execPath, [join(ROOT, "bin/harness.mjs"), "auto", temp], { env, encoding: "utf8" });
    assert.equal(auto.status, 0, auto.stderr);
    assert.match(auto.stdout, /업데이트 확인 실패/);
    const session = spawnSync("/bin/sh", [join(ROOT, "harness/.harness/sync.sh"), "session"], { cwd: temp, env, encoding: "utf8" });
    assert.equal(session.status, 0, session.stderr);
    assert.match(JSON.parse(session.stdout).systemMessage, /업데이트 확인 실패/);
    assert.deepEqual(snapshot(), before);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("격리 PR 전달은 원격 main을 바꾸지 않고 반복 실행에서 PR을 중복 생성하지 않음", () => {
  const temp = mkdtempSync(join(tmpdir(), "harness-coordinator-"));
  try {
    const hub = join(temp, "hub");
    const project = join(temp, "project");
    init(hub);
    for (const path of ["bin", "templates"]) cpSync(join(ROOT, path), join(hub, path), { recursive: true });
    mkdirSync(join(hub, "harness/.harness"), { recursive: true });
    cpSync(join(ROOT, "harness/.harness/install-checks.mjs"), join(hub, "harness/.harness/install-checks.mjs"));
    writeFileSync(join(hub, "harness/.harness/paths"), "AGENTS.md\n.harness/\n!.harness/lock.json\n!.harness/checks.json\n");
    writeFileSync(join(hub, "harness/AGENTS.md"), "공용 규칙\n");
    writeFileSync(join(hub, "bin/hub-hooks.mjs"), "// 픽스처에 루트 훅 등록 없음\n");
    commit(hub);
    const source = git(hub, "rev-parse", "HEAD");
    init(project, "develop");
    mkdirSync(join(project, ".harness"));
    cpSync(join(hub, "harness/.harness/paths"), join(project, ".harness/paths"));
    writeFileSync(join(project, "AGENTS.md"), "공용 규칙\n");
    writeFileSync(join(project, ".harness/lock.json"), JSON.stringify({ name: "project", synced: source, branch: "develop" }));
    mkdirSync(join(project, "docs/agent-rules"), { recursive: true });
    writeFileSync(join(project, "docs/agent-rules/project.md"), "프로젝트 소유 규칙\n");
    writeFileSync(join(project, ".harness/checks.json"), "{}\n");
    writeFileSync(join(project, "product.txt"), "제품\n");
    commit(project);
    const original = git(project, "rev-parse", "HEAD");
    for (const name of ["hub", "project"]) git(temp, "clone", "-q", "--bare", join(temp, name), join(temp, `${name}.git`));
    mkdirSync(join(hub, ".harness"));
    writeFileSync(join(hub, ".harness/projects.json"), JSON.stringify({ hub: "test/hub", projects: [{ repo: "test/project", branch: "develop" }] }));
    const stub = join(temp, "bin");
    mkdirSync(stub);
    const state = join(temp, "prs.json");
    writeFileSync(state, "[]");
    writeFileSync(join(stub, "gh"), `#!${process.execPath}
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
const args=process.argv.slice(2),root=process.env.TEST_TEMP,state=root+'/prs.json';
const git=(...a)=>execFileSync('git',a,{encoding:'utf8'}).trim();
if(args[0]==='repo') git('clone','-q','--branch',args[6],root+'/'+args[2].split('/')[1]+'.git',args[3]);
else if(args[0]==='api') {
 const path=args.at(-1);
 if(path.includes('/git/matching-refs/')) console.log('[[]]');
 else if(path.includes('/pulls?')) console.log(readFileSync(state,'utf8'));
 else if(path.includes('/git/ref/heads/')) console.log(JSON.stringify({object:{sha:process.env.TEST_UPSTREAM_MOVED ? 'moved' : git('--git-dir',root+'/'+path.split('/')[2]+'.git','rev-parse',path.split('/').at(-1))}}));
 else if(path.includes('/pulls/')) console.log(JSON.stringify({...JSON.parse(readFileSync(state))[0],mergeable:false}));
 else if(path==='user') console.log('{"login":"test","id":7,"name":"검사 계정"}');
 else throw Error('예상하지 않은 API '+path);
} else if(args[0]==='pr' && args[1]==='create') {
 const get=k=>args[args.indexOf(k)+1];
 writeFileSync(state,JSON.stringify([{number:1,body:get('--body'),head:{ref:get('--head'),repo:{full_name:get('--repo')}},base:{ref:get('--base')},html_url:'https://github.com/test/project/pull/1'}]));
 console.log('https://github.com/test/project/pull/1');
}
`, { mode: 0o755 });
    const run = (env = {}) => spawnSync(process.execPath, [join(hub, "bin/harness-automation.mjs"), "run"], {
      cwd: hub, encoding: "utf8", env: { ...process.env, PATH: `${stub}:${process.env.PATH}`, TEST_TEMP: temp, ...env },
    });
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /pull\/1/);
    const published = JSON.parse(readFileSync(state))[0].head.ref;
    assert.equal(git(temp, "--git-dir", join(temp, "project.git"), "log", "-1", "--format=%ae", published), "7+test@users.noreply.github.com");
    assert.equal(git(temp, "--git-dir", join(temp, "project.git"), "rev-parse", "develop"), original);
    assert.equal(git(project, "status", "--porcelain"), "");
    const second = run();
    assert.equal(second.status, 0, second.stderr);
    assert.equal(JSON.parse(readFileSync(state)).length, 1);
    assert.doesNotMatch(second.stdout, /pull\/1/);
    writeFileSync(join(hub, ".harness/projects.json"), JSON.stringify({ hub: "test/hub", upstream: "test/hub", projects: [{ repo: "test/missing", branch: "develop" }] }));
    const failed = run({ TEST_UPSTREAM_MOVED: "1" });
    assert.equal(failed.status, 1, failed.stderr);
    assert.match(failed.stderr, /동기화 실패: test\/missing/);
    assert.doesNotMatch(failed.stderr, /허브 간 동기화 중단/);
    writeFileSync(join(hub, ".harness/projects.json"), JSON.stringify({ hub: "test/hub", upstream: "test/hub", projects: [] }));
    const moved = run({ TEST_UPSTREAM_MOVED: "1" });
    assert.equal(moved.status, 0, moved.stderr);
    assert.doesNotMatch(moved.stdout, /pull\/1/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
