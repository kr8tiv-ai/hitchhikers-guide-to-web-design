// run-build.mjs — macOS and Linux runner for hh-build-plan/prompts.
// Mirrors .hh-driver/run-build.ps1: one fresh Grok session per prompt, the same
// state files, and a normal `git push origin main` (never force).
// Windows keeps run-build.ps1. Do not launch this file from a test import.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

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

export const MODEL = "grok-4.7";
const STALL_MINUTES = 30;
const POLL_SECONDS = 20;
const DRIVER_COMMIT_BODY = "Committed by .hh-driver after the Grok session ended with a dirty tree.";

// Same deny list as run-build.ps1. The backslash path is one Windows deny rule, not a path this file opens.
export const DENY_RULES = [
  "Bash(*git push*)",
  "Bash(*git reset --hard*)",
  "Bash(*git clean -*)",
  "Bash(*git filter-branch*)",
  "Bash(*git config --global*)",
  "Bash(*grok login*)",
  "Bash(*grok logout*)",
  "Bash(*GROK_HOME*)",
  "Bash(*.grok-aurahomes*)",
  "Bash(*Vanguard-Eco-Homes*)",
  "Bash(*taskkill*)",
  "Bash(*Stop-Process*)",
  "Bash(*pkill*)",
  "Bash(*killall*)",
  "Bash(*wmic*)",
  "Bash(*vercel deploy*)",
  "Bash(*vercel --prod*)",
  "Bash(*netlify deploy*)",
  "Bash(*wrangler deploy*)",
  "Bash(*wrangler pages deploy*)",
  "Bash(*npm publish*)",
  "Bash(*pnpm publish*)",
  "Bash(*gh release create*)",
  "Bash(*gh repo delete*)",
  "Bash(*Set-ExecutionPolicy*)",
  "Bash(*Set-MpPreference*)",
  "Bash(*reg add*)",
  "Bash(*reg delete*)",
  "Bash(*bcdedit*)",
  "Bash(*netsh*)",
  "Bash(*schtasks*)",
  "Bash(*shutdown*)",
  "Bash(*format c:*)",
  "Bash(*Remove-Item*C:\\Users\\lucid\\*-Recurse*)",
  "Bash(*rm -rf ~*)",
  "Bash(*rm -rf /*)",
  "Read(**/.ssh/**)",
  "Read(**/.git-credentials)",
  "Read(**/.grok/auth*)",
  "Read(**/.grok/*token*)",
  "Read(**/.grok/*cred*)",
  "Read(**/.grok-aurahomes/**)",
  "Read(**/.env)",
  "Read(**/.env.local)",
  "Edit(**/.grok-aurahomes/**)",
  "Edit(**/Vanguard-Eco-Homes/**)",
  "Write(**/.grok-aurahomes/**)",
  "Write(**/Vanguard-Eco-Homes/**)",
];

// PowerShell -match is case-insensitive. (?s) is dot-all, so [\s\S] stands in for `.`.
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
const KIND_LINE = /^kind:\s*"?([\w-]+)/im;
const EFFORT_LINE = /^effort:\s*"?(\w+)/im;
const COMMIT_BLOCK = /## Commit\s*\r?\n\s*```[^\n]*\r?\n([\s\S]*?)\r?\n```/i;
const USAGE_RE =
  /usage limit|rate.?limit(ed)?\b.*(reached|exceeded)|quota|limit (reached|exceeded)|too many requests|\b429\b|insufficient (credit|balance)|out of credits|subscription limit|upgrade your plan/i;

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
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {Date} [date]
 * @returns {string}
 */
function stamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * @param {string} fileName
 * @returns {string}
 */
function fileBase(fileName) {
  const name = path.basename(fileName);
  const ext = path.extname(name);
  return ext ? name.slice(0, -ext.length) : name;
}

/**
 * Queue names match run-build.ps1: `^\d{3}-` and `*.md`. `044a-ci-green.md` is not in the queue.
 * @param {string} name
 * @returns {boolean}
 */
export function isPromptFileName(name) {
  return /^\d{3}-/.test(name) && /\.md$/i.test(name);
}

/**
 * id is the first three characters of the file name, as in FileInfo.Name.Substring(0, 3).
 * kind, effort, and the commit message use the PowerShell -match patterns.
 * @param {string} text
 * @param {string} fileName
 * @returns {FrontMatter}
 */
export function parseFrontMatter(text, fileName) {
  const name = path.basename(fileName);
  const id = name.slice(0, 3);
  const fmMatch = FRONT_MATTER.exec(text);
  const fm = fmMatch?.[1] ?? "";
  const kindMatch = KIND_LINE.exec(fm);
  const effortMatch = EFFORT_LINE.exec(fm);
  const kind = kindMatch?.[1] ?? "build";
  const effort = effortMatch?.[1] ?? "high";
  const commitMatch = COMMIT_BLOCK.exec(text);
  const msg = commitMatch?.[1] !== undefined ? commitMatch[1].trim() : `build(${id}): ${fileBase(name)}`;
  return { id, kind, effort, msg };
}

