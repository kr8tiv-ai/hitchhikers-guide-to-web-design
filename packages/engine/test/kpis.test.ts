import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { SITE_TYPES } from "../src/site-types.ts";
import { KPI_REFUSAL, KpisError, renderKpis } from "../src/spec/kpis.ts";

function words(markdown: string): string[] {
  const trimmed = markdown.trim();
  if (trimmed === "") return [];
  return trimmed.split(/\s+/);
}

function percentSnippets(text: string): string[] {
  return text.match(/\d[\d,]*(?:\.\d+)?\s*%/g) ?? [];
}

test("unknown site type throws and lists the known ids", () => {
  assert.throws(
    () => renderKpis({ siteType: "tea-shop", answerText: "" }),
    (error: unknown) => {
      assert.ok(error instanceof KpisError);
      assert.match(error.message, /tea-shop/);
      for (const hint of SITE_TYPES) assert.ok(error.message.includes(hint.id));
      return true;
    },
  );
});

test("tea shop fixture with empty answer text produces the refusal sentence", () => {
  const markdown = renderKpis({ siteType: "local", answerText: "" });
  assert.equal(markdown.includes(KPI_REFUSAL), true);
  assert.equal(markdown.includes("Calls and direction requests"), true);
  assert.equal(markdown.includes("%"), false);
  assert.equal(/\d/.test(markdown), false);
  assert.equal(markdown.includes("!"), false);
  assert.ok(words(markdown).length < 200);
});

test("whitespace and numberless answers do not invent a baseline", () => {
  for (const answerText of ["   \n", "we sell tea and cake"]) {
    const markdown = renderKpis({ siteType: "sales", answerText });
    assert.equal(markdown.includes(KPI_REFUSAL), true);
    assert.equal(markdown.includes("Revenue and average order value"), true);
    assert.equal(markdown.includes("%"), false);
    assert.equal(/\d/.test(markdown), false);
  }
});

test("every site type contributes its own KPI phrase", () => {
  for (const hint of SITE_TYPES) {
    const markdown = renderKpis({ siteType: hint.id, answerText: "" });
    assert.equal(markdown.includes(hint.kpi), true);
    assert.equal(markdown.includes(`Site type: ${hint.id}`), true);
    assert.equal(markdown.includes(KPI_REFUSAL), true);
  }
});

test("current 10 goal 20 are labeled measurements", () => {
  const markdown = renderKpis({ siteType: "calls", answerText: "current 10 goal 20" });
  assert.match(markdown, /^Current: 10$/m);
  assert.match(markdown, /^Goal: 20$/m);
  assert.equal(markdown.includes("Qualified leads"), true);
  assert.equal(markdown.includes(KPI_REFUSAL), false);
  assert.equal(markdown.includes("%"), false);
  assert.equal(markdown.includes("!"), false);
});

test("reversed words still pair the nearer integer", () => {
  const markdown = renderKpis({ siteType: "calls", answerText: "goal 20, current 10" });
  assert.match(markdown, /^Current: 10$/m);
  assert.match(markdown, /^Goal: 20$/m);
});

test("10 and 20 are numbers mentioned and are not called current or goal", () => {
  const markdown = renderKpis({ siteType: "funnel", answerText: "10 and 20" });
  assert.match(markdown, /^Numbers mentioned: 10, 20$/m);
  assert.equal(markdown.includes("Opt-in through to purchase"), true);
  assert.doesNotMatch(markdown, /\bcurrent\b/i);
  assert.doesNotMatch(markdown, /\bgoal\b/i);
  assert.equal(markdown.includes(KPI_REFUSAL), false);
});

test("one integer or three integers stay unlabeled", () => {
  const one = renderKpis({ siteType: "event", answerText: "current 10 goal" });
  assert.match(one, /^Numbers mentioned: 10$/m);
  assert.doesNotMatch(one, /^Current:/m);
  assert.doesNotMatch(one, /^Goal:/m);

  const three = renderKpis({ siteType: "event", answerText: "current 10 goal 20 and 30" });
  assert.match(three, /^Numbers mentioned: 10, 20, 30$/m);
  assert.doesNotMatch(three, /^Current:/m);
  assert.doesNotMatch(three, /^Goal:/m);
  assert.equal(three.includes("Registrations"), true);
});

