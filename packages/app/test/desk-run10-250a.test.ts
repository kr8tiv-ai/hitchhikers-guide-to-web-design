/**
 * Desk run 10 ended on the Guide Entry card with no next question id.
 * The driver then called .split on undefined. The brief page has the same
 * hole on source.questionId. Both stay explicit and do not throw.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { ThinkRequest, ThinkResult } from "@hitchhiker/engine";
import { loadTree, questionsToAsk, type BriefDeskView } from "@hitchhiker/engine";
import { renderCard, type CardState } from "../src/card.ts";
import { approveMain } from "../src/server/brief-page.ts";
import { startServer, type ServerHandle } from "../src/server/server.ts";
import { settleRaw } from "./settle-guide-job.ts";
import { removeTempDir } from "./remove-temp.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const treeFile = path.resolve(here, "../../../interview/tree.yaml");
const FORBIDDEN_PORTS = new Set([4175, 4188, 4210]);

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

function doneCard(html: string): string {
  const matched = /<article class="hh-qcard"[^>]*data-done="true"[^>]*>/.exec(html);
  assert.ok(matched?.[0], "finished card");
  return matched[0];
}

/** The run-10 reader used dataset.questionId, which is undefined when the attribute is omitted. */
function questionIdAttr(openTag: string): string | undefined {
  const matched = /data-question-id="([^"]*)"/.exec(openTag);
  return matched?.[1];
}

function desk(questionId: string): BriefDeskView {
  return {
    status: "pending",
    draft: {
      goal: "A calm page.",
      visitor: "A neighbor.",
      action: "Write.",
      offer: "Tea.",
      vibe: "Quiet.",
      references: "Kinfolk, Aesop, Patagonia, Linear.",
      exists: "No.",
      protected: "None.",
      motion: "Still.",
      limits: "None.",
      hosting: "Local.",
      maintainer: "The owner.",
      pages: "Home.",
      features: "A contact form.",
      cadence: "None.",
      languages: "English.",
      imagery: "Photos.",
      budget: "None.",
      session: "One hour.",
      logo: "None.",
      palette: "Ink.",
      coverage: "Covered.",
    },
    sources: [
      {
        key: "goal",
        heading: "Goal",
        questionId,
        answer: "Sell rye.",
        text: "The page sells rye.",
      },
    ],
    note: "",
    error: "",
    fallback: false,
    buildStarted: false,
    planApproved: false,
    phase: "Guide Entry",
    nextAction: "Approve the Site Brief.",
    markdown: "",
    revisit: null,
  };
}

function finishedCard(): CardState {
  return {
    question: null,
    draft: "",
    pushback: null,
    error: null,
    done: true,
    pending: false,
    brief: { status: "idle" },
  };
}

test("the brief page does not split a missing question id and shows no change form", () => {
  for (const questionId of [undefined as unknown as string, ""]) {
    const html = approveMain("tok", desk(questionId));
    assert.match(html, /The page sells rye/);
    assert.equal(html.includes("Change this answer"), false);
    assert.equal(html.includes('name="correction" value='), false);
  }
});

test("a finished card exposes a null question id beside the done flag", () => {
  const open = doneCard(renderCard(finishedCard()));
  const qid = questionIdAttr(open);
  assert.equal(typeof qid, "string");
  assert.doesNotThrow(() => qid?.split(/[a-z-]/));
  assert.equal(qid, "");
  assert.match(open, /data-done="true"/);
});