/**
 * PowerShell `switch` is case-insensitive. once-over 600, checkpoint 400, otherwise 300.
 * @param {string} kind
 * @returns {number}
 */
export function turnsForKind(kind) {
  const value = String(kind).toLowerCase();
  if (value === "once-over") return 600;
  if (value === "checkpoint") return 400;
  return 300;
}

/**
 * `-eq` in the PowerShell push check is case-insensitive.
 * @param {string} kind
 * @returns {boolean}
 */
export function shouldPush(kind) {
  const value = String(kind).toLowerCase();
  return value === "checkpoint" || value === "once-over";
}

/**
 * StartAt wins when it is greater than zero. Otherwise the next prompt is last_done + 1.
 * An empty last_done starts at 1, matching `[int]$State.last_done + 1` after the empty check.
 * @param {number} startAt
 * @param {string} lastDone
 * @returns {number}
 */
export function resumeFrom(startAt, lastDone) {
  const start = Number(startAt);
  if (Number.isFinite(start) && start > 0) return start;
  const raw = String(lastDone ?? "").trim();
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) return parsed + 1;
  }
  return 1;
}

/**
 * @param {PromptRecord[]} prompts
 * @param {{ startAt?: number, stopAfter?: number, lastDone?: string }} [options]
 * @returns {PromptRecord[]}
 */
export function nextPrompts(prompts, options = {}) {
  const startAt = options.startAt ?? 0;
  const stopAfter = options.stopAfter ?? 0;
  const from = resumeFrom(startAt, options.lastDone ?? "");
  const ordered = [...prompts].sort((left, right) => {
    if (left.name < right.name) return -1;
    if (left.name > right.name) return 1;
    return 0;
  });
  const selected = [];
  for (const prompt of ordered) {
    if (prompt.num < from) continue;
    if (stopAfter > 0 && prompt.num > stopAfter) break;
    selected.push(prompt);
  }
  return selected;
}

/**
 * @param {string} filePath
 * @returns {PromptRecord}
 */
export function readPrompt(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const name = path.basename(filePath);
  const parsed = parseFrontMatter(text, name);
  return {
    ...parsed,
    num: Number.parseInt(parsed.id, 10),
    name,
    text,
    turns: turnsForKind(parsed.kind),
  };
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
export function listPromptFiles(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isPromptFileName(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    .map((name) => path.join(dir, name));
}

/**
 * @param {string} projectRoot
 * @returns {string}
 */
export function buildDriverRules(projectRoot) {
  return (
    "You are running headless under an automated build driver in " +
    projectRoot +
    ". Work only inside this project. " +
    "Do not run git push (the driver pushes after checkpoints). Do not sign in or out of Grok, change GROK_HOME, or touch other projects. " +
    "Do not stop or kill processes you did not start; stop any dev server you start before you finish. Never print or commit secrets. " +
    "Use PowerShell syntax for terminal commands (no && chaining; use ;). When the prompt is done, make the commit named in its Commit section and leave the working tree clean. Nobody can answer questions: make the reasonable choice, note it in the report, and keep going."
  );
}

/**
 * Argv for one Grok session. `-p=` keeps a leading `---` from being read as a flag.
 * Node passes the array without a shell, so the text is not quoted again.
 * @param {string} text
 * @param {string} effort
 * @param {number} turns
 * @param {string} projectRoot
 * @returns {string[]}
 */
export function buildGrokArgs(text, effort, turns, projectRoot) {
  const args = [
    `-p=${text}`,
    "-m",
    MODEL,
    "--effort",
    effort,
    "--output-format",
    "streaming-json",
    "--max-turns",
    String(turns),
    "--always-approve",
    "--sandbox",
    "workspace",
    "--cwd",
    projectRoot,
  ];
  for (const rule of DENY_RULES) args.push("--deny", rule);
  args.push("--rules", buildDriverRules(projectRoot));
  return args;
}

/**
 * @param {string[]} argv
 * @returns {{ startAt: number, stopAfter: number, smokeTest: boolean }}
 */
export function parseDriverArgs(argv) {
  let startAt = 0;
  let stopAfter = 0;
  let smokeTest = false;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";
    if (token === "--smoke-test" || token === "-SmokeTest") {
      smokeTest = true;
      continue;
    }
    const start = takeNumber(token, argv, index, ["--start-at", "-StartAt"]);
    if (start.matched) {
      startAt = start.value;
      index = start.index;
      continue;
    }
    const stop = takeNumber(token, argv, index, ["--stop-after", "-StopAfter"]);
    if (stop.matched) {
      stopAfter = stop.value;
      index = stop.index;
    }
  }
  return { startAt, stopAfter, smokeTest };
}

/**
 * @param {string} token
 * @param {string[]} argv
 * @param {number} index
 * @param {string[]} names
 * @returns {{ matched: boolean, value: number, index: number }}
 */
function takeNumber(token, argv, index, names) {
  for (const name of names) {
    if (token === name) {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("-")) return { matched: true, value: 0, index };
      return { matched: true, value: parseFlagNumber(next), index: index + 1 };
    }
    const prefix = `${name}=`;
    if (token.startsWith(prefix)) {
      return { matched: true, value: parseFlagNumber(token.slice(prefix.length)), index };
    }
  }
  return { matched: false, value: 0, index };
}

