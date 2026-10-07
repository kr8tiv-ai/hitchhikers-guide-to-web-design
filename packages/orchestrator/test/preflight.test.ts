import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { GitFlowError, backupBranchName } from "../src/git-flow.ts";
import { PreflightError, preflight, type PreflightResult } from "../src/preflight.ts";

const DATE = "2026-10-07";
const BRANCH = "hh/backup-2026-10-07";

function noBang(result: PreflightResult): void {
  for (const line of [...result.warnings, ...result.reasons, result.backup]) {
    assert.equal(line.includes("!"), false, line);
    assert.equal(/ready/i.test(line), false, line);
  }
}

test("missing approval fails preflight and still returns the branch name", () => {
  const result = preflight({
    approved: false,
    statusPorcelain: "## main",
    date: DATE,
    serverProbe: () => true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.backup, BRANCH);
  assert.equal(result.backup, backupBranchName(DATE));
  assert.deepEqual(result.reasons, ["Drive is not approved."]);
  assert.deepEqual(result.warnings, []);
  noBang(result);
});

test("porcelain containing .env fails", () => {
  const samples = [
    " M .env",
    "?? .env",
    "?? .env.local",
    "?? app/.env",
    '?? "app/.env"',
    "?? app/.env.production",
    " M .ENV",
    " M src\\.env",
    "?? .env\n?? keys/a.pem",
    ".env",
    "R  kept.txt -> .env",
    "!! .env",
  ];
  for (const statusPorcelain of samples) {
    const result = preflight({
      approved: true,
      statusPorcelain,
      date: DATE,
      serverProbe: () => true,
    });
    assert.equal(result.ok, false, statusPorcelain);
    assert.equal(result.reasons.includes("Git status lists a secret path."), true, statusPorcelain);
    noBang(result);
  }
});

test("pem, credentials, and guide config fail the same way as git-flow", () => {
  const samples = [
    "?? keys/server.pem",
    "?? .pem",
    "?? src/credentials.json",
    "?? .hitchhiker/config.json",
    "?? site/.hitchhiker/config.json",
  ];
  for (const statusPorcelain of samples) {
    const result = preflight({
      approved: true,
      statusPorcelain,
      date: DATE,
      serverProbe: () => true,
    });
    assert.equal(result.ok, false, statusPorcelain);
    assert.equal(result.reasons.includes("Git status lists a secret path."), true);
  }
});

test("notenv is not a secret and a real edit is still a dirty tree", () => {
  const result = preflight({
    approved: true,
    statusPorcelain: " M notenv\n?? notes.env\n",
    date: DATE,
    serverProbe: () => true,
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ["Working tree is not clean."]);
  noBang(result);
});

test("omitted server probe warns and can still be ok", () => {
  const result = preflight({
    approved: true,
    statusPorcelain: "## main",
    date: DATE,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, ["dev server not checked"]);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.backup, backupBranchName(DATE));
  noBang(result);
});

test("serverRequired without a probe fails and does not warn", () => {
  const result = preflight({
    approved: true,
    statusPorcelain: "## main",
    date: DATE,
    serverRequired: true,
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ["Dev server is required."]);
  assert.deepEqual(result.warnings, []);
  noBang(result);
});

test("a false server probe fails only when the probe is provided", () => {
  let calls = 0;
  const down = preflight({
    approved: true,
    statusPorcelain: "## main",
    date: DATE,
    serverProbe: () => {
      calls += 1;
      return false;
    },
  });
  assert.equal(calls, 1);
  assert.equal(down.ok, false);
  assert.deepEqual(down.reasons, ["dev server down"]);
  assert.deepEqual(down.warnings, []);
  noBang(down);

  const skipped = preflight({
    approved: true,
    statusPorcelain: "",
    date: DATE,
  });
  assert.equal(skipped.ok, true);
  assert.equal(skipped.reasons.includes("dev server down"), false);
  assert.deepEqual(skipped.warnings, ["dev server not checked"]);
});

test("clean porcelain ## main is ok when approved and the probe is up", () => {
  const result = preflight({
    approved: true,
    statusPorcelain: "## main",
    date: DATE,
    serverProbe: () => true,
  });
  assert.deepEqual(result, {
    ok: true,
    warnings: [],
    backup: BRANCH,
    reasons: [],
  });
  assert.equal(result.backup, backupBranchName(DATE));
});

test("empty porcelain and a branch header with ahead or behind are ok", () => {
  const samples = [
    "",
    "\n",
    "\n\n",
    "## main\n",
    "## main\r\n",
    "## main...origin/main",
    "## main...origin/main [ahead 1]",
    "## main...origin/main [behind 2]",
    "!! notes.txt",
    "# branch.oid abc\n# branch.head main\n",
  ];
  for (const statusPorcelain of samples) {
    const result = preflight({
      approved: true,
      statusPorcelain,
      date: DATE,
      serverProbe: () => true,
    });
    assert.deepEqual(result.reasons, [], statusPorcelain);
    assert.equal(result.ok, true, statusPorcelain);
    assert.equal(result.backup, BRANCH);
  }
});

test("ordinary edits fail the clean-tree check", () => {
  const result = preflight({
    approved: true,
    statusPorcelain: " M src/app.ts\n?? src/new.ts\n",
    date: DATE,
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ["Working tree is not clean."]);
  assert.deepEqual(result.warnings, ["dev server not checked"]);
  noBang(result);
});

test("backup name matches the git helper, including a leap day", () => {
  const leap = preflight({
    approved: true,
    statusPorcelain: "## main",
    date: "2024-02-29",
    serverProbe: () => true,
  });
  assert.equal(leap.backup, "hh/backup-2024-02-29");
  assert.equal(leap.backup, backupBranchName("2024-02-29"));
  assert.equal(leap.ok, true);
});

test("an invalid date throws and does not create baselines", () => {
  const calls: string[] = [];
  assert.throws(
    () =>
      preflight({
        approved: true,
        statusPorcelain: "## main",
        date: "2026-02-31",
        projectRoot: path.join(os.tmpdir(), "hh-preflight-invalid"),
        mkdir: (dir) => {
          calls.push(dir);
        },
      }),
    GitFlowError,
  );
  assert.deepEqual(calls, []);
});

test("injected mkdir receives baselines and is not asked to delete", () => {
  const root = path.join(os.tmpdir(), `hh-preflight-spy-${process.pid}`);
  const calls: string[] = [];
  const result = preflight({
    approved: true,
    statusPorcelain: "## main",
    date: DATE,
    serverProbe: () => true,
    projectRoot: root,
    mkdir: (dir) => {
      calls.push(dir);
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [path.join(root, "baselines")]);
  assert.equal(path.basename(calls[0] ?? ""), "baselines");
  assert.equal(existsSync(root), false);
});

test("mkdir is skipped when the project root is omitted", () => {
  const calls: string[] = [];
  const result = preflight({
    approved: true,
    statusPorcelain: "## main",
    date: DATE,
    serverProbe: () => true,
    mkdir: (dir) => {
      calls.push(dir);
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, []);
});

test("existing baselines files stay in place", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "hh-preflight-"));
  const baselines = path.join(root, "baselines");
  const kept = path.join(baselines, "kept.txt");
  mkdirSync(baselines);
  writeFileSync(kept, "stay");
  try {
    const first = preflight({
      approved: true,
      statusPorcelain: "## main",
      date: DATE,
      serverProbe: () => true,
      projectRoot: root,
    });
    const second = preflight({
      approved: true,
      statusPorcelain: "",
      date: DATE,
      serverProbe: () => true,
      projectRoot: root,
    });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(existsSync(baselines), true);
    assert.equal(readFileSync(kept, "utf8"), "stay");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a failing mkdir is a reason and does not claim success", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "hh-preflight-fail-"));
  const marker = path.join(root, "marker.txt");
  writeFileSync(marker, "keep");
  try {
    const result = preflight({
      approved: true,
      statusPorcelain: "## main",
      date: DATE,
      serverProbe: () => true,
      projectRoot: root,
      mkdir: () => {
        throw new Error("disk full");
      },
    });
    assert.equal(result.ok, false);
    assert.deepEqual(result.reasons, ["Baselines directory was not created."]);
    assert.equal(readFileSync(marker, "utf8"), "keep");
    noBang(result);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a blank project root does not call mkdir", () => {
  const calls: string[] = [];
  const result = preflight({
    approved: true,
    statusPorcelain: "## main",
    date: DATE,
    serverProbe: () => true,
    projectRoot: "   ",
    mkdir: (dir) => {
      calls.push(dir);
    },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ["Project directory is missing."]);
  assert.deepEqual(calls, []);
});

test("several failures are reported together and the branch name remains", () => {
  const result = preflight({
    approved: false,
    statusPorcelain: " M .env\n M src/app.ts",
    date: DATE,
    serverProbe: () => false,
    projectRoot: " ",
  });
  assert.equal(result.ok, false);
  assert.equal(result.backup, BRANCH);
  assert.deepEqual(result.reasons, [
    "Drive is not approved.",
    "Working tree is not clean.",
    "Git status lists a secret path.",
    "dev server down",
    "Project directory is missing.",
  ]);
  assert.deepEqual(result.warnings, []);
  noBang(result);
});

test("serverRequired still accepts a probe that returns true", () => {
  const result = preflight({
    approved: true,
    statusPorcelain: "## main",
    date: DATE,
    serverProbe: () => true,
    serverRequired: true,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.reasons, []);
});

test("explicit serverRequired false still warns when the probe is omitted", () => {
  const result = preflight({
    approved: true,
    statusPorcelain: "## main",
    date: DATE,
    serverRequired: false,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, ["dev server not checked"]);
});

test("malformed input throws PreflightError", () => {
  assert.throws(
    () =>
      preflight({
        approved: true,
        statusPorcelain: 1 as unknown as string,
        date: DATE,
      }),
    PreflightError,
  );
  assert.throws(
    () =>
      preflight({
        approved: true,
        statusPorcelain: "## main",
        date: 20261007 as unknown as string,
      }),
    PreflightError,
  );
});

test("v2 untracked and changed lines are a dirty tree", () => {
  const changed = preflight({
    approved: true,
    statusPorcelain: "# branch.head main\n1 M. N... 100644 100644 100644 aaa bbb src/app.ts",
    date: DATE,
    serverProbe: () => true,
  });
  assert.deepEqual(changed.reasons, ["Working tree is not clean."]);

  const secret = preflight({
    approved: true,
    statusPorcelain: "# branch.head main\n? .env",
    date: DATE,
    serverProbe: () => true,
  });
  assert.equal(secret.ok, false);
  assert.equal(secret.reasons.includes("Git status lists a secret path."), true);
  assert.equal(secret.reasons.includes("Working tree is not clean."), true);
});

test("the module does not spawn git, push, listen, or delete baselines", () => {
  const sourcePath = fileURLToPath(new URL("../src/preflight.ts", import.meta.url));
  const source = readFileSync(sourcePath, "utf8");
  const banned = [
    "child_process",
    "execFile",
    "rmSync",
    "unlink",
    "rmdir",
    "git push",
    "runner.ts",
    "fetch(",
    "listen(",
  ];
  for (const word of banned) {
    assert.equal(source.includes(word), false, word);
  }
  assert.equal(/\bprepareRepo\s*\(/.test(source), false);
  assert.equal(/\bcommitPrompt\s*\(/.test(source), false);
  assert.equal(/\bspawn\s*\(/.test(source), false);
});
