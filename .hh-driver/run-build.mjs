// run-build.mjs — macOS and Linux runner for hh-build-plan/prompts.
// Mirrors .hh-driver/run-build.ps1: one fresh Grok session per prompt, the same
// state files, and a normal `git push origin main` (never force).
// Windows keeps run-build.ps1. Planning helpers live in packages/qa. Do not import this file from a package test.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  buildGrokArgs,
  classifyRun,
  invokedDirectly,
  isLiveDriverPid,
  isRecord,
  lastLines,
  listPromptFiles,
  nextPrompts,
  parseDriverArgs,
  readPrompt,
  resolveGrokBin,
  resumeFrom,
  shouldPush,
  textLooksLikeUsageLimit,
} from "../packages/qa/src/driver-plan.mjs";

export {
  MODEL,
  DENY_RULES,
  buildDriverRules,
  buildGrokArgs,
  classifyRun,
  invokedDirectly,
  isLiveDriverPid,
  isPromptFileName,
  listPromptFiles,
  nextPrompts,
  parseDriverArgs,
  parseFrontMatter,
  readPrompt,
  resolveGrokBin,
  resumeFrom,
  shouldPush,
  textLooksLikeUsageLimit,
  turnsForKind,
} from "../packages/qa/src/driver-plan.mjs";

const driverDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(driverDir, "..");
const logDir = path.join(driverDir, "logs");
const promptDir = path.join(root, "hh-build-plan", "prompts");
const stateFile = path.join(driverDir, "STATE.json");
const pauseFile = path.join(driverDir, "PAUSE");
const blockedFile = path.join(driverDir, "BLOCKED.md");
const driverLog = path.join(driverDir, "driver.log");
const lockFile = path.join(driverDir, "driver.pid");
const emptyIn = path.join(driverDir, "empty-stdin.txt");

const STALL_MINUTES = 30;
const POLL_SECONDS = 20;
const DRIVER_COMMIT_BODY = "Committed by .hh-driver after the Grok session ended with a dirty tree.";

/**
 * @typedef {object} FrontMatter
 * @property {string} id
 * @property {string} kind
 * @property {string} effort
 * @property {string} msg
 */

/**
 * @typedef {FrontMatter & {
 *   num: number,
 *   name: string,
 *   text: string,
 *   turns: number,
 * }} PromptRecord
 */

/**
 * @typedef {object} DriverState
 * @property {string} current
 * @property {string} file
 * @property {string} kind
 * @property {string} effort
 * @property {string} started
 * @property {string} status
 * @property {number} attempt
 * @property {string} last_commit
 * @property {string} last_done
 * @property {string} last_push
 * @property {number} pid
 * @property {string} updated
 * @property {number} [grok_pid]
 */

/**
 * @param {Date} [date]
 * @returns {string}
 */
function stamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * @returns {DriverState}
 */
function loadState() {
  /** @type {DriverState} */
  const state = {
    current: "",
    file: "",
    kind: "",
    effort: "",
    started: "",
    status: "idle",
    attempt: 0,
    last_commit: "",
    last_done: "",
    last_push: "",
    pid: process.pid,
    updated: "",
  };
  if (!fs.existsSync(stateFile)) return state;
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    if (!isRecord(parsed)) return state;
    for (const key of ["last_done", "last_commit", "last_push"]) {
      const value = parsed[key];
      if (typeof value === "string" && value) state[key] = value;
      else if (typeof value === "number") state[key] = String(value);
    }
  } catch {
    // run-build.ps1 ignores a broken STATE.json and keeps the empty resume fields.
  }
  return state;
}

/**
 * @typedef {object} Session
 * @property {DriverState} state
 * @property {number} gitCode
 * @property {boolean} holdLock
 */

/**
 * @returns {Session}
 */
function createSession() {
  return { state: loadState(), gitCode: 0, holdLock: false };
}

/**
 * @param {string} message
 */
function logLine(message) {
  fs.appendFileSync(driverLog, `${stamp()} ${message}\n`, "utf8");
}

/**
 * @param {Session} session
 * @param {Partial<DriverState>} patch
 */
