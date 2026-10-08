import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { formatCost } from "@hitchhiker/engine";
import { DashboardError, renderDashboard, renderQueueReadError } from "../src/dashboard.ts";
import { costText, progressHtml, queueBodyHtml } from "../src/drive-markup.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const cssPath = path.resolve(here, "../src/dashboard.css");
const sourcePath = path.resolve(here, "../src/dashboard.ts");

const STATUSES = ["queued", "running", "passed", "fixing", "escalated", "paused"] as const;

function copy(html: string): string {
  return html.replace(/<!DOCTYPE html>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
}

function pauseTag(html: string): string {
  const match = html.match(/<button\b[^>]*data-action="pause"[^>]*>Pause<\/button>/);
  assert.ok(match, "Pause button");
  return match[0];
}

test("rows stay in order, escape ids, and expose status", () => {
  const html = renderDashboard({
    items: [
      { id: "014-menu", kind: "build", status: "passed" },
      { id: `a<b>&"'`, kind: "review", status: "running" },
      { id: "017-hours", kind: "build", status: "queued" },
    ],
  });
  const first = html.indexOf('data-id="014-menu"');
  const second = html.indexOf('data-id="a&lt;b&gt;&amp;&quot;&#39;"');
  const third = html.indexOf('data-id="017-hours"');
  assert.ok(first >= 0 && second > first && third > second);
  assert.match(html, /data-status="passed"/);
  assert.match(html, /data-status="running"/);
  assert.match(html, /data-status="queued"/);
  assert.match(html, /class="is-current"/);
  assert.match(html, /hh-drive__status--passed/);
  assert.match(html, />Passed</);
  assert.match(html, />Running</);
  assert.match(html, />Queued</);
  assert.match(html, /<h1 class="hh-headline" id="drive-title">Drive<\/h1>/);
  assert.match(html, /\/hh-dashboard/);
  assert.equal(html.match(/data-action="pause"/g)?.length, 1);
  assert.equal(html.match(/>Pause</g)?.length, 1);
  assert.doesNotMatch(pauseTag(html), /aria-disabled/);
  assert.equal(copy(html).includes("!"), false);
  assert.equal(copy(html).includes("\u2014"), false);
  assert.doesNotMatch(html, /grok dashboard/i);
  assert.doesNotMatch(html, /indigo/i);
  assert.doesNotMatch(html, /data-action="start"/i);
  assert.doesNotMatch(html, />\s*Start\s*</);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /href="src\/dashboard\.css"/);
  assert.match(html, /href="src\/design\/tokens\.css"/);
  assert.match(html, /data-region="cost"/);
  assert.match(html, /data-cost-line/);
  assert.match(html, /Prompts 2 of 3\./);
  assert.doesNotMatch(html, /\$/);
  assert.doesNotMatch(html, /Cost is not measured on this desk yet/);
  assert.match(html, /data-action="approve"/);
  assert.match(html, /data-action="elevate"/);
  assert.match(html, /data-action="deploy"/);
  assert.match(html, /href="\/approve"/);
});

