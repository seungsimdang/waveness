// harness.mjs·check-scope.sh 동작 검사: 임시 waveness·원격·프로젝트 저장소에서 양방향 동기화를 재현함
// 실행: node --test bin/*.test.mjs
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

for (const key of Object.keys(process.env)) if (key.startsWith("GIT_")) delete process.env[key];
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
  // commit·push 뒤 분리 실행되는 git maintenance가 임시 저장소 삭제 중에 파일을 만들어 rmSync가 ENOTEMPTY로 실패하므로 끔
  GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "maintenance.auto", GIT_CONFIG_VALUE_0: "false",
};
const git = (cwd, ...args) => execFileSync("git", args, { cwd, env: ENV }).toString().trim();
const commit = (cwd, ...messages) => git(cwd, "commit", "-q", ...messages.flatMap((m) => ["-m", m]));
const read = (...parts) => readFileSync(join(...parts), "utf8");
const run = (hub, ...args) =>
  spawnSync("node", [join(hub, "bin/harness.mjs"), ...args], { env: ENV }).stdout.toString();

function setup() {
  const root = mkdtempSync(join(tmpdir(), "harness-test-"));
  const remote = join(root, "remote.git");
  const hub = join(root, "waveness");
  const project = join(root, "app");
  git(root, "init", "-q", "--bare", "-b", "main", remote);
  git(root, "clone", "-q", remote, hub);
  for (const dir of ["bin", "templates", "harness"]) cpSync(join(SRC, dir), join(hub, dir), { recursive: true, verbatimSymlinks: true });
  git(hub, "add", ".");
  commit(hub, "init");
  git(hub, "push", "-q", "origin", "HEAD:main");
  git(root, "init", "-q", "-b", "develop", project);
  writeFileSync(join(project, "app.txt"), "app\n");
  git(project, "add", ".");
  commit(project, "app");
  return { root, hub, project };
}