function save(session, patch) {
  Object.assign(session.state, patch);
  session.state.updated = stamp();
  session.state.pid = process.pid;
  const body = `${JSON.stringify(session.state, null, 4)}\n`;
  fs.writeFileSync(stateFile, body, "utf8");
}

/**
 * @param {Session} session
 * @param {string} why
 * @param {string} detail
 */
function block(session, why, detail) {
  const body = [
    `# BLOCKED ${stamp()} (America/Costa_Rica)`,
    "",
    `Prompt: ${session.state.current} (${session.state.file})`,
    "",
    `Reason: ${why}`,
    "",
    detail,
    "",
    "Fix the cause, delete this file, then relaunch the driver (run-build.ps1 on Windows, or node .hh-driver/run-build.mjs on macOS and Linux). It resumes after STATE.json last_done.",
    "",
  ].join("\n");
  fs.writeFileSync(blockedFile, body, "utf8");
  logLine(`BLOCKED: ${why}`);
  save(session, { status: `blocked: ${why}` });
}

/**
 * @param {Session} session
 * @param {string[]} args
 * @returns {string[]}
 */
function runGit(session, args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  session.gitCode = result.status === null ? 1 : result.status;
  const chunks = [];
  if (result.stdout) chunks.push(result.stdout.replace(/\r?\n$/, ""));
  if (result.stderr) chunks.push(result.stderr.replace(/\r?\n$/, ""));
  const text = chunks.filter((chunk) => chunk !== "").join("\n");
  return text === "" ? [] : text.split(/\r?\n/);
}

/**
 * @param {Session} session
 * @returns {string}
 */
function head(session) {
  return runGit(session, ["rev-parse", "HEAD"])[0] ?? "";
}

/**
 * @param {Session} session
 * @returns {string[]}
 */
function dirty(session) {
  return runGit(session, ["status", "--porcelain"]).filter((line) => line.trim() !== "");
}

/**
 * @param {Session} session
 * @param {string} why
 */
function pushMain(session, why) {
  const out = runGit(session, ["push", "origin", "main"]);
  if (session.gitCode === 0) {
    const hash = head(session);
    logLine(`PUSH ok after ${why} : ${hash}`);
    save(session, { last_push: `${hash} ${stamp()}` });
    return;
  }
  const tail = out.slice(-6).join(" | ");
  logLine(`PUSH FAILED after ${why} (continuing; next checkpoint retries): ${tail}`);
  save(session, { last_push: `FAILED ${stamp()}` });
}

/**
 * @param {number | undefined} pid
 */
function killTree(pid) {
  if (!pid) return;
  if (os.platform() === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // The process already exited.
    }
  }
}

/**
 * @param {string} file
 * @returns {string}
 */
function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

/**
 * @param {import("node:child_process").ChildProcess} child
 * @returns {Promise<number>}
 */
function waitExit(child) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      resolve(code);
    };
    child.once("exit", (code) => finish(code ?? 1));
    child.once("error", () => finish(child.exitCode ?? 1));
  });
}

/**
 * @param {string} logPath
 * @returns {string}
 */
