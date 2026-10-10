import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { renderCard } from "../src/card.ts";
import { replaceEmptyCard } from "../src/client/desk.ts";
import { DRIVE_EMPTY_COPY } from "../src/drive-markup.ts";
import { renderEmptyInterview, START_INTERVIEW_LABEL } from "../src/server/card.ts";
import { startServer, type ServerHandle } from "../src/server/server.ts";

/**
 * Layout note, no new CSS. 375 is a single column: shell padding is the
 * base rule, hh-approval wraps, and buttons stay at least 44px.
 * 1440 is past the 1100px query: the desk read column is 44rem and Drive
 * splits into a main column plus a rail. Cream, rust, and the wordmark
 * are unchanged. This file checks rendered HTML, not a screenshot.
 */

const GATES = ["pause", "approve", "elevate", "deploy"] as const;
const DISCLAIMER = "xAI's agent dashboard";

function tempProject(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-empty-plates-"));
}

async function withDesk(run: (handle: ServerHandle, dir: string) => Promise<void>): Promise<void> {
  const dir = tempProject();
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({
      projectDir: dir,
      open: false,
      turnHandler: async () => ({ next: null, events: [] }),
      spawn() {
        throw new Error("browser spawn was not expected");
      },
    });
    await run(handle, dir);
  } finally {
    if (handle !== undefined) await handle.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function primaryHrefs(html: string): string[] {
  const hrefs: string[] = [];
  for (const match of html.matchAll(/<a\b[^>]*class="[^"]*\bhh-btn--primary\b[^"]*"[^>]*>/g)) {
    const href = /href="([^"]*)"/.exec(match[0]);
    hrefs.push(href?.[1] ?? "");
  }
  return hrefs;
}

function gateTag(html: string, action: string): string {
  const match = new RegExp(`<(?:button|a)\\b[^>]*data-action="${action}"[^>]*>`).exec(html);
  assert.ok(match, action);
  return match[0];
}

function isLocked(tag: string): boolean {
  return /\sdisabled(?:\s|>)/.test(tag) && /aria-disabled="true"/.test(tag);
}

test("each empty plate has one primary action and the brand plate keeps its question link", async () => {
  await withDesk(async (handle) => {
    const brand = await (await fetch(new URL("/brand", handle.url))).text();
    const approve = await (await fetch(new URL("/approve", handle.url))).text();
    const drive = await (await fetch(new URL("/hh-dashboard", handle.url))).text();

    assert.deepEqual(primaryHrefs(brand), ["/?question=DP-0.1"]);
    assert.match(brand, /<h1 class="hh-specimen__display">No kit on the desk<\/h1>/);
    assert.match(brand, /Approve the brief to print the kit/);
    assert.equal(brand.includes("The kit is not printed yet"), false);

    assert.deepEqual(primaryHrefs(approve), ["/?question=DP-0.1"]);
    assert.match(approve, /Answer the open question/);
    assert.match(approve, /Nothing is waiting for a yes/);
    assert.equal(approve.includes(">Approve<"), false);
    assert.equal(approve.includes(">Redo<"), false);

    assert.deepEqual(primaryHrefs(drive), ["/approve"]);
    assert.match(drive, new RegExp(DRIVE_EMPTY_COPY.replaceAll(".", "\\.")));
    assert.equal(drive.includes(DISCLAIMER), false);
    assert.equal(drive.includes("No drive queued."), false);
    for (const action of GATES) {
      assert.equal(isLocked(gateTag(drive, action)), true, action);
    }
    assert.equal(drive.replace("<!DOCTYPE html>", "").includes("!"), false);
  });
});

test("a queue on disk enables the four gates and still omits the disclaimer", async () => {
  await withDesk(async (handle, dir) => {
    const folder = path.join(dir, ".hitchhiker");
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      path.join(folder, "queue.json"),
      `${JSON.stringify({
        items: [{ id: "001", kind: "build", status: "queued" }],
      })}\n`,
      "utf8",
    );
    const drive = await (await fetch(new URL("/hh-dashboard", handle.url))).text();
    assert.equal(drive.includes(DRIVE_EMPTY_COPY), false);
    assert.equal(drive.includes(DISCLAIMER), false);
    assert.equal(primaryHrefs(drive).length, 0);
    for (const action of GATES) {
      assert.equal(isLocked(gateTag(drive, action)), false, action);
    }
    assert.match(drive, /href="\/approve"/);
    assert.match(drive, /data-id="001"/);
  });
});

test("a fresh desk shows Start the interview on the first question route", async () => {
  await withDesk(async (handle) => {
    const html = await (await fetch(handle.url)).text();
    assert.match(html, new RegExp(`>${START_INTERVIEW_LABEL}</a>`));
    assert.match(html, /class="hh-btn hh-btn--primary" href="\/\?question=DP-0\.1"/);
    assert.equal(html.includes("No question yet"), false);
    assert.match(html, /Is this site for you, or for a client\?/);
    const question = /data-region="question"[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
    assert.equal(question.includes(START_INTERVIEW_LABEL), false);
  });
});

test("an empty card renders one button to the first question", () => {
  const empty = renderCard({
    question: null,
    draft: "",
    pushback: null,
    error: null,
    done: false,
    pending: false,
  });
  assert.match(empty, /No question yet\./);
  const replaced = replaceEmptyCard(empty, null);
  assert.equal(replaced.includes("No question yet"), false);
  assert.equal(primaryHrefs(replaced).length, 1);
  assert.match(replaced, /href="\/\?question=DP-0\.1"/);
  assert.match(replaced, new RegExp(`>${START_INTERVIEW_LABEL}</a>`));
  const server = renderEmptyInterview("DP-0.1");
  assert.match(server, /href="\/\?question=DP-0\.1"/);
  assert.equal(primaryHrefs(server).length, 1);
  const asked = renderCard({
    question: {
      id: "DP-0.1",
      module: "ford",
      depth: ["deep"],
      ask: "Is this site for you, or for a client?",
      why: "The answer picks the brief.",
      input: ["text"],
      skipDefault: "For myself.",
      writes: [],
    },
    draft: "",
    pushback: null,
    error: null,
    done: false,
    pending: false,
  });
  assert.equal(replaceEmptyCard(asked, "DP-0.1"), asked);
});
