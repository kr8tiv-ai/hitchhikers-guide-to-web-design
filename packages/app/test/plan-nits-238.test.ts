/**
 * Checkpoint 238 nits. The plan table counts its own rows.
 * A pause names a prompt that is still running.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { paintDrive, parseDriveRun } from "../src/client/drive.ts";
import { queueBodyHtml, type DriveRun } from "../src/drive-markup.ts";
import { approveMain } from "../src/server/brief-page.ts";
import type { BriefDeskView } from "@hitchhiker/engine";

const WHEN = "2026-10-19T00:00:00.000Z";

function desk(): BriefDeskView {
  return {
    status: "pending",
    draft: {
      goal: "A calm page.",
      visitor: "A neighbor.",
      action: "Write.",
      offer: "Tea.",
      vibe: "Quiet.",
      references: "Aesop.",
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
      coverage: "Covered 2 of 2 answers.",
    },
    markdown: "",
    sources: [],
    buildStarted: false,
    planApproved: false,
    phase: "Don't Panic",
    nextAction: "Approve the Site Brief.",
    error: "",
    note: "",
    fallback: false,
    revisit: null,
  };
}

test("the plan caption and the count line use the same rows", () => {
  const rows = [
    { id: "REQ-PAGE-home", label: "Home at /", promptIds: ["001"], covered: true },
    { id: "REQ-FEAT-contact-form", label: "contact form", promptIds: [], covered: false },
  ];
  const html = approveMain("token", desk(), "", { rows, message: "" }, "", "", "plan");
  const count = "Plan coverage: 1 of 2 pages and features covered";
  assert.equal(html.split(count).length - 1, 2);
  assert.match(html, new RegExp(`<caption>${count}</caption>`));
  assert.match(html, new RegExp(`data-plan-coverage-count>${count}<`));
});

function runningRun(): DriveRun {
  return {
    promptId: "001",
    status: "running",
    model: "grok-4.7-build-fast",
    effort: "xhigh",
    elapsedMs: 10,
    lastLines: [],
    filesWritten: [],
    reason: "",
  };
}

test("a running prompt under a pause is named, and a settled pause is not", () => {
  const running = queueBodyHtml(
    [
      { id: "001", kind: "build", status: "paused" },
      { id: "002", kind: "build", status: "paused" },
    ],
    runningRun(),
    { at: WHEN, after: "" },
  );
  assert.match(running, /Pause set\. 001 is still running and will finish first\./);
  assert.match(running, /data-action="resume-queue"/);
  assert.equal(running.includes("Paused before the first prompt."), false);
  assert.equal(running.includes("!"), false);

  const idle = queueBodyHtml([{ id: "001", kind: "build", status: "queued" }], null, { at: WHEN, after: "" });
  assert.match(idle, /Paused before the first prompt\./);
  assert.equal(idle.includes("still running"), false);

  const settled = queueBodyHtml(
    [
      { id: "001", kind: "build", status: "passed" },
      { id: "002", kind: "build", status: "paused" },
    ],
    { ...runningRun(), status: "passed", promptId: "001" },
    { at: WHEN, after: "001" },
  );
  assert.match(settled, /Paused after 001/);
  assert.equal(settled.includes("still running"), false);

  const interrupted = queueBodyHtml(
    [
      { id: "007", kind: "build", status: "passed" },
      { id: "008", kind: "build", status: "running" },
    ],
    { ...runningRun(), status: "interrupted", promptId: "008" },
    { at: WHEN, after: "007" },
  );
  assert.match(interrupted, /Paused after 007/);
  assert.equal(interrupted.includes("still running"), false);

  const during = queueBodyHtml(
    [
      { id: "063", kind: "build", status: "passed" },
      { id: "064", kind: "build", status: "running" },
    ],
    { ...runningRun(), promptId: "064" },
    { at: WHEN, after: "063" },
  );
  assert.match(during, /Pause set\. 064 is still running and will finish first\./);
  assert.equal(during.includes("Paused after 063"), false);

  const after = queueBodyHtml(
    [
      { id: "063", kind: "build", status: "passed" },
      { id: "064", kind: "build", status: "passed" },
    ],
    { ...runningRun(), status: "passed", promptId: "064" },
    { at: WHEN, after: "064" },
  );
  assert.match(after, /Paused after 064/);
  assert.equal(after.includes("still running"), false);
});

interface FakeEl {
  innerHTML: string;
  textContent: string | null;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

function element(): FakeEl {
  const attrs = new Map<string, string>();
  return {
    innerHTML: "",
    textContent: "",
    getAttribute(name) {
      return attrs.has(name) ? (attrs.get(name) ?? "") : null;
    },
    setAttribute(name, value) {
      attrs.set(name, value);
    },
    removeAttribute(name) {
      attrs.delete(name);
    },
  };
}

test("the drive refresh paints the running pause line", () => {
  const regions = new Map<string, ReturnType<typeof element>>();
  for (const selector of [
    "#drive-queue-body",
    "#drive-progress",
    "[data-cost-line]",
    "#drive-escalations",
    "#drive-verdicts",
    "#drive-watchdog",
    "#drive-pause",
  ]) {
    regions.set(selector, element());
  }
  const document = {
    querySelector(selector: string) {
      return regions.get(selector) ?? null;
    },
    documentElement: { dataset: {} },
  };
  paintDrive(
    document as never,
    [
      { id: "001", kind: "build", status: "paused" },
      { id: "002", kind: "build", status: "queued" },
    ],
    runningRun(),
    { at: WHEN, after: "" },
  );
  assert.match(regions.get("#drive-queue-body")?.innerHTML ?? "", /Pause set\. 001 is still running/);
});

test("a progress refresh keeps a dead run from looking live", () => {
  const payload = {
    promptId: "003",
    status: "running",
    model: "grok-4.7-build-fast",
    effort: "xhigh",
    elapsedMs: 10,
    lastLines: [],
    filesWritten: [],
    reason: "",
    recovery: "",
    paused: false,
    escalation: "",
  };
  const dead = parseDriveRun({ run: { ...payload, live: false } });
  assert.equal(dead?.live, false);
  const held = queueBodyHtml(
    [
      { id: "002", kind: "build", status: "passed" },
      { id: "003", kind: "build", status: "running" },
    ],
    dead,
    { at: WHEN, after: "002" },
  );
  assert.match(held, /Paused after 002/);
  assert.equal(held.includes("still running"), false);

  const omitted = parseDriveRun({ run: { ...payload, promptId: "064" } });
  assert.equal(omitted?.live, undefined);
  const during = queueBodyHtml(
    [
      { id: "063", kind: "build", status: "passed" },
      { id: "064", kind: "build", status: "running" },
    ],
    omitted,
    { at: WHEN, after: "063" },
  );
  assert.match(during, /Pause set\. 064 is still running and will finish first\./);
});
