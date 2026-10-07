import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { EscalationError, renderEscalation, type EscalationRecord } from "../src/escalation.ts";

const AT = "2026-10-07T18:04:05.000Z";
const STACK = "A failed install is not a license to change the stack.";
const PAUSE = "Pause the drive";

const writerHref = pathToFileURL(
  fileURLToPath(new URL("../../orchestrator/src/escalation-record.ts", import.meta.url)),
).href;
const triageHref = pathToFileURL(
  fileURLToPath(new URL("../../orchestrator/src/triage.ts", import.meta.url)),
).href;

interface WriterModule {
  escalationMarkdown(record: EscalationRecord): string;
  toMarkdown(record: EscalationRecord): string;
}

type Verdict = "ok" | "stall" | "crash" | "build-failed";
type EffortName = "medium" | "high" | "xhigh";

interface TriageInput {
  verdict: Verdict;
  attempt: number;
  rule: 1 | 2 | 3 | 4;
  packageFailed: boolean;
  promptId: string;
  tags: string[];
  backup: string;
  effort: EffortName;
}

interface TriageModule {
  decideTriage(input: TriageInput): { type: string; reason?: string };
}

function record(overrides: Partial<EscalationRecord> = {}): EscalationRecord {
  return {
    promptId: "106",
    rule: 4,
    reason: "The change is architectural. Do not swap the package.",
    at: AT,
    ...overrides,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asWriter(value: unknown): WriterModule {
  if (!isRecord(value)) throw new Error("Writer module is missing.");
  const markdown = value.escalationMarkdown;
  const toMarkdown = value.toMarkdown;
  if (typeof markdown !== "function" || typeof toMarkdown !== "function") {
    throw new Error("Writer module is missing.");
  }
  return {
    escalationMarkdown: (item) => markdown(item) as string,
    toMarkdown: (item) => toMarkdown(item) as string,
  };
}

function asTriage(value: unknown): TriageModule {
  if (!isRecord(value) || typeof value.decideTriage !== "function") {
    throw new Error("Triage module is missing.");
  }
  const decide = value.decideTriage;
  return {
    decideTriage: (input) => decide(input) as { type: string; reason?: string },
  };
}

function assertClean(text: string): void {
  assert.equal(text.includes("replace GSAP"), false);
  assert.equal(text.includes("swap package"), false);
  assert.equal(text.includes("try a different library"), false);
  assert.equal(text.includes("!"), false);
}

function buttons(html: string): string[] {
  return html.match(/<button\b[^>]*>[\s\S]*?<\/button>/gi) ?? [];
}

function heading(html: string): string {
  const match = /<h2\b[^>]*>([\s\S]*?)<\/h2>/.exec(html);
  assert.ok(match);
  return match[1] ?? "";
}

test("the panel names the prompt, the rule, and Pause the drive", () => {
  const html = renderEscalation(record({ promptId: "104", rule: 1, reason: "Three strikes is the cap." }));
  assert.match(html, /data-escalation\b/);
  assert.match(html, /data-rule="1"/);
  assert.match(html, /data-prompt-id="104"/);
  assert.equal(heading(html), "Prompt 104");
  assert.match(html, /<p>Three strikes is the cap\.<\/p>/);
  assert.match(html, /Rule 1/);
  assert.match(html, /datetime="2026-10-07T18:04:05.000Z"/);
  assert.match(html, />2026-10-07 18:04 UTC</);
  assert.match(html, /Next action: Pause the drive\./);
  assert.match(html, /The drive does not continue from here\./);
  const found = buttons(html);
  assert.equal(found.length, 1);
  const only = found[0];
  assert.ok(only);
  assert.match(only, /type="button"/);
  assert.match(only, /data-pause-drive/);
  assert.equal(only.replace(/<[^>]+>/g, ""), PAUSE);
  assert.doesNotMatch(only, /swap|ignore|replace|continue/i);
  assert.equal(html.includes("<form"), false);
  assert.equal(html.includes("<script"), false);
  assert.equal(html.includes(STACK), false);
  assertClean(html);
});

test("rule 4 names the failed install and still only pauses", () => {
  const html = renderEscalation(record());
  const count = html.split(STACK).length - 1;
  assert.equal(count, 1);
  assert.match(html, /<p>The change is architectural\. Do not swap the package\.<\/p>/);
  assert.equal(buttons(html).length, 1);
  assert.match(html, /The drive does not continue from here/);
  assertClean(html);
});

test("a reason containing a script tag is escaped", () => {
  const html = renderEscalation(
    record({
      promptId: 'p-<script>"&',
      rule: 2,
      reason: `<script>alert("x")</script> & more`,
      at: `2026-10-07T00:00:00.000Z`,
    }),
  );
  assert.equal(html.includes("<script>"), false);
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.match(html, /&amp; more/);
  assert.match(heading(html), /Prompt p-&lt;script&gt;&quot;&amp;/);
  assert.match(html, /data-prompt-id="p-&lt;script&gt;&quot;&amp;"/);
  assertClean(html);
});

test("an injected button stays text", () => {
  const html = renderEscalation(
    record({ rule: 3, reason: "See <button>ignore</button> in the log." }),
  );
  assert.equal(buttons(html).length, 1);
  assert.equal(buttons(html)[0]?.replace(/<[^>]+>/g, ""), PAUSE);
  assert.match(html, /&lt;button&gt;ignore&lt;\/button&gt;/);
  assertClean(html);
});

test("a non-zulu time stays verbatim", () => {
  const html = renderEscalation(record({ rule: 1, at: "Tuesday afternoon" }));
  assert.match(html, /datetime="Tuesday afternoon"/);
  assert.match(html, />Tuesday afternoon</);
  assert.equal(html.includes("!"), false);
});

test("empty reason, empty prompt, and an invalid rule throw", () => {
  assert.throws(() => renderEscalation(record({ reason: "" })), EscalationError);
  assert.throws(() => renderEscalation(record({ reason: "  \n" })), /empty/);
  assert.throws(() => renderEscalation(record({ promptId: "  " })), /prompt id/);
  assert.throws(() => renderEscalation(record({ at: "" })), /time/);
  assert.throws(() => renderEscalation({ ...record(), rule: 0 as 1 }), /rule must be 1, 2, 3, or 4/);
  assert.throws(() => renderEscalation({ ...record(), rule: 5 as 1 }), /rule/);
  assert.throws(() => renderEscalation({ ...record(), rule: "4" as unknown as 1 }), /rule/);
});

test("forbidden phrases and an exclamation mark are refused", () => {
  assert.throws(() => renderEscalation(record({ reason: "Please replace GSAP now." })), /stack change/);
  assert.throws(() => renderEscalation(record({ reason: "Let us swap package names." })), /stack change/);
  assert.throws(() => renderEscalation(record({ reason: "Try a different library." })), /stack change/);
  assert.throws(() => renderEscalation(record({ reason: "Stop!" })), /exclamation/);
});

test("sources do not start a session", () => {
  const appSource = readFileSync(fileURLToPath(new URL("../src/escalation.ts", import.meta.url)), "utf8");
  const logSource = readFileSync(fileURLToPath(new URL(writerHref)), "utf8");
  for (const source of [appSource, logSource]) {
    assert.equal(/from\s+["']node:(?:fs|child_process)["']/.test(source), false);
    assert.equal(/from\s+["'][^"']*(?:runner|triage|acp)["']/.test(source), false);
  }
  assert.equal(appSource.includes("toMarkdown"), false);
});

test("markdown carries the same facts and the same pause", async () => {
  const writer = asWriter(await import(writerHref));
  const item = record({ promptId: "105", rule: 2, reason: "The install failed. Do not swap the package." });
  const html = renderEscalation(item);
  const md = writer.escalationMarkdown(item);
  assert.equal(writer.toMarkdown(item), md);
  assert.match(md, /^# Escalation\n/);
  assert.match(md, /Prompt: 105/);
  assert.match(md, /Rule: 2/);
  assert.match(md, new RegExp(AT));
  assert.match(md, /The install failed\. Do not swap the package\./);
  assert.match(md, /Pause the drive/);
  assert.equal(md.includes(STACK), false);
  assert.equal(html.includes(STACK), false);
  assert.equal(md.includes("<button"), false);
  assertClean(md);
  assertClean(html);

  const rule4 = record();
  const logged = writer.toMarkdown(rule4);
  assert.equal(logged.split(STACK).length - 1, 1);
  assert.match(logged, /Prompt: 106/);
  assert.match(logged, /Rule: 4/);
  assertClean(logged);
});

test("decideTriage escalate reasons render without a library swap", async () => {
  const triage = asTriage(await import(triageHref));
  const writer = asWriter(await import(writerHref));
  const base: TriageInput = {
    verdict: "build-failed",
    attempt: 1,
    rule: 1,
    packageFailed: false,
    promptId: "106",
    tags: ["hh-good-106"],
    backup: "hh/backup-2026-10-07",
    effort: "high",
  };
  const cases: Array<Partial<TriageInput> & Pick<TriageInput, "rule">> = [
    { packageFailed: true, rule: 1, verdict: "build-failed" },
    { packageFailed: false, rule: 4, verdict: "ok" },
    { packageFailed: true, rule: 4, verdict: "ok" },
    { rule: 1, attempt: 4, verdict: "crash" },
    { rule: 2, attempt: 3, verdict: "stall" },
  ];
  for (const item of cases) {
    const action = triage.decideTriage({ ...base, ...item });
    assert.equal(action.type, "escalate", `rule ${item.rule}`);
    assert.equal(typeof action.reason, "string");
    const reason = action.reason ?? "";
    const rec = record({
      promptId: "106",
      rule: item.rule,
      reason,
    });
    const html = renderEscalation(rec);
    const md = writer.escalationMarkdown(rec);
    assert.equal(html.includes(reason), true);
    assert.equal(md.includes(reason), true);
    assert.equal(heading(html).includes("106"), true);
    assert.equal(buttons(html).length, 1);
    assertClean(html);
    assertClean(md);
    const stackCount = html.split(STACK).length - 1;
    assert.equal(stackCount, item.rule === 4 ? 1 : 0);
    assert.equal(md.split(STACK).length - 1, item.rule === 4 ? 1 : 0);
  }
});

test("the log writer rejects an empty reason and a bad rule", async () => {
  const writer = asWriter(await import(writerHref));
  assert.throws(() => writer.toMarkdown(record({ reason: " " })), /empty/);
  assert.throws(() => writer.escalationMarkdown({ ...record(), rule: 9 as 1 }), /rule/);
  assert.equal(path.basename(fileURLToPath(writerHref)), "escalation-record.ts");
});