test("격리 체크아웃의 받기·올리기 준비에서 프로젝트 전용 변경은 남기고 범용 변경만 올림", () => {
  const { root, hub, project } = setup();
  try {
    run(hub, "pull", project);
    assert.equal(read(project, "AGENTS.md"), read(hub, "harness/AGENTS.md"));
    assert.ok(read(project, "docs/agent-rules/project.md").startsWith("# 프로젝트 규칙"));
    git(project, "add", "-A");
    commit(project, "chore: 하네스 연결", "Harness-Scope: sync");

    // 프로젝트: AGENTS.md 끝에 전용 줄(project), git-safety.md 끝에 범용 줄(generic)
    appendFileSync(join(project, "AGENTS.md"), "\n프로젝트 전용 줄\n");
    git(project, "add", "AGENTS.md");
    commit(project, "docs: 전용 규칙", "Harness-Scope: project");
    appendFileSync(join(project, "docs/agent-rules/git-safety.md"), "\n범용 개선 줄\n");
    git(project, "add", "docs/agent-rules/git-safety.md");
    commit(project, "docs: 범용 규칙", "Harness-Scope: generic");

    // 범용: AGENTS.md 첫 줄 앞에 줄 추가
    writeFileSync(join(hub, "harness/AGENTS.md"), `범용 새 줄\n${read(hub, "harness/AGENTS.md")}`);
    git(hub, "add", ".");
    commit(hub, "docs: 범용 줄");
    git(hub, "push", "-q", "origin", "HEAD:main");

    const out = run(hub, "receive", project) + run(hub, "push", project);
    assert.match(out, /공용 하네스 받기/);
    assert.match(out, /올리기: waveness 현재 브랜치에 커밋 1개/);
    const agents = read(project, "AGENTS.md");
    assert.ok(agents.startsWith("범용 새 줄\n") && agents.includes("프로젝트 전용 줄"));
    assert.match(git(project, "log", "-1", "--format=%B"), /Harness-Sync: 공용 하네스 동기화\nHarness-Scope: sync/);

    const pushed = hub;
    assert.ok(read(pushed, "harness/docs/agent-rules/git-safety.md").includes("범용 개선 줄"));
    assert.ok(!read(pushed, "harness/AGENTS.md").includes("프로젝트 전용 줄"));
    assert.match(git(pushed, "log", "-1", "--format=%B"), /Harness-Origin: app@/);

    // 다시 실행해도 이미 올린 커밋은 건너뜀
    assert.doesNotMatch(run(hub, "push", project), /현재 브랜치에 커밋 [1-9]/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("프로젝트에서 실행 권한만 바꾼 범용 파일도 권한을 올림", () => {
  const { root, hub, project } = setup();
  try {
    run(hub, "pull", project);
    git(project, "add", "-A");
    commit(project, "chore: 하네스 연결", "Harness-Scope: sync");
    chmodSync(join(project, "docs/agent-rules/git-safety.md"), 0o755);
    git(project, "add", "docs/agent-rules/git-safety.md");
    commit(project, "chore: 실행 권한", "Harness-Scope: generic");

    assert.match(run(hub, "push", project), /현재 브랜치에 커밋 1개/);
    const pushed = hub;
    assert.equal(git(pushed, "ls-tree", "HEAD", "harness/docs/agent-rules/git-safety.md").split(" ")[0], "100755");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("이전 프로젝트 설정에서도 CHANGELOG는 양방향에서 제외하고 다른 범용 변경은 동기화함", () => {
  const { root, hub, project } = setup();
  try {
    const path = "docs/agent-harness/CHANGELOG.md";
    const excluded = `!${path}\n`;
    const paths = read(hub, "harness/.harness/paths");
    writeFileSync(join(hub, "harness/.harness/paths"), paths.replace(excluded, ""));
    git(hub, "add", ".");
    commit(hub, "docs: 이전 동기화 설정");
    run(hub, "pull", project);
    git(project, "add", "-A");
    commit(project, "chore: 연결", "Harness-Scope: sync");
    writeFileSync(join(project, path), "프로젝트 이력\n");
    appendFileSync(join(project, "docs/agent-rules/git-safety.md"), "\n범용 수정\n");
    git(project, "add", ".");
    commit(project, "docs: 이전 설정에서 범용 변경", "세부 변경: 안전 규칙 추가 ($&).", "Harness-Scope: generic");
    const source = git(project, "rev-parse", "HEAD");

    writeFileSync(join(hub, "harness/.harness/paths"), paths);
    writeFileSync(join(hub, "harness", path), "# 하네스 변경 이력\n\n중앙 공용 이력\n");
    appendFileSync(join(hub, "harness/AGENTS.md"), "\n새 범용 규칙\n");
    git(hub, "add", ".");
    commit(hub, "docs: 공용 이력 분리");

    assert.match(run(hub, "push", project), /커밋 1개/);
    const history = read(hub, "harness", path);
    assert.ok(history.endsWith("중앙 공용 이력\n"));
    assert.ok(history.includes("docs: 이전 설정에서 범용 변경"));
    assert.ok(history.includes("> 세부 변경: 안전 규칙 추가 ($&)."));
    assert.ok(history.includes(`- Harness-Origin: \`app@${source}\``));
    assert.doesNotMatch(history, /프로젝트 이력|Harness-Scope:/);
    assert.deepEqual(git(hub, "show", "--format=", "--name-only", "HEAD").split("\n").sort(), [
      "harness/docs/agent-harness/CHANGELOG.md",
      "harness/docs/agent-rules/git-safety.md",
    ]);
    run(hub, "push", project);
    assert.equal(read(hub, "harness", path), history);
    assert.ok(read(hub, "harness/docs/agent-rules/git-safety.md").includes("범용 수정"));
    assert.equal(read(project, path), "프로젝트 이력\n");
    git(hub, "push", "-q", "origin", "HEAD:main");
    appendFileSync(join(project, path), "커밋 전 프로젝트 기록\n");
    assert.doesNotMatch(run(hub, "receive", project), /충돌|실패|건너뜀/);
    assert.equal(read(project, path), "프로젝트 이력\n커밋 전 프로젝트 기록\n");
    assert.ok(read(project, "AGENTS.md").includes("새 범용 규칙"));
    assert.ok(read(project, ".harness/paths").includes(excluded));

    const fresh = join(root, "fresh");
    git(root, "init", "-q", "-b", "develop", fresh);
    run(hub, "pull", fresh);
    assert.equal(existsSync(join(fresh, path)), false);
    assert.ok(read(fresh, "AGENTS.md").includes("새 범용 규칙"));

    const existing = join(root, "existing");
    git(root, "init", "-q", "-b", "develop", existing);
    mkdirSync(join(existing, "docs/agent-harness"), { recursive: true });
    writeFileSync(join(existing, path), "연결 전 프로젝트 이력\n");
    run(hub, "pull", existing);
    assert.equal(read(existing, path), "연결 전 프로젝트 이력\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("충돌이 나면 격리 받기는 파일을 쓰지 않음", () => {
  const { root, hub, project } = setup();
  try {
    run(hub, "pull", project);
    git(project, "add", "-A");
    commit(project, "chore: 하네스 연결", "Harness-Scope: sync");
    writeFileSync(join(project, "CLAUDE.md"), "이쪽\n");
    git(project, "add", ".");
    commit(project, "docs: 전용", "Harness-Scope: project");
    writeFileSync(join(hub, "harness/CLAUDE.md"), "원본\n");
    git(hub, "add", ".");
    commit(hub, "docs: 범용");
    git(hub, "push", "-q", "origin", "HEAD:main");
    assert.match(run(hub, "receive", project), /받기 보류: 충돌 1건/);
    assert.equal(read(project, "CLAUDE.md"), "이쪽\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("프로젝트 커밋이 실패하면 격리 받기는 받은 파일을 되돌려 다음 받기가 멈추지 않음", () => {
  const { root, hub, project } = setup();
  try {
    run(hub, "pull", project);
    git(project, "add", "-A");
    commit(project, "chore: 하네스 연결", "Harness-Scope: sync");
    const lock = read(project, ".harness/lock.json");
    writeFileSync(join(hub, "harness/CLAUDE.md"), "원본 개선\n");
    writeFileSync(join(hub, "harness/docs/agent-rules/new-rule.md"), "새 규칙\n");
    git(hub, "add", ".");
    commit(hub, "docs: 범용");
    git(hub, "push", "-q", "origin", "HEAD:main");
    writeFileSync(join(project, ".git/hooks/pre-commit"), "#!/bin/sh\necho 린트 실패 >&2\nexit 1\n", { mode: 0o755 });

    assert.match(run(hub, "receive", project), /받기 커밋 실패\(변경은 되돌림.*린트 실패/);
    assert.equal(git(project, "status", "--porcelain"), "");
    assert.equal(read(project, ".harness/lock.json"), lock);

    rmSync(join(project, ".git/hooks/pre-commit"));
    assert.match(run(hub, "receive", project), /공용 하네스 받기: waveness \w+, 파일 2개 커밋/);
    assert.equal(read(project, "CLAUDE.md"), "원본 개선\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("waveness 커밋이 실패하면 수동 올리기는 수정 내용을 보존하고 다음 재시도로 반영", () => {
  const { root, hub, project } = setup();
  try {
    run(hub, "pull", project);
    git(project, "add", "-A");
    commit(project, "chore: 하네스 연결", "Harness-Scope: sync");
    appendFileSync(join(project, "docs/agent-rules/git-safety.md"), "\n범용 개선 줄\n");
    git(project, "add", ".");
    commit(project, "docs: 범용 규칙", "Harness-Scope: generic");
    const history = read(hub, "harness/docs/agent-harness/CHANGELOG.md");
    writeFileSync(join(hub, ".git/hooks/pre-commit"), "#!/bin/sh\necho 테스트 실패 >&2\nexit 1\n", { mode: 0o755 });

    const out = spawnSync("node", [join(hub, "bin/harness.mjs"), "push", project], {
      env: { ...ENV, HARNESS_HOOK_JSON: "1" },
    }).stdout.toString();
    assert.match(out, /현재 브랜치에 커밋 0개/);
    assert.notEqual(git(hub, "status", "--porcelain"), "");
    assert.notEqual(read(hub, "harness/docs/agent-harness/CHANGELOG.md"), history);

    // 실패한 커밋은 올린 기록이 없어 원인을 고치면 다음 실행에서 올라감
    rmSync(join(hub, ".git/hooks/pre-commit"));
    assert.match(run(hub, "push", project), /올리기: waveness 현재 브랜치에 커밋 1개/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("수동 반영 재시도는 이력을 중복하지 않고 실제 변경 없는 커밋은 기록하지 않음", () => {
  const { root, hub, project } = setup();
  try {
    const path = "docs/agent-rules/git-safety.md";
    const changelog = "harness/docs/agent-harness/CHANGELOG.md";
    run(hub, "pull", project);
    git(project, "add", "-A");
    commit(project, "chore: 연결", "Harness-Scope: sync");
    appendFileSync(join(project, path), "\n범용 변경\n");
    git(project, "add", ".");
    commit(project, "docs: 범용 변경", "Harness-Scope: generic");
    const hook = join(hub, ".git/hooks/pre-commit");
    writeFileSync(hook, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    run(hub, "push", project);
    const history = read(hub, changelog);
    assert.ok(history.includes("docs: 범용 변경"));
    run(hub, "push", project);
    assert.equal(read(hub, changelog), history);
    rmSync(hook);
    assert.match(run(hub, "push", project), /커밋 1개/);
    assert.equal(read(hub, changelog), history);

    appendFileSync(join(project, path), "\n이미 반영한 변경\n");
    git(project, "add", ".");
    commit(project, "docs: 이미 반영한 변경", "Harness-Scope: generic");
    writeFileSync(join(hub, "harness", path), read(project, path));
    git(hub, "add", ".");
    commit(hub, "docs: 먼저 반영");
    assert.match(run(hub, "push", project), /커밋 0개/);
    assert.equal(read(hub, changelog), history);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("자동 PR 받기는 기존 모델·effort를 반복 업데이트에서도 보존하고 역할 본문은 갱신", () => {
  const { root, hub, project } = setup();
  try {
    const codex = ".codex/agents/model-fixture.toml";
    const claude = ".claude/agents/model-fixture.md";
    const role = (model, effort, body) => `model = "${model}"\nmodel_reasoning_effort = "${effort}"\ndeveloper_instructions = """\nmodel = "${body}"\n"""\n`;
    const agent = (model, effort, body) => `---\nmodel: ${model}\neffort: ${effort}\n---\nmodel: ${body}\n`;
    writeFileSync(join(hub, "harness", codex), role("project-model", "medium", "원래 본문"));
    writeFileSync(join(hub, "harness", claude), agent("project-model", "medium", "원래 본문"));
    git(hub, "add", "."); commit(hub, "test: 기존 모델");
    run(hub, "pull", project);
    git(project, "add", "."); commit(project, "test: 연결", "Harness-Scope: sync");
    for (const body of ["첫 업데이트", "둘째 업데이트"]) {
      writeFileSync(join(hub, "harness", codex), role(`hub-${body}`, "high", body));
      writeFileSync(join(hub, "harness", claude), agent(`hub-${body}`, "high", body));
      git(hub, "add", "."); commit(hub, "test: 공용 변경");
      const result = spawnSync(process.execPath, [join(hub, "bin/harness.mjs"), "pull", project], {
        env: { ...ENV, HARNESS_PRESERVE_PROJECT_MODELS: "1" }, encoding: "utf8",
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(read(project, codex), role("project-model", "medium", body));
      assert.equal(read(project, claude), agent("project-model", "medium", body));
      git(project, "add", "."); commit(project, "test: 받기", "Harness-Scope: sync");
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("check-scope.sh는 분류 줄 누락과 generic 커밋의 대상 밖 파일을 막음", () => {
  const { root, hub, project } = setup();
  try {
    run(hub, "pull", project);
    git(project, "add", "-A");
    const check = (message) => {
      const file = join(root, "msg");
      writeFileSync(file, message);
      return spawnSync("sh", [".harness/check-scope.sh", file], { cwd: project, env: ENV }).status;
    };
    assert.equal(check("chore: 연결\n"), 1);
    assert.equal(check("chore: 연결\n\nHarness-Scope: generic\n"), 1);
    assert.equal(check("chore: 연결\n\nHarness-Scope: sync\n"), 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const hookCommand = (name) => ({ type: "command", command: `sh "$CLAUDE_PROJECT_DIR/.claude/hooks/${name}"` });

function setupUpstream() {
  const root = mkdtempSync(join(tmpdir(), "harness-upstream-"));
  const repo = (name, files) => {
    const remote = join(root, `${name}.git`);
    const dir = join(root, name);
    git(root, "init", "-q", "--bare", "-b", "main", remote);
    git(root, "clone", "-q", remote, dir);
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    git(dir, "add", ".");
    commit(dir, "init");
    git(dir, "push", "-q", "origin", "HEAD:main");
    return dir;
  };
  const hooks = { "harness/.claude/hooks/a.sh": "1\n2\n3\n4\n5\n", "harness/.codex/hooks/b.sh": "b\n" };
  const settings = (extra) =>
    `${JSON.stringify({ ...extra, hooks: { PreToolUse: [{ matcher: "Bash", hooks: [hookCommand("a.sh")] }] } }, null, 2)}\n`;
  const up = repo("seungness", {
    ...hooks,
    "harness/.claude/settings.json": settings({ language: "korean" }),
    "harness/docs/agent-harness/CHANGELOG.md": "# 하네스 변경 이력\n\n## 이전 항목\n",
  });
  const hub = repo("waveness", {
    ...hooks,
    "harness/.claude/settings.json": settings({ permissions: { allow: ["Edit(artifacts/feature-team/**)"] } }).replaceAll("  ", "\t"),
    "harness/.claude/hooks/only.sh": "전용\n",
    ".harness/upstream-paths": "# 주석\n.claude/hooks/\n.codex/hooks/\n!.claude/hooks/only.sh\n",
    ".harness/upstream.json": `${JSON.stringify({ synced: git(up, "rev-parse", "HEAD") })}\n`,
  });
  cpSync(join(SRC, "bin"), join(hub, "bin"), { recursive: true });
  git(hub, "add", ".");
  commit(hub, "bin");
  git(hub, "push", "-q", "origin", "HEAD:main");
  const sync = () =>
    spawnSync("node", [join(hub, "bin/harness.mjs"), "prepare-upstream"], { env: { ...ENV, UPSTREAM_HUB: up } }).stdout.toString();
  return { root, up, hub, sync };
}

test("seungness 훅 동기화는 양쪽 변경을 3-way 병합해 두 격리 저장소에 커밋하고 원격은 유지하며 전용 훅은 올리지 않음", () => {
  const { root, up, hub, sync } = setupUpstream();
  try {
    writeFileSync(join(up, "harness/.claude/hooks/a.sh"), "1 seungness\n2\n3\n4\n5\n");
    git(up, "add", ".");
    commit(up, "fix: a 첫 줄");
    git(up, "push", "-q", "origin", "HEAD:main");
    writeFileSync(join(hub, "harness/.claude/hooks/a.sh"), "1\n2\n3\n4\n5 waveness\n");
    writeFileSync(join(hub, "harness/.codex/hooks/b.sh"), "b waveness\n");
    writeFileSync(join(hub, "harness/.claude/hooks/c.sh"), "새 훅\n");
    writeFileSync(join(hub, "harness/.claude/hooks/only.sh"), "전용 수정\n");
    git(hub, "add", ".");
    commit(hub, "fix: waveness 훅 수정");

    const out = sync();
    assert.match(out, /seungness로 훅·등록 파일 3개 올림/);
    assert.match(out, /seungness에서 훅·등록 파일 1개 받음/);
    for (const dir of [up, hub]) {
      assert.equal(read(dir, "harness/.claude/hooks/a.sh"), "1 seungness\n2\n3\n4\n5 waveness\n");
      assert.equal(read(dir, "harness/.codex/hooks/b.sh"), "b waveness\n");
      assert.equal(read(dir, "harness/.claude/hooks/c.sh"), "새 훅\n");
      assert.equal(git(dir, "status", "--porcelain"), "");
    }
    assert.equal(existsSync(join(up, "harness/.claude/hooks/only.sh")), false);
    const history = read(up, "harness/docs/agent-harness/CHANGELOG.md");
    assert.match(history, /^# 하네스 변경 이력\n\n## \d{4}-\d{2}-\d{2} waveness 훅 동기화\n\n- Harness-Origin: `waveness@\w+`/);
    assert.ok(history.includes("> - fix: waveness 훅 수정") && history.endsWith("## 이전 항목\n"));
    assert.equal(JSON.parse(read(hub, ".harness/upstream.json")).synced, git(up, "rev-parse", "HEAD"));
    for (const name of ["seungness", "waveness"])
      assert.notEqual(git(root, "--git-dir", join(root, `${name}.git`), "rev-parse", "main"), git(join(root, name), "rev-parse", "HEAD"));

    // 바뀐 것이 없으면 커밋하지 않음
    const heads = [git(up, "rev-parse", "HEAD"), git(hub, "rev-parse", "HEAD")];
    assert.equal(sync(), "");
    assert.deepEqual([git(up, "rev-parse", "HEAD"), git(hub, "rev-parse", "HEAD")], heads);

    // seungness 삭제는 waveness로 전달됨
    git(up, "rm", "-q", "harness/.claude/hooks/c.sh");
    commit(up, "chore: c 삭제");
    git(up, "push", "-q", "origin", "HEAD:main");
    assert.match(sync(), /seungness에서 훅·등록 파일 1개 받음/);
    assert.equal(existsSync(join(hub, "harness/.claude/hooks/c.sh")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("seungness 훅 받기 커밋이 실패하면 waveness를 되돌려 다음 동기화가 멈추지 않음", () => {
  const { root, up, hub, sync } = setupUpstream();
  try {
    const state = read(hub, ".harness/upstream.json");
    writeFileSync(join(up, "harness/.claude/hooks/a.sh"), "1 seungness\n2\n3\n4\n5\n");
    git(up, "add", ".");
    commit(up, "fix: a 첫 줄");
    git(up, "push", "-q", "origin", "HEAD:main");
    writeFileSync(join(hub, ".git/hooks/pre-commit"), "#!/bin/sh\necho 테스트 실패 >&2\nexit 1\n", { mode: 0o755 });

    assert.match(sync(), /seungness 훅 받기 커밋 실패\(변경은 되돌림.*테스트 실패/);
    assert.equal(git(hub, "status", "--porcelain"), "");
    assert.equal(read(hub, ".harness/upstream.json"), state);

    rmSync(join(hub, ".git/hooks/pre-commit"));
    assert.match(sync(), /seungness에서 훅·등록 파일 1개 받음/);
    assert.equal(read(hub, "harness/.claude/hooks/a.sh"), "1 seungness\n2\n3\n4\n5\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("seungness 훅 동기화는 내용이 같고 실행 권한만 다른 훅도 맞추고 수정한 실행 훅의 권한을 유지함", () => {
  const { root, up, hub, sync } = setupUpstream();
  const mode = (dir) => git(dir, "ls-tree", "HEAD", "harness/.claude/hooks/a.sh").split(" ")[0];
  try {
    chmodSync(join(hub, "harness/.claude/hooks/a.sh"), 0o755);
    git(hub, "add", ".");
    commit(hub, "chore: a 실행 권한");
    assert.match(sync(), /seungness로 훅·등록 파일 1개 올림/);
    assert.equal(mode(up), "100755");
    assert.equal(git(hub, "status", "--porcelain"), "");

    writeFileSync(join(hub, "harness/.claude/hooks/a.sh"), "1\n2\n3\n4\n5 waveness\n");
    git(hub, "add", ".");
    commit(hub, "fix: a 수정");
    assert.match(sync(), /seungness로 훅·등록 파일 1개 올림/);
    assert.equal(mode(up), "100755");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("seungness 훅 동기화는 같은 줄 충돌이면 두 저장소 모두 쓰지 않고 미커밋 변경이 있으면 건너뜀", () => {
  const { root, up, hub, sync } = setupUpstream();
  try {
    writeFileSync(join(up, "harness/.codex/hooks/b.sh"), "b seungness\n");
    git(up, "add", ".");
    commit(up, "fix: b");
    writeFileSync(join(hub, "harness/.codex/hooks/b.sh"), "b waveness\n");
    git(hub, "add", ".");
    commit(hub, "fix: b");
    const heads = [git(up, "rev-parse", "HEAD"), git(hub, "rev-parse", "HEAD")];

    assert.match(sync(), /seungness 훅 동기화 보류: 충돌 1건\..*\n {2}\.codex\/hooks\/b\.sh: 충돌/);
    assert.deepEqual([git(up, "rev-parse", "HEAD"), git(hub, "rev-parse", "HEAD")], heads);
    assert.equal(git(up, "status", "--porcelain") + git(hub, "status", "--porcelain"), "");

    writeFileSync(join(up, "harness/.codex/hooks/b.sh"), "b waveness\n");
    git(up, "add", ".");
    commit(up, "fix: b 맞춤");
    appendFileSync(join(hub, "harness/.claude/hooks/a.sh"), "미커밋\n");
    assert.match(sync(), /건너뜀: waveness 또는 seungness가 main이 아니거나/);
    git(hub, "checkout", "--", "harness/.claude/hooks/a.sh");
    // 양쪽이 같은 내용이 되면 기준만 앞으로 옮김
    assert.equal(sync(), "");
    assert.equal(JSON.parse(read(hub, ".harness/upstream.json")).synced, git(up, "rev-parse", "HEAD"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("seungness 훅 동기화는 훅 등록을 항목 단위로 주고받고 전용 훅 등록과 다른 설정은 각자 유지함", () => {
  const { root, up, hub, sync } = setupUpstream();
  const file = "harness/.claude/settings.json";
  const edit = (dir, change) => {
    const config = JSON.parse(read(dir, file));
    change(config.hooks);
    writeFileSync(join(dir, file), `${JSON.stringify(config, null, dir === hub ? "\t" : 2)}\n`);
  };
  try {
    // seungness: Stop 등록 추가 / waveness: 새 공유 훅과 전용 훅 등록 추가
    edit(up, (hooks) => (hooks.Stop = [{ hooks: [hookCommand("a.sh")] }]));
    git(up, "add", ".");
    commit(up, "feat: Stop 등록");
    writeFileSync(join(hub, "harness/.claude/hooks/c.sh"), "새 훅\n");
    edit(hub, (hooks) => hooks.PreToolUse[0].hooks.push(hookCommand("c.sh"), hookCommand("only.sh")));
    git(hub, "add", ".");
    commit(hub, "feat: c 등록");

    sync();
    const upConfig = JSON.parse(read(up, file));
    const hubConfig = JSON.parse(read(hub, file));
    assert.deepEqual(upConfig.hooks.PreToolUse[0].hooks, [hookCommand("a.sh"), hookCommand("c.sh")]);
    assert.deepEqual(hubConfig.hooks.PreToolUse[0].hooks, [hookCommand("a.sh"), hookCommand("c.sh"), hookCommand("only.sh")]);
    for (const config of [upConfig, hubConfig]) assert.deepEqual(config.hooks.Stop, [{ hooks: [hookCommand("a.sh")] }]);
    assert.equal(upConfig.language, "korean");
    assert.ok(read(hub, file).includes('\n\t"hooks"') && read(up, file).includes('\n  "hooks"'));
    assert.equal(upConfig.permissions, undefined);
    assert.deepEqual(hubConfig.permissions, { allow: ["Edit(artifacts/feature-team/**)"] });
    assert.equal(sync(), "");

    // 한쪽에서 지운 공유 등록은 다른 쪽에서도 지워지고 전용 등록은 남음
    edit(up, (hooks) => (hooks.PreToolUse[0].hooks = [hookCommand("a.sh")]));
    git(up, "add", ".");
    commit(up, "chore: c 등록 해제");
    sync();
    assert.deepEqual(JSON.parse(read(hub, file)).hooks.PreToolUse[0].hooks, [hookCommand("a.sh"), hookCommand("only.sh")]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("공용 회귀 검사와 검사기는 기존 경로 설정으로 허브 사이를 양방향 동기화함", () => {
  const { root, up, hub, sync } = setupUpstream();
  try {
    const paths = read(SRC, ".harness/upstream-paths").split("\n").filter((line) => line.startsWith(".harness/"));
    for (const file of [
      "spec.test.mjs",
      "runtime-hooks.test.mjs",
      "git-guards.test.mjs",
      "test-titles.test.mjs",
      "check-comment-line-breaks.mjs",
      "korean-test-titles.grit",
      "biome-check.mjs",
      "check-statement-spacing.mjs",
      "statement-spacing.test.mjs",
      "auto-format.mjs",
      "auto-format.test.mjs",
      "editor/",
      "editor-host.cjs",
      "editor.test.mjs",
      "package-editor.mjs",
      "install-checks.mjs",
      "pre-commit.mjs",
      "pre-commit.test.mjs",
    ])
      assert.ok(paths.includes(`.harness/${file}`), file);
    appendFileSync(join(hub, ".harness/upstream-paths"), `${paths.join("\n")}\n`);
    for (const dir of [up, hub]) mkdirSync(join(dir, "harness/.harness"), { recursive: true });
    writeFileSync(join(up, "harness/.harness/runtime-hooks.test.mjs"), "// 받은 검사\n");
    mkdirSync(join(up, "harness/.harness/editor"), { recursive: true });
    writeFileSync(join(up, "harness/.harness/biome-check.mjs"), "// 자동 수정 실행기\n");
    writeFileSync(join(up, "harness/.harness/editor/extension.cjs"), "// 저장 확장\n");
    git(up, "add", ".");
    commit(up, "test: 공용 검사 추가");
    git(up, "push", "-q", "origin", "HEAD:main");
    writeFileSync(join(hub, "harness/.harness/korean-test-titles.grit"), "플러그인\n");
    git(hub, "add", ".");
    commit(hub, "test: 플러그인 추가");
    assert.match(sync(), /seungness/);
    for (const dir of [up, hub]) {
      assert.equal(read(dir, "harness/.harness/runtime-hooks.test.mjs"), "// 받은 검사\n");
      assert.equal(read(dir, "harness/.harness/biome-check.mjs"), "// 자동 수정 실행기\n");
      assert.equal(read(dir, "harness/.harness/editor/extension.cjs"), "// 저장 확장\n");
      assert.equal(read(dir, "harness/.harness/korean-test-titles.grit"), "플러그인\n");
    }
    appendFileSync(join(hub, "harness/.harness/runtime-hooks.test.mjs"), "// 프로젝트에서 보완\n");
    appendFileSync(join(hub, "harness/.harness/biome-check.mjs"), "// 실행기 보완\n");
    appendFileSync(join(hub, "harness/.harness/editor/extension.cjs"), "// 확장 보완\n");
    git(hub, "add", ".");
    commit(hub, "test: 공용 검사 보완");
    assert.match(sync(), /seungness로/);
    assert.equal(read(up, "harness/.harness/runtime-hooks.test.mjs"), read(hub, "harness/.harness/runtime-hooks.test.mjs"));
    for (const file of ["biome-check.mjs", "editor/extension.cjs"])
      assert.equal(read(up, `harness/.harness/${file}`), read(hub, `harness/.harness/${file}`));
    assert.equal(sync(), "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