test("a hostile id stays in the attribute and the text", () => {
  const html = renderDashboard({
    items: [{ id: `"><script>alert(1)</script>`, kind: "build", status: "queued" }],
  });
  assert.match(html, /data-id="&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;"/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});

test("every known status renders once, and passed is the only green status", () => {
  const html = renderDashboard({
    items: STATUSES.map((status, index) => ({
      id: index === 3 ? "review-after-003" : `row-${index}`,
      kind: index === 3 ? "review" : "build",
      status,
    })),
  });
  for (const status of STATUSES) {
    assert.equal(html.match(new RegExp(`data-status="${status}"`, "g"))?.length, 1);
  }
  assert.equal(html.match(/hh-drive__status--passed/g)?.length, 1);
  assert.match(html, /reviews\/003-REVIEW\.md/);
  assert.match(html, /<dt>Passed<\/dt><dd>1 of 6<\/dd>/);
  assert.match(html, /<dt>Escalated<\/dt><dd>1<\/dd>/);
  assert.match(html, /data-escalation-for="row-4"/);
  assert.match(html, /Open the pause control/);
  assert.equal(html.match(/>Pause</g)?.length, 1);
});

test("an empty queue keeps Pause and disables it", () => {
  const html = renderDashboard({ items: [] });
  assert.match(html, /No drive queued\./);
  assert.match(html, /<h1 class="hh-headline" id="drive-title">Drive<\/h1>/);
  assert.match(pauseTag(html), /aria-disabled="true"/);
  assert.equal(html.match(/data-action="pause"/g)?.length, 1);
  assert.equal(html.match(/aria-disabled="true"/g)?.length, 1);
  assert.match(html, /The drive has not been planned\./);
  assert.match(html, /No escalations/);
  assert.match(html, /No Zaphod verdict is on this queue\./);
  assert.match(html, /Phone Lighthouse has not run\./);
  assert.match(html, /No session tail is on this queue\./);
  assert.match(html, /No prompts on this queue\./);
  assert.doesNotMatch(html, /\$/);
  assert.doesNotMatch(html, /Cost is not measured on this desk yet/);
  assert.doesNotMatch(html, /data-id=/);
  assert.equal(copy(html).includes("!"), false);
  assert.doesNotMatch(html, /grok dashboard/i);
  assert.doesNotMatch(html, />\s*Start\s*</);
});

test("unknown status and unknown kind throw", () => {
  assert.throws(
    () => renderDashboard({ items: [{ id: "a", kind: "build", status: "review" }] }),
    (error: unknown) => error instanceof DashboardError && /Unknown dashboard status/.test(error.message),
  );
  assert.throws(
    () => renderDashboard({ items: [{ id: "a", kind: "build", status: "fixed" }] }),
    DashboardError,
  );
  assert.throws(
    () => renderDashboard({ items: [{ id: "a", kind: "prompt", status: "queued" }] }),
    /Queue kind must be build or review/,
  );
});

test("more than 200 rows throws and 200 still renders", () => {
  const full = Array.from({ length: 200 }, (_, index) => ({
    id: `p-${index}`,
    kind: "build" as const,
    status: "queued",
  }));
  const html = renderDashboard({ items: full });
  assert.equal(html.match(/data-status="queued"/g)?.length, 200);
  assert.throws(
    () => renderDashboard({ items: [...full, { id: "p-200", kind: "build", status: "queued" }] }),
    /more than 200 rows/,
  );
});

test("a script url adds the token and drops the inline theme script", () => {
  const token = "ab".repeat(32);
  const html = renderDashboard(
    { items: [{ id: "001", kind: "build", status: "queued" }] },
    { token, scriptUrl: "/client/drive.js" },
  );
  assert.match(html, new RegExp(`name="hh-csrf" content="${token}"`));
  assert.match(html, /src="\/client\/drive\.js"/);
  assert.doesNotMatch(html, /prefers-color-scheme/);
  assert.equal(html.match(/data-action="pause"/g)?.length, 1);
  assert.equal(copy(html).includes("!"), false);
  assert.throws(
    () => renderDashboard({ items: [] }, { scriptUrl: "https://example.com/x.js" }),
    DashboardError,
  );
});

test("the default page keeps the inline theme script", () => {
  const html = renderDashboard({ items: [] });
  assert.match(html, /prefers-color-scheme/);
  assert.doesNotMatch(html, /name="hh-csrf"/);
  assert.doesNotMatch(html, /\/client\/drive\.js/);
});

test("the subscription line matches formatCost", () => {
  const items = [
    { id: "001", kind: "build" as const, status: "passed" as const },
    { id: "002", kind: "build" as const, status: "running" as const },
    { id: "003", kind: "review" as const, status: "queued" as const },
  ];
  const line = formatCost({ mode: "subscription", promptsRun: 2, promptsTotal: 3 });
  assert.equal(costText(items), line);
  const html = renderDashboard({ items });
  assert.ok(html.includes(line));
  assert.ok(html.includes(progressHtml(items)));
  assert.ok(html.includes(queueBodyHtml(items)));
  assert.doesNotMatch(html, /\$/);
});

test("a queue read error stays styled and drops markup in the message", () => {
  const html = renderQueueReadError("queue.json is not valid JSON.");
  assert.match(html, /The queue file could not be read\./);
  assert.match(html, /queue\.json is not valid JSON\./);
  assert.match(html, /It was left on disk\./);
  assert.match(html, /hh-error/);
  assert.match(html, /hh-shell/);
  assert.doesNotMatch(html, /\/client\/drive\.js/);
  assert.equal(copy(html).includes("!"), false);
  const hostile = renderQueueReadError("<script>alert(1)</script>");
  assert.doesNotMatch(hostile, /<script>alert/);
  assert.match(hostile, /The queue file could not be read\./);
});

test("css uses shell variables, a max-width, and no indigo or fixed width", () => {
  const css = readFileSync(cssPath, "utf8");
  assert.match(css, /var\(--color-ink\)/);
  assert.match(css, /var\(--color-success\)/);
  assert.match(css, /max-width:\s*100%/);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(css, /indigo|violet|purple|magenta/i);
  assert.doesNotMatch(css, /gradient/i);
  assert.doesNotMatch(css, /1440px|width:\s*1440/);
  assert.doesNotMatch(css, /rounded-full|bg-indigo|magnetic|!important/);
  const source = readFileSync(sourcePath, "utf8");
  assert.match(source, /formatCost\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /grok dashboard/i);
  assert.doesNotMatch(source, /XMLHttpRequest/);
  assert.doesNotMatch(source, /\$10-20/);
  assert.doesNotMatch(source, /Cost is not measured on this desk yet/);
});