test("commas between digits are one integer", () => {
  const labeled = renderKpis({ siteType: "sales", answerText: "current 1,200 goal 3,400" });
  assert.match(labeled, /^Current: 1200$/m);
  assert.match(labeled, /^Goal: 3400$/m);
  assert.doesNotMatch(labeled, /Numbers mentioned/);

  const bare = renderKpis({ siteType: "sales", answerText: "1,200 and 50" });
  assert.match(bare, /^Numbers mentioned: 1200, 50$/m);
  assert.doesNotMatch(bare, /\bcurrent\b/i);
  assert.doesNotMatch(bare, /\bgoal\b/i);
});

test("negative numbers throw", () => {
  for (const answerText of ["current -5 goal 10", "-1,200", "about \u22125"]) {
    assert.throws(
      () => renderKpis({ siteType: "app", answerText }),
      (error: unknown) => {
        assert.ok(error instanceof KpisError);
        assert.match(error.message, /Negative numbers are refused/);
        return true;
      },
    );
  }
});

test("a hyphenated page id is not a negative number and is not a baseline", () => {
  const labeled = renderKpis({
    siteType: "local",
    answerText: "current 10 goal 20 on page-2",
  });
  assert.match(labeled, /^Current: 10$/m);
  assert.match(labeled, /^Goal: 20$/m);
  assert.doesNotMatch(labeled, /Numbers mentioned/);
  assert.equal(labeled.includes("%"), false);

  const slug = renderKpis({ siteType: "local", answerText: "page-2 carries it" });
  assert.equal(slug.includes(KPI_REFUSAL), true);
  assert.equal(slug.includes("Calls and direction requests"), true);
  assert.equal(/\d/.test(slug), false);
  assert.equal(slug.includes("%"), false);
});

test("a percent is copied from the user and no other percent appears", () => {
  const answerText = "hold at 2.5% and not a made-up rate";
  const markdown = renderKpis({ siteType: "sign-ups", answerText });
  assert.match(markdown, /From the user: 2\.5%/);
  assert.deepEqual(percentSnippets(markdown), percentSnippets(answerText));
  assert.equal(markdown.includes(KPI_REFUSAL), false);
  assert.equal(markdown.includes("New subscribers"), true);
  assert.doesNotMatch(markdown, /\bassumption\b/i);

  const labeled = renderKpis({
    siteType: "sign-ups",
    answerText: "current 10 goal 20, about 2.5%",
  });
  assert.match(labeled, /^Current: 10$/m);
  assert.match(labeled, /^Goal: 20$/m);
  assert.match(labeled, /From the user: 2\.5%/);
  assert.deepEqual(percentSnippets(labeled), ["2.5%"]);

  const bare = renderKpis({ siteType: "sign-ups", answerText: "current 10 goal 20" });
  assert.deepEqual(percentSnippets(bare), []);
  assert.equal(bare.includes("%"), false);
});

test("a percent range is marked as an assumption and quotes the user", () => {
  const answerText = "visitors at an assumed 2% to 4%";
  const markdown = renderKpis({ siteType: "nonprofit", answerText });
  assert.match(markdown, /Assumption\. From the user: 2% to 4%/);
  assert.deepEqual(percentSnippets(markdown), percentSnippets(answerText));
  assert.equal(markdown.includes("Donations completed"), true);
  assert.equal(markdown.includes(KPI_REFUSAL), false);

  const dashed = renderKpis({ siteType: "nonprofit", answerText: "range 2-4%" });
  assert.match(dashed, /Assumption\. From the user: 2-4%/);
  assert.deepEqual(percentSnippets(dashed), percentSnippets("range 2-4%"));
  assert.doesNotMatch(dashed, /^Current:/m);
  assert.doesNotMatch(dashed, /\bgoal\b/i);
});

test("the markdown stays short and has no exclamation mark", () => {
  const markdown = renderKpis({ siteType: "portfolio", answerText: "current 10 goal 20!" });
  assert.equal(markdown.includes("!"), false);
  assert.equal(markdown.includes("！"), false);
  assert.match(markdown, /^Current: 10$/m);
  assert.match(markdown, /^Goal: 20$/m);
  assert.equal(markdown.includes("Inquiries and time spent with the work"), true);
  assert.ok(words(markdown).length < 200);
});

test("renderKpis reads SITE_TYPES and does not call an analytics API", () => {
  const source = readFileSync(new URL("../src/spec/kpis.ts", import.meta.url), "utf8");
  assert.match(source, /from "\.\.\/site-types\.ts"/);
  assert.match(source, /SITE_TYPES/);
  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /https?:\/\//);
  assert.doesNotMatch(source, /plausible|umami|gtag/i);
});
