/**
 * Turn posts return a job id. Tests that check the saved answer wait for that job.
 */
import http from "node:http";

/** A saturated `pnpm -r test` can stall one turn well past 20s. 60s still fails a hung job. */
const JOB_DEADLINE_MS = 60_000;
const POLL_TIMEOUT_MS = 10_000;

export async function settleRaw(
  port: number,
  result: { status: number; body: string; type?: string },
  deadlineMs = JOB_DEADLINE_MS,
): Promise<{ status: number; body: string; type: string }> {
  const type = result.type ?? "";
  const jobId = runningJobId(result.status, result.body);
  if (jobId === null) return { status: result.status, body: result.body, type };
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    let next: { status: number; body: string };
    try {
      next = await httpGet(port, `/api/guide-job/${jobId}`, Math.min(POLL_TIMEOUT_MS, remaining));
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 15));
      continue;
    }
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(next.body);
    } catch {
      parsed = null;
    }
    if (isRecord(parsed) && parsed.status !== "running") {
      const httpStatus = typeof parsed.httpStatus === "number" ? parsed.httpStatus : next.status;
      return { status: httpStatus, body: next.body, type: "application/json; charset=utf-8" };
    }
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error("The Guide job did not finish.");
}

export async function settleResponse(response: Response): Promise<{ status: number; text: string }> {
  const text = await response.text();
  const port = Number(new URL(response.url).port);
  const settled = await settleRaw(port, {
    status: response.status,
    body: text,
    type: response.headers.get("content-type") ?? "",
  });
  return { status: settled.status, text: settled.body };
}

function runningJobId(status: number, body: string): string | null {
  if (status >= 400) return null;
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || typeof parsed.jobId !== "string" || parsed.status !== "running") return null;
  if (parsed.session !== undefined) return null;
  return parsed.jobId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function httpGet(port: number, pathname: string, timeoutMs: number): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname,
        method: "GET",
        headers: { host: `127.0.0.1:${port}` },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
        });
      },
    );
    req.setTimeout(Math.max(1, timeoutMs), () => {
      req.destroy(new Error("The Guide job poll timed out."));
    });
    req.on("error", reject);
    req.end();
  });
}
