import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Default child lifetime. A longer run is killed and reported as TIMEOUT. */
export const DEFAULT_TIMEOUT_MS = 60_000;

const STDERR_LIMIT = 500;
const MAX_TIMEOUT_MS = 2_147_483_647;
const BIN_ENV = "WHISPER_CPP_BIN";
const MODEL_ENV = "WHISPER_CPP_MODEL";

/**
 * The only engine this package calls. A paid speech API is out of scope.
 * Callers pass `local` from Guide config `voiceEngine`.
 */
const LOCAL_ENGINE = "local" as const;

export interface TranscribeRequest {
  wavPath: string;
  bin: string;
  model: string;
  timeoutMs?: number;
}

export interface Transcript {
  text: string;
  engine: "local";
}

export interface ProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** `args` is an argv array. Callers must not join it into a shell string. */
export type WhisperRunner = (
  bin: string,
  args: readonly string[],
) => Promise<ProcessResult>;

export interface TranscribeDeps {
  /**
   * Test seam. The default runner spawns `bin` with `shell: false`.
   * Production callers leave this unset.
   */
  runner?: WhisperRunner;
  /**
   * Replaces `buildArgs` for tests that spawn node itself.
   * Production callers leave this unset.
   */
  args?: readonly string[];
}

export interface WhisperPaths {
  bin: string;
  model: string;
}

export interface ResolveOptions {
  env?: NodeJS.ProcessEnv;
  /** Directories to scan when WHISPER_CPP_BIN is unset. Defaults to PATH. */
  pathDirs?: readonly string[];
  platform?: NodeJS.Platform;
}

export type WhisperErrorCode =
  | "MISSING_BIN"
  | "MISSING_MODEL"
  | "BAD_AUDIO"
  | "FAILED"
  | "TIMEOUT";

export class WhisperError extends Error {
  readonly code: WhisperErrorCode;

  constructor(code: WhisperErrorCode, message: string) {
    super(message);
    this.name = "WhisperError";
    this.code = code;
  }
}

/**
 * Argv for whisper-cli, including the binary as element 0.
 * The return value is an array on purpose: a path with spaces or shell
 * metacharacters stays one entry. Do not join it.
 *
 * `-nt` and `--no-timestamps` are the upstream aliases that keep timestamps
 * out of stdout. `--output-txt` is an upstream optional file flag and is
 * not passed here.
 */
export function buildArgs(req: TranscribeRequest): string[] {
  return [req.bin, "-m", req.model, "-f", req.wavPath, "-nt", "--no-timestamps"];
}

/**
 * Resolve the local binary and model.
 * `WHISPER_CPP_BIN` wins. Otherwise scan PATH for `whisper-cli`, then `main`
 * (with `.exe` on Windows). `WHISPER_CPP_MODEL` is the model path.
 * This does not choose a weight file and does not download one.
 */
export function resolveWhisperPaths(options: ResolveOptions = {}): WhisperPaths {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const model = readEnv(env, MODEL_ENV);
  if (model === null) {
    throw new WhisperError(
      "MISSING_MODEL",
      "Set WHISPER_CPP_MODEL to the model file you downloaded.",
    );
  }
  const configuredBin = readEnv(env, BIN_ENV);
  const bin =
    configuredBin ??
    findOnPath(options.pathDirs ?? pathDirsFrom(env), platform);
  if (bin === null) {
    throw new WhisperError(
      "MISSING_BIN",
      "Set WHISPER_CPP_BIN, or place whisper-cli or main on PATH.",
    );
  }
  assertBin(bin);
  assertModel(model);
  return { bin, model };
}

/**
 * Transcribe one local wav by spawning whisper.cpp.
 * Missing files throw before the runner is called. There is no network fallback.
 */
export async function transcribe(
  req: TranscribeRequest,
  deps: TranscribeDeps = {},
): Promise<Transcript> {
  assertBin(req.bin);
  assertModel(req.model);
  assertWav(req.wavPath);

  const timeoutMs = readTimeout(req.timeoutMs);
  const args = deps.args ?? buildArgs(req).slice(1);
  const runner =
    deps.runner ??
    ((bin: string, runArgs: readonly string[]) => spawnWhisper(bin, runArgs, timeoutMs));

  let result: ProcessResult;
  try {
    result = deps.runner
      ? await withTimeout(runner(req.bin, args), timeoutMs)
      : await runner(req.bin, args);
  } catch (error) {
    if (error instanceof WhisperError) throw error;
    throw mapUnknown(error);
  }

  return transcriptFrom(result);
}

function transcriptFrom(result: ProcessResult): Transcript {
  if (result === undefined || result === null) {
    throw new WhisperError("FAILED", "whisper.cpp returned an unreadable result.");
  }
  if (typeof result.stdout !== "string" || typeof result.stderr !== "string") {
    throw new WhisperError("FAILED", "whisper.cpp returned an unreadable result.");
  }
  const code = result.code;
  if (code === 0) {
    const text = result.stdout.trim();
    if (text.length === 0) {
      throw new WhisperError("FAILED", "whisper.cpp returned no text.");
    }
    return { text, engine: LOCAL_ENGINE };
  }
  if (code === null || code === undefined) {
    throw new WhisperError("FAILED", "whisper.cpp exited without a status code.");
  }
  throw new WhisperError("FAILED", failedMessage(code, result.stderr));
}