/**
 * @param {string | undefined} raw
 * @returns {number}
 */
function parseFlagNumber(raw) {
  if (raw === undefined) return 0;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Windows prefers the home `grok.exe`, which is where run-build.ps1 finds Grok.
 * macOS and Linux use `grok` on PATH, then the home bin.
 * @param {Record<string, string | undefined>} env
 * @param {string} home
 * @param {string} platform
 * @param {(candidate: string) => boolean} exists
 * @returns {string}
 */
export function resolveGrokBin(env, home, platform, exists) {
  const exeName = platform === "win32" ? "grok.exe" : "grok";
  const homeBin = path.join(home, ".grok", "bin", exeName);
  if (platform === "win32" && exists(homeBin)) return homeBin;
  const pathEnv = env.PATH ?? env.Path ?? "";
  const names = platform === "win32" ? ["grok.exe", "grok.cmd", "grok"] : ["grok"];
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (exists(candidate)) return candidate;
    }
  }
  if (exists(homeBin)) return homeBin;
  return exeName;
}

/**
 * @param {string} text
 * @param {number} count
 * @returns {string[]}
 */
function lastLines(text, count) {
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  return lines.slice(-count);
}

/**
 * Same tail filter as Is-UsageLimit in run-build.ps1.
 * @param {string} logText
 * @param {string} errText
 * @returns {boolean}
 */
export function textLooksLikeUsageLimit(logText, errText) {
  const tail = lastLines(errText, 60);
  for (const line of lastLines(logText, 40)) {
    if (/"type":"(error|end)"/.test(line) || !line.startsWith("{")) tail.push(line);
  }
  return USAGE_RE.test(tail.join("\n"));
}

/**
 * Exit classification from Run-Once, after the stall check.
 * A usage phrase still counts as ok when the process exited 0 with stopReason end_turn.
 * @param {{ code: number, hasEnd: boolean, stopReason: string, usage: boolean }} outcome
 * @returns {"ok" | "usage" | "fail"}
 */
export function classifyRun(outcome) {
  if (outcome.usage && (outcome.code !== 0 || !outcome.hasEnd || outcome.stopReason !== "end_turn")) return "usage";
  if (outcome.code !== 0 && !outcome.hasEnd) return "fail";
  return "ok";
}

/**
 * @param {string} [entry]
 * @param {string} [moduleUrl]
 * @returns {boolean}
 */
export function invokedDirectly(entry = process.argv[1], moduleUrl = import.meta.url) {
  if (!entry) return false;
  try {
    return fs.realpathSync(entry) === fs.realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return path.resolve(entry) === fileURLToPath(moduleUrl);
  }
}

/**
 * @param {number} pid
 * @returns {boolean}
 */
function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = isRecord(error) && "code" in error ? String(error.code) : "";
    return code === "EPERM";
  }
}

/**
 * @param {number} pid
 * @returns {string}
 */
function processBaseName(pid) {
  try {
    if (os.platform() === "win32") {
      const out = spawnSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], {
        encoding: "utf8",
        windowsHide: true,
      });
      const match = /^"([^"]+)"/.exec(String(out.stdout ?? "").trim());
      return match?.[1] ?? "";
    }
    if (os.platform() === "linux") {
      try {
        const comm = fs.readFileSync(`/proc/${pid}/comm`, "utf8").trim();
        if (comm) return comm;
      } catch {
        // Fall through to ps. Some locked-down hosts hide /proc.
      }
    }
    const out = spawnSync("ps", ["-p", String(pid), "-o", "comm="], { encoding: "utf8" });
    return path.basename(String(out.stdout ?? "").trim());
  } catch {
    return "";
  }
}

/**
 * The lock is the driver, whether that process is node or the PowerShell runner.
 * A live pid with no readable name holds the lock. A reused pid of some other program does not.
 * @param {number} pid
 * @returns {boolean}
 */
export function isLiveDriverPid(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (!processAlive(pid)) return false;
  const name = processBaseName(pid);
  if (!name) return true;
  return /^(node|powershell|pwsh)(\.exe)?$/i.test(name);
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

if (invokedDirectly()) {
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