function lastEndLine(logPath) {
  const lines = lastLines(readText(logPath), 80).filter((line) => /^\{"type":"end"/.test(line));
  return lines.at(-1) ?? "";
}

/**
 * @param {string} endLine
 * @returns {string}
 */
function readStopReason(endLine) {
  if (!endLine) return "";
  try {
    const parsed = JSON.parse(endLine);
    if (isRecord(parsed) && typeof parsed.stopReason === "string") return parsed.stopReason;
  } catch {
    return "";
  }
  return "";
}

/**
 * @param {Session} session
 * @param {PromptRecord} prompt
 * @param {number} attempt
 * @returns {Promise<"ok" | "stall" | "usage" | "fail">}
 */
async function runOnce(session, prompt, attempt) {
  const suffix = attempt > 1 ? `.retry${attempt - 1}` : "";
  const logPath = path.join(logDir, `${prompt.id}${suffix}.log`);
  const errPath = path.join(logDir, `${prompt.id}${suffix}.err.log`);
  const args = buildGrokArgs(prompt.text, prompt.effort, prompt.turns, root);
  const argsLen = args.join(" ").length;
  save(session, {
    current: prompt.id,
    file: prompt.name,
    kind: prompt.kind,
    effort: prompt.effort,
    started: stamp(),
    status: "running",
    attempt,
  });
  logLine(
    `START ${prompt.id} ${prompt.name} kind=${prompt.kind} effort=${prompt.effort} turns=${prompt.turns} attempt=${attempt} argsLen=${argsLen}`,
  );

  /** @type {number | undefined} */
  let stdinFd;
  /** @type {number | undefined} */
  let stdoutFd;
  /** @type {number | undefined} */
  let stderrFd;
  /** @type {import("node:child_process").ChildProcess | undefined} */
  let child;
  try {
    stdinFd = fs.openSync(emptyIn, "r");
    stdoutFd = fs.openSync(logPath, "w");
    stderrFd = fs.openSync(errPath, "w");
    const env = { ...process.env };
    delete env.GROK_HOME;
    delete env.GROK_SANDBOX;
    child = spawn(resolveGrokBin(process.env, os.homedir(), os.platform(), fs.existsSync), args, {
      cwd: root,
      detached: os.platform() !== "win32",
      windowsHide: true,
      stdio: [stdinFd, stdoutFd, stderrFd],
      env,
    });
  } catch (error) {
    closeFd(stdinFd);
    closeFd(stdoutFd);
    closeFd(stderrFd);
    const message = error instanceof Error ? error.message : String(error);
    logLine(`SPAWN ERROR ${prompt.id}: ${message}`);
    return "fail";
  }
  closeFd(stdinFd);
  closeFd(stdoutFd);
  closeFd(stderrFd);
  if (!child.pid) {
    logLine(`SPAWN ERROR ${prompt.id}: no process object`);
    return "fail";
  }
  logLine(`SPAWNED ${prompt.id} grok pid ${child.pid}`);
  save(session, { grok_pid: child.pid });

  const exited = waitExit(child);
  let finished = false;
  let exitCode = 1;
  void exited.then((code) => {
    finished = true;
    exitCode = code;
  });
  let lastSize = -1;
  let lastGrow = Date.now();
  const stallMs = STALL_MINUTES * 60 * 1000;
  while (!finished) {
    await Promise.race([exited, delay(POLL_SECONDS * 1000)]);
    if (finished) break;
    const size = fileSize(logPath) + fileSize(errPath);
    if (size !== lastSize) {
      lastSize = size;
      lastGrow = Date.now();
    } else if (Date.now() - lastGrow >= stallMs) {
      logLine(`STALL ${prompt.id}: no log growth for ${STALL_MINUTES} min (size ${size}); killing grok pid ${child.pid}`);
      killTree(child.pid);
      await delay(5000);
      return "stall";
    }
  }

  const endLine = lastEndLine(logPath);
  const stop = readStopReason(endLine);
  logLine(`EXIT ${prompt.id} code=${exitCode} stopReason=${stop} logBytes=${fileSize(logPath)}`);
  return classifyRun({
    code: exitCode,
    hasEnd: endLine !== "",
    stopReason: stop,
    usage: textLooksLikeUsageLimit(readText(logPath), readText(errPath)),
  });
}

/**
 * @param {number | undefined} fd
 */
function closeFd(fd) {
  if (fd === undefined) return;
  try {
    fs.closeSync(fd);
  } catch {
    // The descriptor is already closed.
  }
}

/**
 * @param {string} file
 * @returns {number}
 */
function fileSize(file) {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

/**
 * @param {Session} session
 * @returns {boolean}
 */
function acquireLock(session) {
  const existing = readLockPid();
  if (existing && isLiveDriverPid(existing)) {
    logLine(`another driver is running (pid ${existing}); exiting`);
    return false;
  }
  fs.writeFileSync(lockFile, `${process.pid}\n`, "utf8");
  session.holdLock = true;
  return true;
}

/**
 * @returns {number}
 */
function readLockPid() {
  try {
    const first = fs.readFileSync(lockFile, "utf8").split(/\r?\n/)[0]?.trim() ?? "";
    const pid = Number.parseInt(first, 10);
    return Number.isFinite(pid) ? pid : 0;
  } catch {
    return 0;
  }
}

/**
 * @param {Session} session
 */
function releaseLock(session) {
  if (!session.holdLock) return;
  session.holdLock = false;
  try {
    fs.rmSync(lockFile, { force: true });
  } catch {
    // The lock file is already gone.
  }
}

/**
 * One tiny Grok call with the full flag set. Does not take the lock or walk the queue.
 * @returns {Promise<number>}
 */
async function smoke() {
  const text = "Reply with exactly the word READY and nothing else. Do not use any tools.";
  const args = buildGrokArgs(text, "low", 2, root);
  const out = path.join(logDir, "smoke.log");
  const err = `${out}.err`;
  const code = await runCaptured(args, out, err);
  process.stdout.write(`exit=${code} argsLen=${args.join(" ").length}\n`);
  for (const line of readText(out).split(/\r?\n/)) {
    if (/"type":"(text|end|error)"/.test(line)) process.stdout.write(`${line.slice(0, 240)}\n`);
  }
  const errLines = readText(err).split(/\r?\n/).filter((line) => line !== "");
  for (const line of errLines.slice(-10)) process.stdout.write(`${line}\n`);
  return 0;
}

/**
 * @param {string[]} args
 * @param {string} out
 * @param {string} err
 * @returns {Promise<number>}
 */
function runCaptured(args, out, err) {
  return new Promise((resolve) => {
    /** @type {number | undefined} */
    let stdinFd;
    /** @type {number | undefined} */
    let stdoutFd;
    /** @type {number | undefined} */
    let stderrFd;
    try {
      stdinFd = fs.openSync(emptyIn, "r");
      stdoutFd = fs.openSync(out, "w");
      stderrFd = fs.openSync(err, "w");
      const env = { ...process.env };
      delete env.GROK_HOME;
      delete env.GROK_SANDBOX;
      const child = spawn(resolveGrokBin(process.env, os.homedir(), os.platform(), fs.existsSync), args, {
        cwd: root,
        windowsHide: true,
        stdio: [stdinFd, stdoutFd, stderrFd],
        env,
      });
      closeFd(stdinFd);
      closeFd(stdoutFd);
      closeFd(stderrFd);
      stdinFd = undefined;
      child.once("exit", (code) => resolve(code ?? 1));
      child.once("error", () => resolve(child.exitCode ?? 1));
    } catch {
      closeFd(stdinFd);
      closeFd(stdoutFd);
      closeFd(stderrFd);
      resolve(1);
    }
  });
}

/**
 * @param {Session} session
 * @param {{ startAt: number, stopAfter: number }} args
 * @returns {Promise<number>}
 */
async function runQueue(session, args) {
  const files = listPromptFiles(promptDir);
  const prompts = files.map((file) => readPrompt(file));
  const from = resumeFrom(args.startAt, session.state.last_done);
  const selected = nextPrompts(prompts, {
    startAt: args.startAt,
    stopAfter: args.stopAfter,
    lastDone: session.state.last_done,
  });
  const truncated = prompts.some((prompt) => prompt.num >= from && args.stopAfter > 0 && prompt.num > args.stopAfter);
  logLine(
    `driver start pid=${process.pid} prompts=${prompts.length} from=${from} stopAfter=${args.stopAfter} GROK_HOME='${process.env.GROK_HOME ?? ""}' head=${head(session)}`,
  );
  logLine(`grok ${resolveGrokBin(process.env, os.homedir(), os.platform(), fs.existsSync)}`);

  for (const prompt of selected) {
    while (fs.existsSync(pauseFile)) {
      save(session, { status: `paused before ${prompt.id}` });
      await delay(30_000);
    }
    const beforeDirty = dirty(session);
    if (beforeDirty.length > 0) {
      logLine(`tree dirty before ${prompt.id}: ${beforeDirty.join("; ")}`);
      block(session, `working tree not clean before prompt ${prompt.id}`, `git status --porcelain:\n${beforeDirty.join("\n")}`);
      return 3;
    }
    const before = head(session);
    let result = "";
    let attempt = 0;
    while (attempt < 2) {
      attempt += 1;
      result = await runOnce(session, prompt, attempt);
      if (result === "usage") {
        block(
          session,
          `Grok usage limit reached during prompt ${prompt.id}`,
          `See ${path.join("logs", `${prompt.id}*.log`)} and ${path.join("logs", `${prompt.id}*.err.log`)}. Relaunch when the limit resets; the prompt reruns from the start in a fresh session (commit or stash any partial work first).`,
        );
        return 4;
      }
      const after = head(session);
      const changes = dirty(session);
      if (result === "ok" && (after !== before || changes.length > 0)) break;
      if (result === "ok") {
        result = "nochange";
        logLine(`prompt ${prompt.id} finished with no commit and no changes`);
      }
      if (attempt < 2) {
        if (changes.length > 0) logLine(`keeping partial work from attempt ${attempt} for the retry`);
        logLine(`retrying ${prompt.id} in a fresh session (reason: ${result})`);
      }
    }
    if (result !== "ok") {
      block(
        session,
        `prompt ${prompt.id} did not complete after one retry (last result: ${result})`,
        `See ${path.join("logs", `${prompt.id}.log`)} and ${path.join("logs", `${prompt.id}.retry1.log`)}. HEAD is ${head(session)}; partial work, if any, is left uncommitted.`,
      );
      return 5;
    }
    const leftover = dirty(session);
    if (leftover.length > 0) {
      logLine(`prompt ${prompt.id} left ${leftover.length} uncommitted paths; committing with the prompt's message`);
      runGit(session, ["add", "-A"]);
      runGit(session, ["commit", "-m", prompt.msg, "-m", DRIVER_COMMIT_BODY]);
      if (session.gitCode !== 0) {
        block(session, `driver commit failed after prompt ${prompt.id}`, runGit(session, ["status", "--short"]).join("\n"));
        return 6;
      }
    }
    const after = head(session);
    const still = dirty(session);
    if (after === before) {
      block(session, `no commit after prompt ${prompt.id}`, "The session ended cleanly but nothing was committed.");
      return 7;
    }
    if (still.length > 0) {
      block(session, `tree still dirty after prompt ${prompt.id}`, still.join("\n"));
      return 8;
    }
    // The PowerShell runner logs the rev-list count and accepts more than one commit.
    // A checkpoint may land a fix commit before the named commit. The gate is a moved HEAD and a clean tree.
    const count = runGit(session, ["rev-list", "--count", `${before}..${after}`])[0] ?? "";
    const subject = runGit(session, ["log", "-1", "--format=%s"])[0] ?? "";
    logLine(`DONE ${prompt.id}: ${count} commit(s), HEAD ${after} : ${subject}`);
    save(session, { status: `done ${prompt.id}`, last_done: prompt.id, last_commit: after });
    if (shouldPush(prompt.kind)) pushMain(session, `checkpoint ${prompt.id}`);
  }

  if (truncated) {
    logLine(`StopAfter ${args.stopAfter} reached`);
    save(session, { status: `stopped after ${args.stopAfter}` });
    return 0;
  }
  // run-build.ps1 also pushes when the queue finishes (Push-Main 'final'), unless status starts with "stopped".
  if (!fs.existsSync(blockedFile) && !/^stopped/i.test(session.state.status)) {
    logLine("all prompts done");
    save(session, { status: "complete" });
    pushMain(session, "final");
  }
  return 0;
}

/**
 * @returns {Promise<number>}
 */
async function main() {
  fs.mkdirSync(logDir, { recursive: true });
  if (!fs.existsSync(emptyIn)) fs.writeFileSync(emptyIn, "", "utf8");
  delete process.env.GROK_HOME;
  delete process.env.GROK_SANDBOX;
  const session = createSession();
  const args = parseDriverArgs(process.argv.slice(2));
  if (args.smokeTest) return smoke();
  if (!acquireLock(session)) return 1;
  try {
    if (fs.existsSync(blockedFile)) {
      logLine("BLOCKED.md exists; not starting. Delete it to resume.");
      return 2;
    }
    return await runQueue(session, args);
  } finally {
    releaseLock(session);
  }
}

if (invokedDirectly(process.argv[1], import.meta.url)) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
      try {
        fs.appendFileSync(driverLog, `${stamp()} DRIVER ERROR ${message}\n`, "utf8");
      } catch {
        // Logging failed. The exit code still reports the failure.
      }
      process.exitCode = 1;
    });
}
