/**
 * 250d. The plan page and the drive name a design library that failed to load.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { ThinkRequest, ThinkResult } from "@hitchhiker/engine";
import { artDirectionNoteHtml } from "../src/art-direction-note.ts";
import { approveMain } from "../src/server/brief-page.ts";
import { startServer, type ServerHandle } from "../src/server/server.ts";
import type { BriefDeskView } from "@hitchhiker/engine";

const NOTE = "No art direction: the design library failed to load (see library-error.txt).";
const LINE = "The site helps a visitor book a visit.";

function desk(): BriefDeskView {
  return {
    status: "pending",
    draft: {
      goal: LINE,
      visitor: LINE,
      action: LINE,
      offer: LINE,
      vibe: LINE,
      references: LINE,
      exists: LINE,
      protected: LINE,
      motion: LINE,
      limits: LINE,
      hosting: LINE,
      maintainer: LINE,
      pages: "Pages: Home.",
      features: LINE,
      cadence: LINE,
      languages: LINE,
      imagery: LINE,
      budget: LINE,
      session: LINE,
      logo: LINE,
      palette: LINE,
      coverage: LINE,
    },
    markdown: "",
    sources: [],
    buildStarted: false,
    planApproved: false,
    phase: "Don't Panic",
    nextAction: "Approve the plan.",
    error: "",
    note: "",
    fallback: false,
    revisit: null,
  };
}

function raw(port: number, pathname: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path: pathname, method: "GET", headers: { host: `127.0.0.1:${port}` } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("the plan markup flags a missing art direction and a quiet plan does not", () => {
  const flagged = approveMain("token", desk(), "", undefined, "", "", "plan", "", "none");
  assert.match(flagged, /data-art-direction="none"/);
  assert.match(flagged, /No art direction: the design library failed to load \(see library-error\.txt\)\./);
  const quiet = approveMain("token", desk(), "", undefined, "", "", "plan");
  assert.equal(quiet.includes("data-art-direction"), false);
  assert.equal(quiet.includes(NOTE), false);
  assert.equal(artDirectionNoteHtml("none").includes('data-art-direction="none"'), true);
  assert.equal(artDirectionNoteHtml(""), "");
});

test("the approve page and the drive show the design-library failure", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-liberr-desk-250d-"));
  const hitch = path.join(dir, ".hitchhiker");
  mkdirSync(path.join(hitch, "prompts"), { recursive: true });
  mkdirSync(path.join(dir, "interview"), { recursive: true });
  writeFileSync(
    path.join(dir, "interview", "tree.yaml"),
    `questions:
  - id: DP-2.1
    module: the-question
    depth: [express, standard, deep]
    ask: "What should the site do?"
    why: "The job of the site."
    input: [text]
    skip_default: "Site why not stated."
    writes:
      - "SITE-BRIEF.md"
`,
  );
  const draft = {
    goal: LINE,
    visitor: LINE,
    action: LINE,
    offer: LINE,
    vibe: LINE,
    references: LINE,
    exists: LINE,
    protected: LINE,
    motion: LINE,
    limits: LINE,
    hosting: LINE,
    pages: "Pages: Home.",
    features: LINE,
    coverage: LINE,
  };
  writeFileSync(path.join(hitch, "brief-pending.json"), `${JSON.stringify({ status: "pending", draft, buildStarted: false, error: "" })}\n`);
  writeFileSync(path.join(hitch, "prompts", "001.md"), "---\nid: 001\ntitle: Home\n---\n\nRequirements: REQ-PAGE-home\n");
  writeFileSync(path.join(hitch, "library-error.txt"), "Expected property name or '}' in JSON at position 1\n");
  const guideThink = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
    throw new Error(req.task);
  };
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({ projectDir: dir, open: false, guideThink: guideThink as never });
    const approve = await raw(handle.port, "/approve");
    assert.equal(approve.status, 200);
    assert.match(approve.body, /data-art-direction="none"/);
    assert.match(approve.body, /No art direction: the design library failed to load \(see library-error\.txt\)\./);
    const drive = await raw(handle.port, "/hh-dashboard");
    assert.equal(drive.status, 200);
    assert.match(drive.body, /data-art-direction="none"/);
    assert.match(drive.body, /No art direction: the design library failed to load \(see library-error\.txt\)\./);
  } finally {
    if (handle !== undefined) await handle.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
