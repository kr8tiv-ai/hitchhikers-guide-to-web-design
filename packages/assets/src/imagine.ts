/**
 * Budget gate for Imagine jobs.
 *
 * Prices come from prices.ts (card 2026-09-29). This file does not read
 * a price from the network and does not treat SuperGrok as a billing
 * source. The key is deps.apiKey, passed by the caller.
 *
 * DIY mode returns the prompts and a zero dollar total. It does not call
 * fetch. API mode quotes the whole batch, refuses it when the estimate
 * is above the remaining cap, then POSTs each job. A failed job is tried
 * at most once more. Polling and file downloads are a later prompt.
 *
 * Quote lines and logs name model and resolution. They do not carry the
 * prompt or the API key. The prompt is sent only in the request body.
 */

import {
  estimateMustFit,
  quote,
  type ImagineJob,
  type StillJob,
  type VideoJob,
} from "./prices.ts";

export const IMAGINE_IMAGE_ENDPOINT = "https://api.x.ai/v1/images/generations";
export const IMAGINE_VIDEO_ENDPOINT = "https://api.x.ai/v1/videos/generations";

const MAX_ATTEMPTS = 2;
const MIN_SECRET_LENGTH = 8;

export interface ImagineDeps {
  mode: "diy" | "api";
  remainingUsd: number;
  fetch: typeof fetch;
  apiKey?: string;
  log?: (line: string) => void;
}

export interface ImagineRunResult {
  mode: "diy" | "api";
  usd: number;
  prompts: string[];
  lines: string[];
}

interface PreparedRequest {
  url: string;
  body: Record<string, string | number>;
}

export async function runJobs(
  jobs: readonly ImagineJob[],
  deps: ImagineDeps,
): Promise<ImagineRunResult> {
  if (deps.mode !== "diy" && deps.mode !== "api") {
    throw new Error("Imagine mode must be diy or api.");
  }
  if (!Array.isArray(jobs) || jobs.length === 0) {
    throw new Error("Imagine run needs at least one job.");
  }

  const quoted = quote(jobs);
  const prompts = jobs.map((job) => job.prompt);
  const remainingUsd = readRemaining(deps.remainingUsd);
  reportLines(quoted.lines, prompts, deps.apiKey, deps.log);

  if (deps.mode === "diy") {
    return {
      mode: "diy",
      usd: 0,
      prompts,
      lines: quoted.lines,
    };
  }

  estimateMustFit(quoted, remainingUsd);
  const apiKey = requireApiKey(deps.apiKey);
  if (typeof deps.fetch !== "function") {
    throw new Error("Imagine API mode needs an injected fetch.");
  }

  const requests = jobs.map((job) => prepare(job));
  for (const request of requests) {
    await postJob(request, apiKey, deps.fetch);
  }

  return {
    mode: "api",
    usd: quoted.usd,
    prompts,
    lines: quoted.lines,
  };
}

function prepare(job: ImagineJob): PreparedRequest {
  if (job.kind === "still") {
    return { url: IMAGINE_IMAGE_ENDPOINT, body: stillRequest(job) };
  }
  return { url: IMAGINE_VIDEO_ENDPOINT, body: videoRequest(job) };
}

function stillRequest(job: StillJob): Record<string, string | number> {
  const body: Record<string, string | number> = {
    model: job.model,
    prompt: job.prompt,
    n: job.count,
  };
  if (job.resolution === "1k-low") {
    body.resolution = "1k";
    if (job.model === "grok-imagine-image-2.0") body.quality = "low";
  } else if (job.resolution === "2k-medium") {
    body.resolution = "2k";
    if (job.model === "grok-imagine-image-2.0") body.quality = "medium";
  }
  return body;
}

function videoRequest(job: VideoJob): Record<string, string | number> {
  return {
    model: job.model,
    prompt: job.prompt,
    duration: job.seconds,
    resolution: job.resolution,
  };
}

function readRemaining(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("remainingUsd must be a finite number of dollars, zero or more.");
  }
  return value;
}

function requireApiKey(value: string | undefined): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(
      "Imagine API mode needs deps.apiKey. SuperGrok is not a billing source. DIY mode returns prompts without a key.",
    );
  }
  return value.trim();
}

function reportLines(
  lines: readonly string[],
  prompts: readonly string[],
  apiKey: string | undefined,
  log: ((line: string) => void) | undefined,
): void {
  if (log === undefined) return;
  for (const line of lines) {
    log(redactSecrets(line, prompts, apiKey));
  }
}

async function postJob(
  request: PreparedRequest,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  if (apiKey.length >= MIN_SECRET_LENGTH && request.url.includes(apiKey)) {
    throw publicError("Imagine endpoint must not contain the API key.", apiKey);
  }
  const payload = JSON.stringify(request.body);
  if (apiKey.length >= MIN_SECRET_LENGTH && payload.includes(apiKey)) {
    throw publicError("Imagine request must not carry the API key in the body.", apiKey);
  }

  let lastStatus = 0;
  let sawStatus = false;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(request.url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: payload,
        redirect: "error",
      });
      await drain(response);
      if (response.ok) return;
      sawStatus = true;
      lastStatus = response.status;
    } catch (error) {
      if (error instanceof ImagineRequestError) throw error;
      sawStatus = false;
    }
    if (attempt === MAX_ATTEMPTS) {
      if (sawStatus) {
        throw publicError(`Imagine request failed with status ${lastStatus}.`, apiKey);
      }
      throw publicError("Imagine request failed before a response.", apiKey);
    }
  }
}

async function drain(response: Response): Promise<void> {
  try {
    await response.text();
  } catch {
    // The body can echo the key or the prompt. Drop it.
  }
}

class ImagineRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImagineRequestError";
  }
}

function publicError(message: string, apiKey: string): ImagineRequestError {
  const cleaned = redactSecrets(message, [], apiKey).trim();
  if (cleaned.length === 0) return new ImagineRequestError("Imagine request failed.");
  return new ImagineRequestError(cleaned);
}

function redactSecrets(line: string, prompts: readonly string[], apiKey: string | undefined): string {
  let safe = line;
  for (const prompt of prompts) {
    if (prompt.length >= MIN_SECRET_LENGTH && safe.includes(prompt)) {
      safe = safe.split(prompt).join("[prompt]");
    }
  }
  if (apiKey !== undefined && apiKey.length >= MIN_SECRET_LENGTH && safe.includes(apiKey)) {
    safe = safe.split(apiKey).join("[redacted]");
  }
  return safe;
}
