import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  ApprovalError,
  initialApprovalState,
  reduceApproval,
  renderApproval,
  type ApprovalState,
} from "../src/approval.ts";

const THREE = ["Menu", "Origin", "Visit"];
const TIERS = ["Towel", "Cup of Tea", "Heart of Gold"];

function listItems(html: string): string[] {
  return html.match(/<li\b[^>]*>[\s\S]*?<\/li>/g) ?? [];
}

function driveButton(html: string): string {
  const match = html.match(/<button\b[^>]*data-approve-drive="[^"]+"[^>]*>[\s\S]*?<\/button>/);
  assert.ok(match);
  return match[0];
}

function copyWithoutDoctype(html: string): string {
  return html.replace(/<!DOCTYPE html>/gi, "");
}

test("three titles render three list items and the drive button stays at no", () => {
  const html = renderApproval({ titles: THREE, tokens: 12400, prdTitle: "Northwind Studio" });
  const items = listItems(html);
  assert.equal(items.length, 3);
  assert.match(items[0] ?? "", /Menu/);
  assert.match(items[1] ?? "", /Origin/);
  assert.match(items[2] ?? "", /Visit/);
  assert.match(html, /<h1 class="hh-headline" id="prd-title">Northwind Studio<\/h1>/);
  assert.match(html, /Token estimate: 12400/);
  assert.match(html, /data-token-estimate="12400"/);
  const button = driveButton(html);
  assert.match(button, /type="button"/);
  assert.match(button, /data-approve-drive="no"/);
  assert.match(button, />Approve and allow the drive<\/button>/);
  assert.equal(html.includes("data-approve-drive=\"yes\""), false);
  assert.equal(/<input\b/i.test(html), false);
  assert.equal(/\bchecked\b/i.test(html), false);
  assert.equal(copyWithoutDoctype(html).includes("!"), false);
  assert.equal(html.includes("\u2014"), false);
  assert.equal(html.includes("$"), false);
  assert.equal(/\bUSD\b/.test(html), false);
  assert.match(html, /Record yes for PRD\.md/);
  assert.match(html, /Record yes for CONTEXT\.md/);
  assert.match(html, /Record yes for the prompt package/);
  assert.equal(html.match(/data-approved="no"/g)?.length, 3);
});

test("titles are escaped and tiers are an attribute plus visible text", () => {
  const html = renderApproval({
    titles: [`Before <script>alert(1)</script> & after`, `Quote "x"`],
    tokens: 3,
    prdTitle: `Studio <b>North</b>`,
    tiers: [`Tea "time"`, "Gargle Blaster"],
  });
  assert.equal(listItems(html).length, 2);
  assert.equal(html.includes("<script>"), false);
  assert.match(html, /Before &lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; after/);
  assert.match(html, /data-tier="Tea &quot;time&quot;"/);
  assert.match(html, /<b>Tea &quot;time&quot;<\/b>/);
  assert.match(html, /data-tier="Gargle Blaster"/);
  assert.match(html, /<b>Gargle Blaster<\/b>/);
  assert.match(html, /Studio &lt;b&gt;North&lt;\/b&gt;/);
  assert.equal(copyWithoutDoctype(html).includes("!"), false);
});

test("a tier list that does not match the titles throws", () => {
  assert.throws(
    () => renderApproval({ titles: THREE, tokens: 1, tiers: ["Towel"] }),
    (error: unknown) => error instanceof ApprovalError,
  );
});

test("the reducer keeps the button at no until all three yeses and an allow", () => {
  const start = initialApprovalState();
  const snapshot: ApprovalState = { ...start };
  const denied = reduceApproval(start, { type: "allow" });
  assert.equal(denied, start);
  assert.deepEqual(start, snapshot);

  let state = start;
  state = reduceApproval(state, { type: "record", gate: "prd" });
  state = reduceApproval(state, { type: "allow" });
  assert.equal(state.drive, "no");
  assert.equal(state.prd, true);
  assert.equal(start.prd, false);

  state = reduceApproval(state, { type: "record", gate: "context" });
  state = reduceApproval(state, { type: "record", gate: "promptPackage" });
  const waiting = renderApproval({ titles: THREE, tokens: 8, tiers: TIERS, prdTitle: "Northwind", state });
  assert.match(driveButton(waiting), /data-approve-drive="no"/);
  assert.match(waiting, /data-tier="Towel"/);
  assert.match(waiting, /data-tier="Cup of Tea"/);
  assert.match(waiting, /data-tier="Heart of Gold"/);

  const allowed = reduceApproval(state, { type: "allow" });
  assert.equal(allowed.drive, "yes");
  assert.equal(state.drive, "no");
  const html = renderApproval({ titles: THREE, tokens: 8, tiers: TIERS, prdTitle: "Northwind", state: allowed });
  const button = driveButton(html);
  assert.match(button, /data-approve-drive="yes"/);
  assert.match(button, />Approve and allow the drive<\/button>/);
  assert.match(html, /Drive allowed/);
  assert.equal(/\bchecked\b/i.test(html), false);
  assert.equal(html.includes("$"), false);
});

test("an empty title list cannot render a yes", () => {
  let state = initialApprovalState();
  state = reduceApproval(state, { type: "record", gate: "prd" });
  state = reduceApproval(state, { type: "record", gate: "context" });
  state = reduceApproval(state, { type: "record", gate: "promptPackage" });
  state = reduceApproval(state, { type: "allow" });
  assert.equal(state.drive, "yes");
  const html = renderApproval({ titles: [], tokens: 0, state });
  assert.equal(listItems(html).length, 0);
  assert.match(html, /No prompts on this list/);
  assert.match(driveButton(html), /data-approve-drive="no"/);
  assert.match(html, /Token estimate: 0/);
});

test("a negative token estimate throws and an unknown gate throws", () => {
  assert.throws(
    () => renderApproval({ titles: ["Menu"], tokens: -1 }),
    (error: unknown) => error instanceof ApprovalError,
  );
  assert.throws(
    () => reduceApproval(initialApprovalState(), { type: "record", gate: "logo" as "prd" }),
    (error: unknown) => error instanceof ApprovalError,
  );
});

test("the approval screen does not spawn a process or call a model", () => {
  const source = readFileSync(new URL("../src/approval.ts", import.meta.url), "utf8");
  assert.equal(source.includes("child_process"), false);
  assert.equal(source.includes("spawn("), false);
  assert.equal(source.includes("grok"), false);
  assert.match(source, /export function renderApproval/);
  assert.match(source, /export function reduceApproval/);
});
