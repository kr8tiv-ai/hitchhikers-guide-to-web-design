/**
 * Prompt 209 session state. A logo on file is named. A file from another job is not.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { callCwd } from "../src/guide/interview-call.ts";
import {
  choiceAllowed,
  filterGuideText,
  gateQuestion,
  loadSessionState,
  projectMentionsQuotes,
  sessionBlock,
} from "../src/guide/session-state.ts";
import { loadTree, type Question } from "../src/tree.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const treeFile = path.join(repoRoot, "interview", "tree.yaml");

function byId(all: readonly Question[], id: string): Question {
  const found = all.find((question) => question.id === id);
  assert.ok(found, id);
  return found;
}

test("a DP-0.4 logo upload is the logo, and DP-1.1 confirms that file", () => {
  const all = loadTree(treeFile);
  const dir = mkdtempSync(path.join(tmpdir(), "hh-209-logo-"));
  try {
    const folder = path.join(dir, ".hitchhiker", "uploads", "DP-0.4");
    mkdirSync(path.join(dir, ".hitchhiker", "brand"), { recursive: true });
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      path.join(folder, "manifest.json"),
      JSON.stringify([
        { storedName: "pf-06-script-found.png", originalName: "pf-06-script-found.png" },
        { storedName: "C1-1.jpg", originalName: "C1-1.jpg" },
      ]),
      "utf8",
    );
    writeFileSync(
      path.join(dir, ".hitchhiker", "brand", "logo-intake.json"),
      JSON.stringify({ safeName: "DP-0.4/C1-1.jpg", questionId: "DP-0.4" }),
      "utf8",
    );
    const state = loadSessionState(dir, all);
    const logo = state.uploads.find((file) => file.originalName === "C1-1.jpg");
    assert.ok(logo);
    assert.equal(logo.role, "logo");
    assert.equal(logo.questionId, "DP-0.4");
    assert.equal(logo.safeName, "DP-0.4/C1-1.jpg");
    const gate = gateQuestion(byId(all, "DP-1.1"), state, all);
    assert.equal(gate.action, "confirm");
    assert.equal(gate.ask, "Using the logo you gave earlier (C1-1.jpg). Change?");
    const block = sessionBlock(state);
    assert.match(block, /C1-1\.jpg/);
    assert.equal(block.includes("evolvelogo.webp"), false);
    assert.equal(filterGuideText("Use the Evolve logo (evolvelogo.webp) for this quote?", state, false), null);
    assert.equal(filterGuideText("Use the logo you gave earlier (C1-1.jpg). Change?", state, false) !== null, true);
    assert.equal(
      choiceAllowed("Do you have a logo?", state, all, false),
      false,
    );
    assert.equal(projectMentionsQuotes(state), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("quote, estimate, and invoice stay out unless the project is about that work", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-209-quote-"));
  try {
    const state = loadSessionState(dir);
    assert.equal(filterGuideText("Send the quote today.", state, false), null);
    assert.equal(filterGuideText("The estimate is ready.", state, false), null);
    assert.equal(filterGuideText("Attach the invoice.", state, false), null);
    assert.equal(filterGuideText("Send the quote today.", state, true), "Send the quote today.");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("interview calls use the project directory as cwd", () => {
  assert.equal(callCwd("pushback-judge", "/proj", "/scratch"), "/proj");
  assert.equal(callCwd("suggest", "/proj", "/scratch"), "/proj");
  assert.equal(callCwd("guide-message", "/proj", "/scratch"), "/proj");
  assert.equal(callCwd("plan", "/proj", "/scratch"), "/scratch");
});