function assertBin(bin: string): void {
  if (!isFile(bin)) {
    throw new WhisperError("MISSING_BIN", "whisper.cpp binary was not found.");
  }
}

function assertModel(model: string): void {
  // A weight under packages/ could be committed and then used as if it
  // were an installed model. Refuse the tree before looking at the file.
  if (isInsidePackages(model)) {
    throw new WhisperError(
      "FAILED",
      "Refusing a model path inside packages/. Weights are not stored in this repo.",
    );
  }
  if (!isFile(model)) {
    throw new WhisperError("MISSING_MODEL", "whisper.cpp model was not found.");
  }
}

function assertWav(wavPath: string): void {
  const lowered = wavPath.toLowerCase();
  if (lowered.startsWith("http:") || lowered.startsWith("https:")) {
    throw new WhisperError("BAD_AUDIO", "Audio must be a local .wav file.");
  }
  if (path.extname(wavPath).toLowerCase() !== ".wav") {
    throw new WhisperError("BAD_AUDIO", "Audio must be a .wav file.");
  }
  if (!existsSync(wavPath) || !isFile(wavPath)) {
    throw new WhisperError("BAD_AUDIO", "Audio path is not a file.");
  }
  let size = 0;
  try {
    size = statSync(wavPath).size;
  } catch {
    throw new WhisperError("BAD_AUDIO", "Audio path is not a file.");
  }
  if (size === 0) {
    throw new WhisperError("BAD_AUDIO", "Audio file is empty.");
  }
}

function isFile(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isInsidePackages(modelPath: string): boolean {
  const packagesDir = normalize(path.join(repoRoot(), "packages"));
  const resolved = normalize(path.resolve(modelPath));
  if (resolved === packagesDir) return true;
  const prefix = packagesDir.endsWith(path.sep) ? packagesDir : packagesDir + path.sep;
  return resolved.startsWith(prefix);
}

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
}

function normalize(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function readTimeout(value: number | undefined): number {
  if (value === undefined) return DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(value) || value <= 0 || value > MAX_TIMEOUT_MS) {
    throw new WhisperError("FAILED", "timeoutMs must be a positive number of milliseconds.");
  }
  return value;
}

function readEnv(env: NodeJS.ProcessEnv, key: string): string | null {
  const value = env[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function pathDirsFrom(env: NodeJS.ProcessEnv): string[] {
  const raw = env.PATH ?? env.Path ?? env.path ?? "";
  return raw
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function findOnPath(dirs: readonly string[], platform: NodeJS.Platform): string | null {
  const names =
    platform === "win32"
      ? ["whisper-cli.exe", "whisper-cli", "main.exe", "main"]
      : ["whisper-cli", "main"];
  for (const name of names) {
    for (const dir of dirs) {
      const candidate = path.join(dir, name);
      if (isFile(candidate)) return candidate;
    }
  }
  return null;
}

function spawnWhisper(
  bin: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    // shell stays off. On Unix the child leads its own group so a timeout
    // can signal the group. On Windows, child.kill("SIGKILL") stops it.
    const child = spawn(bin, [...args], {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finishOk = (code: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    };

    const finishErr = (error: WhisperError): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };

    const timer = setTimeout(() => {
      killChild(child);
      finishErr(
        new WhisperError("TIMEOUT", `whisper.cpp timed out after ${timeoutMs}ms.`),
      );
    }, timeoutMs);

    child.stdout?.on("error", () => {});
    child.stderr?.on("error", () => {});
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string | Buffer) => {
      stdout += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: string | Buffer) => {
      stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      const errno = errnoCode(error);
      if (errno === "ENOENT") {
        finishErr(
          new WhisperError("MISSING_BIN", "whisper.cpp binary could not be started."),
        );
        return;
      }
      finishErr(new WhisperError("FAILED", clip(error.message.trim())));
    });
    child.on("close", (code) => {
      finishOk(code);
    });
  });
}

function killChild(child: ChildProcess): void {
  const pid = child.pid;
  if (process.platform !== "win32" && pid !== undefined) {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      try {
        child.kill("SIGKILL");
      } catch {
        // The child may already have exited.
      }
    }
  } else {
    try {
      child.kill("SIGKILL");
    } catch {
      // The child may already have exited.
    }
  }
  child.stdout?.destroy();
  child.stderr?.destroy();
  child.unref();
}

function withTimeout(work: Promise<ProcessResult>, timeoutMs: number): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new WhisperError("TIMEOUT", `whisper.cpp timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
    work.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function failedMessage(code: number, stderr: string): string {
  const detail = clip(stderr.trim());
  if (detail.length === 0) return `whisper.cpp exited ${code}.`;
  return `whisper.cpp exited ${code}: ${detail}`;
}

function clip(text: string): string {
  if (text.length <= STDERR_LIMIT) return text;
  return text.slice(0, STDERR_LIMIT);
}

function mapUnknown(error: unknown): WhisperError {
  if (error instanceof WhisperError) return error;
  if (error instanceof Error) {
    if (errnoCode(error) === "ENOENT") {
      return new WhisperError("MISSING_BIN", "whisper.cpp binary could not be started.");
    }
    return new WhisperError("FAILED", clip(error.message.trim()));
  }
  return new WhisperError("FAILED", "whisper.cpp failed.");
}

function errnoCode(error: Error): string | null {
  if (!("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && code.length > 0) return code;
  return null;
}
