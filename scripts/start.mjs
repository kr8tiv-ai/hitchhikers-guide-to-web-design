/**
 * One command from a clean clone: node scripts/start.mjs
 * Node 22 is the only prerequisite. Corepack supplies pnpm, then the desk starts.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const START_PLAN = [
  { id: "check-node", command: "node" },
  { id: "ensure-pnpm", command: "corepack pnpm --version" },
  { id: "install", command: "corepack pnpm install" },
  { id: "desk", command: "corepack pnpm exec hh app" },
];

function nodeMajor() {
  const matched = /^v?(\d+)/.exec(process.versions.node);
  return matched === null ? 0 : Number(matched[1]);
}

function corepackLaunch(args) {
  const js = path.join(path.dirname(process.execPath), "node_modules", "corepack", "dist", "corepack.js");
  if (existsSync(js)) {
    return { command: process.execPath, args: [js, ...args], shell: false };
  }
  return {
    command: process.platform === "win32" ? "corepack.cmd" : "corepack",
    args,
    shell: process.platform === "win32",
  };
}

function run(command, args, shell) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
      shell,
      windowsHide: true,
      env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited ${code ?? "null"}`));
    });
  });
}

async function corepack(args) {
  const launch = corepackLaunch(args);
  await run(launch.command, launch.args, launch.shell);
}

export async function main() {
  if (process.argv.includes("--print-plan")) {
    process.stdout.write(`${START_PLAN.map((step) => step.id).join("\n")}\n`);
    return;
  }
  if (nodeMajor() < 22) {
    process.stderr.write(
      "Node.js is older than 22, so the desk will not start.\nInstall Node.js 22 or newer from https://nodejs.org/en/download\ndoc: docs/dont-panic.md\n",
    );
    process.exit(1);
  }
  process.stdout.write("Guide: Node is new enough. Installing the workspace with corepack pnpm.\n");
  try {
    await corepack(["pnpm", "install"]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "corepack pnpm install failed";
    process.stderr.write(
      `The workspace did not install. ${message}\nRun: corepack pnpm install\ndoc: docs/dont-panic.md\n`,
    );
    process.exit(1);
  }
  process.stdout.write("Guide: starting the desk. The URL is the next line from hh app.\n");
  try {
    await corepack(["pnpm", "exec", "hh", "app"]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "hh app failed";
    process.stderr.write(`The desk did not stay up. ${message}\ndoc: docs/dont-panic.md\n`);
    process.exit(1);
  }
}

const entry = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (entry === fileURLToPath(import.meta.url)) {
  await main();
}
