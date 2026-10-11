import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("the documented start command is the root script", () => {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { scripts?: { start?: string } };
  assert.equal(pkg.scripts?.start, "node scripts/start.mjs");
  const source = readFileSync(path.join(root, "scripts", "start.mjs"), "utf8");
  const ids = [...source.matchAll(/id: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(ids, ["check-node", "ensure-pnpm", "install", "desk"]);
  assert.match(source, /command: "corepack pnpm install"/);
  assert.match(source, /command: "corepack pnpm exec hh app"/);
});

test("start --print-plan lists the steps in order and does not install", async () => {
  const child = spawn(process.execPath, [path.join(root, "scripts", "start.mjs"), "--print-plan"], {
    cwd: root,
    windowsHide: true,
  });
  const stdout = await new Promise<string>((resolve, reject) => {
    let out = "";
    let err = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      out += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      err += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`print-plan exited ${code ?? "null"}\n${err}\n${out}`));
    });
  });
  assert.equal(stdout, "check-node\nensure-pnpm\ninstall\ndesk\n");
  assert.equal(stdout.includes("pnpm install"), false);
});
