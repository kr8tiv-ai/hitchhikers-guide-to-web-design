/**
 * PERF-001. One answer publishes Checking, Writing, then Saving on the event stream.
 * A skip publishes none of those stages.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ANSWER_PROGRESS } from "@hitchhiker/engine";
import { startServer, type ServerHandle } from "../src/server/server.ts";
import { settleRaw } from "./settle-guide-job.ts";
import { removeTempDir } from "./remove-temp.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

function tempProject(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-progress-desk-"));
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
      {
        hostname: "127.0.0.1",
        port,
        path: pathname,
        method,
        headers: { host: `127.0.0.1:${port}`, ...headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
        });
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
  const req = http.get(
    {
      hostname: "127.0.0.1",
      port,
      path: "/api/events",
      headers: { host: `127.0.0.1:${port}` },
    },
    (res) => {
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
    },
  );
  req.on("error", () => undefined);
  return {
    ready,
    stages: () => [...stages],
    stop() {
      req.destroy();
    },
  };
}

async function waitFor(ready: () => boolean, ms: number): Promise<void> {
  const start = Date.now();
  while (!ready()) {
    if (Date.now() - start > ms) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

test("one answer publishes Checking, Writing, then Saving, and a skip publishes none", async () => {
  const dir = tempProject();
  let handle: ServerHandle | undefined;
  const deskSource = readFileSync(path.resolve(here, "../src/client/desk.ts"), "utf8");
  for (const stage of ANSWER_PROGRESS) assert.match(deskSource, new RegExp(stage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  try {
    handle = await startServer({
      projectDir: dir,
      spawn() {
        throw new Error("browser spawn was not expected");
      },
    });
    const page = await raw(handle.port, "GET", "/");
    const token = tokenFrom(page.body);
    const watch = watchProgress(handle.port);
    try {
      await watch.ready;
      const answered = await raw(
        handle.port,
        "POST",
        "/api/answer",
        { "content-type": "application/json", "x-hh-csrf": token },
        JSON.stringify({ questionId: "DP-0.1", text: "For myself." }),
      );
      assert.equal(answered.status, 200);
      const settled = await settleRaw(handle.port, answered);
      const body = JSON.parse(settled.body) as { session?: { question?: { id?: string } } };
      assert.equal(body.session?.question?.id, "DP-0.2");
      await waitFor(() => watch.stages().length >= ANSWER_PROGRESS.length, 2_000);
      assert.deepEqual(watch.stages(), [...ANSWER_PROGRESS]);
      const before = watch.stages().length;
      const skipped = await raw(
        handle.port,
        "POST",
        "/api/skip",
        { "content-type": "application/json", "x-hh-csrf": token },
        JSON.stringify({ questionId: "DP-0.2" }),
      );
      assert.equal(skipped.status, 200);
      await settleRaw(handle.port, skipped);
      await waitFor(() => watch.stages().length > before, 300);
      assert.equal(watch.stages().length, before);
    } finally {
      watch.stop();
    }
  } finally {
    if (handle !== undefined) await handle.close();
    removeTempDir(dir);
  }
});
