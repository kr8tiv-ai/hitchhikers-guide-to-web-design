import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateCommand } from "../src/policy.ts";

const ROOT = "C:\\Sites\\Towel";

const MIT = {
  name: "left-pad",
  license: "MIT",
  repo: "https://example.com/left-pad.git",
};

interface Case {
  name: string;
  argv: string[];
  decision: "allow" | "deny";
  reason: string;
  projectRoot?: string;
  packageMeta?: { name: string; license: string; repo: string };
}

const CASES: readonly Case[] = [
  {
    name: "empty argv is denied",
    argv: [],
    decision: "deny",
    reason: "empty argv",
  },
  {
    name: "whitespace argv is denied",
    argv: ["", "  "],
    decision: "deny",
    reason: "empty argv",
  },
  {
    name: "git push is denied",
    argv: ["git", "push"],
    decision: "deny",
    reason: "git push is denied",
  },
  {
    name: "git push --force is denied",
    argv: ["git", "push", "--force"],
    decision: "deny",
    reason: "git push is denied",
  },
  {
    name: "git push of a remote url is denied without echoing the url",
    argv: ["git", "push", "https://user:s3cret-value@example.com/repo.git"],
    decision: "deny",
    reason: "git push is denied",
  },
  {
    name: "git -C path push is denied",
    argv: ["git", "-C", "C:\\Sites\\Other", "push", "origin"],
    decision: "deny",
    reason: "git push is denied",
  },
  {
    name: "git.exe push is denied",
    argv: ["git.EXE", "push", "--force-with-lease"],
    decision: "deny",
    reason: "git push is denied",
  },
  {
    name: "a path to git push is denied",
    argv: ["/usr/bin/git", "push"],
    decision: "deny",
    reason: "git push is denied",
  },
  {
    name: "a single command string git push is denied",
    argv: ["git push origin main"],
    decision: "deny",
    reason: "git push is denied",
  },
  {
    name: "bash -c git push is denied",
    argv: ["bash", "-lc", "git push"],
    decision: "deny",
    reason: "git push is denied",
  },
  {
    name: "cmd /c git push is denied",
    argv: ["cmd", "/c", "git push --force"],
    decision: "deny",
    reason: "git push is denied",
  },
  {
    name: "git remote add is denied",
    argv: ["git", "remote", "add", "origin", "https://example.com/repo.git"],
    decision: "deny",
    reason: "git remote add is denied",
  },
  {
    name: "gh repo create is denied",
    argv: ["gh", "repo", "create", "towel", "--private"],
    decision: "deny",
    reason: "gh repo create is denied",
  },
  {
    name: "git status is allowed",
    argv: ["git", "status"],
    decision: "allow",
    reason: "allowed",
  },
  {
    name: "git diff is allowed",
    argv: ["git", "diff", "--stat"],
    decision: "allow",
    reason: "allowed",
  },
  {
    name: "git add is allowed",
    argv: ["git", "add", "."],
    decision: "allow",
    reason: "allowed",
  },
  {
    name: "git commit is allowed",
    argv: ["git", "commit", "-m", "save the page"],
    decision: "allow",
    reason: "allowed",
  },
  {
    name: "a commit message that contains the word push is allowed",
    argv: ["git", "commit", "-m", "do not push"],
    decision: "allow",
    reason: "allowed",
  },
  {
    name: "a commit message that mentions push later is allowed",
    argv: ["git", "commit", "-m", "push the layout later s3cret-value"],
    decision: "allow",
    reason: "allowed",
  },
  {
    name: "a commit message that says git push is still a commit",
    argv: ["git", "commit", "-m", "please git push tomorrow"],
    decision: "allow",
    reason: "allowed",
  },
  {
    name: "git worktree add is allowed",
    argv: ["git", "worktree", "add", "../towel-wt", "HEAD"],
    decision: "allow",
    reason: "allowed",
  },
  {
    name: "git remote -v is allowed",
    argv: ["git", "remote", "-v"],
    decision: "allow",
    reason: "allowed",
  },
  {
    name: "npx wrangler deploy is denied",
    argv: ["npx", "wrangler", "deploy"],
    decision: "deny",
    reason: "deploy command is denied",
  },
  {
    name: "npx -y wrangler deploy is denied",
    argv: ["npx", "-y", "wrangler", "deploy"],
    decision: "deny",
    reason: "deploy command is denied",
  },
  {
    name: "wrangler pages deploy is denied",
    argv: ["wrangler", "pages", "deploy"],
    decision: "deny",
    reason: "deploy command is denied",
  },
  {
    name: "wrangler dev is allowed",
    argv: ["wrangler", "dev"],
    decision: "allow",
    reason: "allowed",
  },
  {
    name: "vercel is denied",
    argv: ["vercel"],
    decision: "deny",
    reason: "deploy command is denied",
  },
  {
    name: "vercel --prod is denied",
    argv: ["vercel", "--prod"],
    decision: "deny",
    reason: "deploy command is denied",
  },
  {
    name: "pnpm exec vercel --prod is denied",
    argv: ["pnpm", "exec", "vercel", "--prod"],
    decision: "deny",
    reason: "deploy command is denied",
  },
  {
    name: "netlify deploy is denied",
    argv: ["netlify", "deploy"],
    decision: "deny",
    reason: "deploy command is denied",
  },
  {
    name: "netlify dev is allowed",
    argv: ["netlify", "dev"],
    decision: "allow",
    reason: "allowed",
  },
  {
    name: "hostinger deploy is denied",
    argv: ["hostinger", "deploy"],
    decision: "deny",
    reason: "deploy command is denied",
  },
  {
    name: "hostinger and deploy in one command are denied",
    argv: ["npx", "-y", "@hostinger/mcp", "deploy", "--site", "towel"],
    decision: "deny",
    reason: "deploy command is denied",
  },
  {
    name: "rm of / is denied",
    argv: ["rm", "-rf", "/"],
    decision: "deny",
    reason: "deleting a filesystem root is denied",
  },
  {
    name: "rm of C:\\ is denied",
    argv: ["rm", "-rf", "C:\\"],
    decision: "deny",
    reason: "deleting a filesystem root is denied",
  },
  {
    name: "rm of c:/ is denied",
    argv: ["rm", "-rf", "c:/"],
    decision: "deny",
    reason: "deleting a filesystem root is denied",
  },
  {
    name: "rm of D:\\ is denied",
    argv: ["rm", "-rf", "D:\\"],
    decision: "deny",
    reason: "deleting a filesystem root is denied",
  },
  {
    name: "Remove-Item of C:\\ is denied",
    argv: ["Remove-Item", "-Recurse", "-Force", "C:\\"],
    decision: "deny",
    reason: "deleting a filesystem root is denied",
  },
  {
    name: "del /s /q of C:\\ is denied",
    argv: ["del", "/s", "/q", "C:\\"],
    decision: "deny",
    reason: "deleting a filesystem root is denied",
  },
  {
    name: "rm of the project root is denied",
    argv: ["rm", "-rf", ROOT],
    decision: "deny",
    reason: "deleting the project root is denied",
  },
  {
    name: "windows path case and slashes still match the project root",
    argv: ["rm", "-rf", "c:/sites/towel/"],
    decision: "deny",
    reason: "deleting the project root is denied",
  },
  {
    name: "a spaced project root matches ignoring case",
    argv: ["rm", "-rf", "c:/program files/towel"],
    projectRoot: "C:\\Program Files\\Towel",
    decision: "deny",
    reason: "deleting the project root is denied",
  },
  {
    name: "rm of . is denied as the project root",
    argv: ["rm", "-rf", "."],
    decision: "deny",
    reason: "deleting the project root is denied",
  },
  {
    name: "rm of a nested directory is allowed",
    argv: ["rm", "-rf", `${ROOT}\\dist`],
    decision: "allow",
    reason: "allowed",
  },
  {
    name: "rm of a file is allowed",
    argv: ["rm", "README.md"],
    decision: "allow",
    reason: "allowed",
  },
  {
    name: "bash -c rm of / is denied",
    argv: ["bash", "-c", "rm -rf /"],
    decision: "deny",
    reason: "deleting a filesystem root is denied",
  },
  {
    name: "npm install of a named package without meta is denied",
    argv: ["npm", "install", "left-pad"],
    decision: "deny",
    reason: "legitimacy record missing",
  },
  {
    name: "npm install --save-dev without meta is denied",
    argv: ["npm", "install", "--save-dev", "left-pad"],
    decision: "deny",
    reason: "legitimacy record missing",
  },
  {
    name: "pnpm add without meta is denied",
    argv: ["pnpm", "add", "left-pad"],
    decision: "deny",
    reason: "legitimacy record missing",
  },
  {
    name: "yarn add without meta is denied",
    argv: ["yarn", "add", "left-pad"],
    decision: "deny",
    reason: "legitimacy record missing",
  },
  {
    name: "bun add without meta is denied",
    argv: ["bun", "add", "left-pad"],
    decision: "deny",
    reason: "legitimacy record missing",
  },
  {
    name: "pnpm install of a named package without meta is denied",
    argv: ["pnpm", "install", "left-pad"],
    decision: "deny",
    reason: "legitimacy record missing",
  },
  {
    name: "a blank package name is denied",
    argv: ["pnpm", "add", "left-pad"],
    packageMeta: { name: "  ", license: "MIT", repo: "https://example.com/left-pad.git" },
    decision: "deny",
    reason: "legitimacy record missing",
  },
  {
    name: "an empty repo url denies the install",
    argv: ["pnpm", "add", "left-pad"],
    packageMeta: { name: "left-pad", license: "MIT", repo: "" },
    decision: "deny",
    reason: "package repo is empty",
  },
  {
    name: "a whitespace repo url denies the install",
    argv: ["pnpm", "add", "left-pad"],
    packageMeta: { name: "left-pad", license: "MIT", repo: "   " },
    decision: "deny",
    reason: "package repo is empty",
  },
  {
    name: "GPL-3.0 is denied",
    argv: ["pnpm", "add", "left-pad"],
    packageMeta: { name: "left-pad", license: "GPL-3.0", repo: "https://example.com/left-pad.git" },
    decision: "deny",
    reason: "package license is denied",
  },
  {
    name: "GPL-2.0-only is denied",
    argv: ["npm", "install", "left-pad"],
    packageMeta: {
      name: "left-pad",
      license: "GPL-2.0-only",
      repo: "https://example.com/left-pad.git",
    },
    decision: "deny",
    reason: "package license is denied",
  },
  {
    name: "AGPL-3.0 is denied",
    argv: ["pnpm", "add", "left-pad"],
    packageMeta: { name: "left-pad", license: "AGPL-3.0", repo: "https://example.com/left-pad.git" },
    decision: "deny",
    reason: "package license is denied",
  },
  {
    name: "AGPL-3.0-or-later is denied",
    argv: ["pnpm", "add", "left-pad"],
    packageMeta: {
      name: "left-pad",
      license: "AGPL-3.0-or-later",
      repo: "https://example.com/left-pad.git",
    },
    decision: "deny",
    reason: "package license is denied",
  },
  {
    name: "a written GPL name is denied",
    argv: ["pnpm", "add", "left-pad"],
    packageMeta: {
      name: "left-pad",
      license: "GNU General Public License v3",
      repo: "https://example.com/left-pad.git",
    },
    decision: "deny",
    reason: "package license is denied",
  },
  {
    name: "MIT OR GPL-3.0 is denied",
    argv: ["pnpm", "add", "left-pad"],
    packageMeta: {
      name: "left-pad",
      license: "MIT OR GPL-3.0",
      repo: "https://example.com/left-pad.git",
    },
    decision: "deny",
    reason: "package license is denied",
  },
  {
    name: "a package name that does not match the record is denied",
    argv: ["pnpm", "add", "left-pad"],
    packageMeta: { name: "right-pad", license: "MIT", repo: "https://example.com/right-pad.git" },
    decision: "deny",
    reason: "package name does not match the legitimacy record",
  },
  {
    name: "MIT with metadata is allowed",
    argv: ["pnpm", "add", "left-pad"],
    packageMeta: MIT,
    decision: "allow",
    reason: "allowed",
  },
  {
    name: "MIT metadata is allowed when the repo url carries userinfo",
    argv: ["npm", "install", "left-pad"],
    packageMeta: {
      name: "left-pad",
      license: "MIT",
      repo: "https://user:s3cret-value@example.com/left-pad.git",
    },
    decision: "allow",
    reason: "allowed",
  },
  {
    name: "a versioned spec matches the recorded name",
    argv: ["pnpm", "add", "left-pad@1.2.3"],
    packageMeta: MIT,
    decision: "allow",
    reason: "allowed",
  },
  {
    name: "pnpm add -D with MIT metadata is allowed",
    argv: ["pnpm", "add", "-D", "left-pad"],
    packageMeta: MIT,
    decision: "allow",
    reason: "allowed",
  },
  {
    name: "Apache-2.0 with metadata is allowed",
    argv: ["pnpm", "add", "left-pad"],
    packageMeta: {
      name: "left-pad",
      license: "Apache-2.0",
      repo: "https://example.com/left-pad.git",
    },
    decision: "allow",
    reason: "allowed",
  },
  {
    name: "LGPL is not the GPL deny rule",
    argv: ["pnpm", "add", "left-pad"],
    packageMeta: {
      name: "left-pad",
      license: "LGPL-2.1-only",
      repo: "https://example.com/left-pad.git",
    },
    decision: "allow",
    reason: "allowed",
  },
  {
    name: "pnpm test allows without meta",
    argv: ["pnpm", "test"],
    decision: "allow",
    reason: "allowed",
  },
  {
    name: "pnpm test ignores a GPL record",
    argv: ["pnpm", "test"],
    packageMeta: { name: "left-pad", license: "GPL-3.0", repo: "https://example.com/left-pad.git" },
    decision: "allow",
    reason: "allowed",
  },
  {
    name: "pnpm install with no package name allows without meta",
    argv: ["pnpm", "install"],
    decision: "allow",
    reason: "allowed",
  },
  {
    name: "npm ci allows without meta",
    argv: ["npm", "ci"],
    decision: "allow",
    reason: "allowed",
  },
  {
    name: "git push is still denied when a MIT record is attached",
    argv: ["git", "push"],
    packageMeta: MIT,
    decision: "deny",
    reason: "git push is denied",
  },
];

for (const row of CASES) {
  test(row.name, () => {
    const projectRoot = row.projectRoot ?? ROOT;
    const result =
      row.packageMeta === undefined
        ? evaluateCommand({ argv: row.argv, projectRoot })
        : evaluateCommand({
            argv: row.argv,
            projectRoot,
            packageMeta: row.packageMeta,
          });
    assert.equal(result.decision, row.decision);
    assert.equal(result.reason, row.reason);
    assert.equal(result.reason.includes("s3cret-value"), false);
    assert.equal(result.reason.includes("!"), false);
  });
}

test("the same argv returns the same decision", () => {
  const input = { argv: ["git", "commit", "-m", "do not push"], projectRoot: ROOT };
  assert.deepEqual(evaluateCommand(input), evaluateCommand(input));
});

test("policy source is the second gate and does not run commands", () => {
  const sourcePath = fileURLToPath(new URL("../src/policy.ts", import.meta.url));
  const source = readFileSync(sourcePath, "utf8");
  assert.match(source, /fail open/i);
  assert.match(source, /second gate/i);
  assert.equal(/from\s+["']node:child_process["']/.test(source), false);
  assert.equal(/from\s+["']child_process["']/.test(source), false);
});
