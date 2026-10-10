// Queue planning shared with .hh-driver/run-build.mjs.
// Package tests import this file. They do not import the runner.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MODEL = "grok-4.7";

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
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
export function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
export function lastLines(text, count) {
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