test("answering the last question returns an explicit null id and the brief step", async () => {
  const asked = questionsToAsk(loadTree(treeFile), "deep");
  const last = asked[asked.length - 1];
  assert.ok(last);
  const dir = mkdtempSync(path.join(tmpdir(), "hh-desk-run10-250a-"));
  const home = mkdtempSync(path.join(tmpdir(), "hh-home-250a-"));
  const previousHome = process.env.HH_PROJECT_HOME;
  const previousE2e = process.env.HH_E2E_PROJECT;
  process.env.HH_PROJECT_HOME = home;
  delete process.env.HH_E2E_PROJECT;
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  writeFileSync(
    path.join(dir, ".hitchhiker", "interview.json"),
    JSON.stringify(
      asked.slice(0, -1).map((question) => ({
        id: question.id,
        status: "ANSWERED",
        value: "Copper Kettle Bakery sells rye loaves on Saturday mornings.",
      })),
    ),
  );
  const guideThink = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
    if (req.task === "pushback-judge") return hit({ vague: false, quote: "", sharperChoice: "" });
    if (req.task === "guide-message") {
      return hit({
        message: "The questions are finished. What should the brief keep?",
        explanationLevel: "beginner",
        joke: false,
      });
    }
    if (req.task === "context-summary") return hit({ summary: "A neighbourhood bakery." });
    if (req.task === "mirror") {
      return hit({
        lines: ["The bakery sells rye.", "Saturday mornings are the busy hour.", "January is a closed week."],
      });
    }
    return hit({});
  };
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({
      projectDir: dir,
      open: false,
      guideThink: guideThink as never,
      spawn() {
        throw new Error("browser spawn was not expected");
      },
    });
    assert.equal(FORBIDDEN_PORTS.has(handle.port), false);
    const page = await raw(handle.port, "GET", "/");
    assert.equal(page.status, 200);
    assert.match(page.body, new RegExp(`data-question-id="${last.id}"`));
    const token = tokenFrom(page.body);
    const posted = await raw(
      handle.port,
      "POST",
      "/api/answer",
      { "content-type": "application/json", "x-hh-csrf": token },
      JSON.stringify({
        questionId: last.id,
        text: "Copper Kettle Bakery sells rye loaves on Saturday mornings and closes for two weeks in January.",
      }),
    );
    assert.equal(posted.status, 200);
    const settled = await settleRaw(handle.port, posted);
    assert.equal(settled.status, 200, settled.body.slice(0, 500));
    const payload = JSON.parse(settled.body) as {
      nextId?: string | null;
      done?: boolean;
      error?: string;
      session?: { done?: boolean; question?: { id?: string } | null; cardHtml?: string };
    };
    assert.equal(payload.error, undefined);
    assert.equal(payload.session?.done, true);
    assert.equal(payload.session?.question ?? null, null);
    assert.equal(Object.hasOwn(payload, "nextId"), true);
    assert.equal(payload.nextId, null);
    assert.equal(payload.done, true);
    const id = payload.nextId;
    if (typeof id === "string") id.split(/[a-z-]/);

    const homePage = await raw(handle.port, "GET", "/");
    assert.equal(homePage.status, 200);
    assert.match(homePage.body, /Guide Entry is next/);
    const open = doneCard(homePage.body);
    const qid = questionIdAttr(open);
    assert.equal(typeof qid, "string");
    assert.doesNotThrow(() => qid?.split(/[a-z-]/));
    assert.equal(qid, "");
    assert.match(open, /data-done="true"/);
    const cardHtml = payload.session?.cardHtml ?? "";
    const cardOpen = doneCard(cardHtml);
    assert.equal(questionIdAttr(cardOpen), "");

    const brief = await raw(handle.port, "GET", "/approve");
    assert.equal(brief.status, 200);
    assert.equal(brief.body.includes("Cannot read properties"), false);
    const briefJson = await raw(handle.port, "GET", "/api/brief");
    assert.equal(briefJson.status, 200);
    const briefPayload = JSON.parse(briefJson.body) as { status?: string };
    assert.equal(typeof briefPayload.status, "string");
  } finally {
    if (handle !== undefined) await handle.close();
    if (previousHome === undefined) delete process.env.HH_PROJECT_HOME;
    else process.env.HH_PROJECT_HOME = previousHome;
    if (previousE2e === undefined) delete process.env.HH_E2E_PROJECT;
    else process.env.HH_E2E_PROJECT = previousE2e;
    removeTempDir(dir);
    removeTempDir(home);
  }
});
