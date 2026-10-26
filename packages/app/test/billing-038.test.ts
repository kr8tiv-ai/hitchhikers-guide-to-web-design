/**
 * BUG-038: a Guide 402 keeps the answer and shows the top-up sentence.
 * Drive renders that sentence, the escalation, and the paused queue.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { BILLING_TOP_UP, GrokBillingError, type ThinkRequest, type ThinkResult } from "@hitchhiker/engine";
import { BILLING_CARD, billingCardError } from "../src/client/desk.ts";
import { renderDriveDocument } from "../src/drive-markup.ts";
import { startServer, type ServerHandle } from "../src/server/server.ts";
import { settleRaw } from "./settle-guide-job.ts";
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

test("the card sentence matches the engine top-up line", () => {
  assert.equal(BILLING_CARD, BILLING_TOP_UP);
  assert.equal(billingCardError({ transcriptHtml: `<p>${BILLING_CARD}</p>`, statusHtml: "" }, null), BILLING_CARD);
  assert.equal(billingCardError({ transcriptHtml: "", statusHtml: "Ready." }, null), null);
  assert.equal(billingCardError({ transcriptHtml: BILLING_CARD, statusHtml: "" }, "A different error."), "A different error.");
});

test("drive shows the top-up, the escalation, and a paused queue", () => {
  const html = renderDriveDocument(
    [
      { id: "003", kind: "build", status: "failed" },
      { id: "004", kind: "build", status: "paused" },
    ],
    "Prompts 1 of 2.",
    {
      run: {
        promptId: "003",
        status: "failed",
        model: "grok-4.7-build-fast",
        effort: "xhigh",
        elapsedMs: 10,
        lastLines: ['"costUsdTicks": 9514179200 } }, "numTurns": 33 } }'],
        filesWritten: [],
        reason: BILLING_TOP_UP,
        paused: true,
        escalation: BILLING_TOP_UP,
      },
    },
  );
  assert.match(html, /Your Grok Build usage balance is used up/);
  assert.match(html, /data-escalation="billing"/);
  assert.match(html, /data-queue-state="paused"/);
  assert.match(html, /The queue is paused/);
  assert.match(html, /data-status="failed"/);
  assert.match(html, /data-status="paused"/);
  assert.match(html, /Retry/);
  assert.equal(html.includes("No escalations"), false);
  assert.equal(html.includes("exited with code 1"), false);
  assert.equal(html.includes("costUsdTicks"), false);
  assert.equal(html.includes("Marvin has nothing to complain about"), false);
});

test("a 402 on the judge keeps the question and the typed answer", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-bill-038-"));
  const guideThink = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
    if (req.task === "pushback-judge" || req.task === "guide-message" || req.task === "suggest") {
      throw new GrokBillingError();
    }
    if (req.task === "context-summary") return hit({ summary: "A site for one person." });
    throw new GrokBillingError();
  };
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({ projectDir: dir, open: false, guideThink });
    const page = await raw(handle.port, "GET", "/");
    const token = tokenFrom(page.body);
    const posted = await raw(
      handle.port,
      "POST",
      "/api/answer",
      { "content-type": "application/json", "x-hh-csrf": token },
      JSON.stringify({ questionId: "DP-0.1", text: "For myself." }),
    );
    const answered = await settleRaw(handle.port, posted);
    assert.equal(answered.status, 500);
    const body = JSON.parse(answered.body) as { error?: string };
    assert.equal(body.error, BILLING_TOP_UP);
    assert.equal(answered.body.includes("The Guide hit an error"), false);
    assert.equal(answered.body.includes("couldn't finish checking"), false);
    assert.equal(answered.body.includes("exited with code"), false);
    const again = await raw(handle.port, "GET", "/");
    assert.match(again.body, /data-question-id="DP-0\.1"/);
    const draft = readFileSync(path.join(dir, ".hitchhiker", "drafts.json"), "utf8");
    assert.match(draft, /For myself\./);
  } finally {
    if (handle !== undefined) await handle.close();
    removeTempDir(dir);
  }
});

test("a 402 after the answer is stored still shows the top-up sentence", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-bill-038b-"));
  const guideThink = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
    if (req.task === "guide-message") throw new GrokBillingError();
    if (req.task === "pushback-judge") {
      return hit({ vague: false, quote: "myself", sharperChoice: "Who is it for?" });
    }
    if (req.task === "context-summary") return hit({ summary: "A site for one person." });
    return hit({ message: "Noted.", explanationLevel: "beginner", joke: false });
  };
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({ projectDir: dir, open: false, guideThink });
    const page = await raw(handle.port, "GET", "/");
    const token = tokenFrom(page.body);
    const posted = await raw(
      handle.port,
      "POST",
      "/api/answer",
      { "content-type": "application/json", "x-hh-csrf": token },
      JSON.stringify({ questionId: "DP-0.1", text: "For myself." }),
    );
    const answered = await settleRaw(handle.port, posted);
    assert.equal(answered.status, 200);
    assert.match(answered.body, /Your Grok Build usage balance is used up/);
    assert.equal(answered.body.includes("Saved. The Guide's next question failed"), false);
    assert.equal(answered.body.includes("couldn't finish checking"), false);
    const saved = readFileSync(path.join(dir, ".hitchhiker", "interview.json"), "utf8");
    assert.match(saved, /For myself\./);
  } finally {
    if (handle !== undefined) await handle.close();
    removeTempDir(dir);
  }
});
