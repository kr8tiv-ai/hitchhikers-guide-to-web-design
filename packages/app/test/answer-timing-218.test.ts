/**
 * PERF-001. The desk publishes answer progress within 2s while the guide is still working.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { ThinkRequest, ThinkResult } from "@hitchhiker/engine";
import { startServer, type ServerHandle } from "../src/server/server.ts";
import { removeTempDir } from "./remove-temp.ts";

function hit<T>(value: T): ThinkResult<T> {
  return { value, raw: JSON.stringify(value), durationMs: 0, cassette: "hit" };
}

function raw(
  port: number,
  method: string,
  pathname: string,
  headers: Record<string, string> = {},
  body?: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path: pathname, method, headers: { host: `127.0.0.1:${port}`, ...headers } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function tokenFrom(html: string): string {
  const matched = /<meta name="hh-csrf" content="([0-9a-f]{64})"/.exec(html);
  assert.ok(matched?.[1]);
  return matched[1];
}

function watchProgress(port: number): { ready: Promise<void>; stages: () => string[]; stop: () => void } {
  const stages: string[] = [];
  let readyResolve: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    readyResolve = resolve;
  });
  const req = http.get({ hostname: "127.0.0.1", port, path: "/api/events", headers: { host: `127.0.0.1:${port}` } }, (res) => {
    res.setEncoding("utf8");
    let text = "";
    res.on("data", (chunk: string) => {
      text += chunk;
      if (text.includes(": connected")) readyResolve();
      stages.length = 0;
      for (const frame of text.split("\n\n")) {
        if (!frame.includes("event: answer-progress")) continue;
        const dataLine = frame.split("\n").find((line) => line.startsWith("data: "));
        if (dataLine === undefined) continue;
        try {
          const parsed: unknown = JSON.parse(dataLine.slice("data: ".length));
          if (parsed !== null && typeof parsed === "object" && "stage" in parsed && typeof parsed.stage === "string") {
            stages.push(parsed.stage);
          }
        } catch {
          // A partial frame is completed on the next chunk.
        }
      }
    });
  });
  req.on("error", () => undefined);
  return { ready, stages: () => [...stages], stop: () => req.destroy() };
}

test("answer progress is on the stream within 2s of a slow guide", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-timing-desk-"));
  const guideThink = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
    if (req.task === "pushback-judge" || req.task === "guide-message") {
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
    if (req.task === "pushback-judge") return hit({ vague: false, quote: "", sharperChoice: "" });
    if (req.task === "guide-message") {
      return hit({ message: "The next question is on the card.", explanationLevel: "beginner", joke: false });
    }
    if (req.task === "context-summary") return hit({ summary: "A shop site." });
    throw new Error(req.task);
  };
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({ projectDir: dir, open: false, guideThink: guideThink as never });
    const page = await raw(handle.port, "GET", "/");
    const token = tokenFrom(page.body);
    const watch = watchProgress(handle.port);
    try {
      await watch.ready;
      const started = Date.now();
      const pending = raw(
        handle.port,
        "POST",
        "/api/answer",
        { "content-type": "application/json", "x-hh-csrf": token },
        JSON.stringify({ questionId: "DP-0.1", text: "For myself." }),
      );
      let seen = false;
      while (!seen && Date.now() - started < 2000) {
        seen = watch.stages().includes("Checking your answer");
        if (!seen) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.equal(seen, true);
      assert.ok(Date.now() - started < 2000);
      const answered = await pending;
      assert.equal(answered.status, 200);
    } finally {
      watch.stop();
    }
  } finally {
    if (handle !== undefined) await handle.close();
    removeTempDir(dir);
  }
});
