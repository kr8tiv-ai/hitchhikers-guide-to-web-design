/**
 * BUG-045 and DP-4.3. A card confirms what was already said.
 * The headline is that confirmation, not the tree question.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { gateQuestion, type SessionState } from "../src/guide/session-state.ts";
import { loadTree, type Question } from "../src/tree.ts";

const treeFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "interview", "tree.yaml");
const LOGO =
  "Logo file: paradise-found-logo.png. Yes: logo, mark and hero photo attached. No fonts yet. Colors from the hero photo: jungle green, sunset gold, ocean blue, plus soft sand and a near-black green.";

function byId(id: string): Question {
  const found = loadTree(treeFile).find((question) => question.id === id);
  assert.ok(found, id);
  return found;
}

function state(text: string, extra: Partial<SessionState> = {}): SessionState {
  return {
    answers: [{ id: "DP-0.4", text, assumed: false }],
    uploads: extra.uploads ?? [],
    decided: extra.decided ?? [],
  };
}

test("DP-1.1 confirms a logo already described, and only asks when nothing mentions one", () => {
  const question = byId("DP-1.1");
  const named = gateQuestion(question, state(LOGO));
  assert.equal(named.action, "confirm");
  assert.equal(
    named.ask,
    "You said you have a logo (paradise-found-logo.png). Drop the file here, or tell us if you want a variant.",
  );
  assert.equal(named.ask.includes("Do you have a logo?"), false);

  const attached = gateQuestion(
    question,
    state(LOGO, {
      uploads: [
        {
          safeName: "hh-aaaaaaaa-paradise-found-logo.png",
          originalName: "paradise-found-logo.png",
          questionId: "DP-0.4",
          role: "logo",
        },
      ],
      decided: [{ topic: "logo", sourceId: "DP-0.4", value: "paradise-found-logo.png" }],
    }),
  );
  assert.equal(attached.action, "confirm");
  assert.equal(attached.ask, "Using the logo you gave earlier (paradise-found-logo.png). Change?");

  const silent = gateQuestion(question, state("No fonts yet. We will choose colors later."));
  assert.equal(silent.action, "ask");
  assert.equal(silent.ask, "Do you have a logo?");

  const colors = gateQuestion(byId("DP-1.2"), state(LOGO));
  assert.equal(colors.action, "confirm");
  assert.match(colors.ask, /^You can keep the five from the hero \(/);
  assert.match(colors.ask, /Change\?$/);
});

test("DP-4.3 confirms the blog when DP-3.5 already covered it", () => {
  const question = byId("DP-4.3");
  const covered = gateQuestion(question, {
    answers: [{ id: "DP-3.5", text: "No blog. We will not publish posts.", assumed: false }],
    uploads: [],
    decided: [],
  });
  assert.equal(covered.action, "confirm");
  assert.equal(
    covered.ask,
    "You already covered the blog (No blog. We will not publish posts.). Keep that, or change it?",
  );
  const open = gateQuestion(question, {
    answers: [{ id: "DP-3.5", text: "Skip the writing for now.", assumed: false }],
    uploads: [],
    decided: [],
  });
  assert.equal(open.action, "ask");
  assert.match(open.ask, /blog/i);
});
