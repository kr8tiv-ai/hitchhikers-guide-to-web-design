import assert from "node:assert/strict";
import { test } from "node:test";
import { SITE_TYPES } from "../src/site-types.ts";
import { StackError, decideStack, type StackDecision, type StackPick } from "../src/spec/stack.ts";

const HEADINGS = ["Pick", "Why", "Alternatives", "What would change this", "Versions"] as const;

const PICKS: readonly StackPick[] = ["astro", "next", "vite-react", "sveltekit"];

function section(markdown: string, name: string): string {
  const startToken = `## ${name}\n`;
  const start = markdown.indexOf(startToken);
  assert.ok(start >= 0, `missing section ${name}`);
  const bodyStart = start + startToken.length;
  const next = markdown.indexOf("\n## ", bodyStart);
  const body = next === -1 ? markdown.slice(bodyStart) : markdown.slice(bodyStart, next);
  return body.trim();
}

function alternativeIds(markdown: string): string[] {
  return section(markdown, "Alternatives")
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).split(":")[0] ?? "");
}

function assertRecord(record: StackDecision): void {
  assert.equal(record.markdown.includes("!"), false);
  assert.equal(record.markdown.includes("\r"), false);
  assert.equal(/\d+\.\d+\.\d+/.test(record.markdown), false);
  const found = [...record.markdown.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
  assert.deepEqual(found, [...HEADINGS]);
  assert.equal(section(record.markdown, "Pick"), record.pick);
  assert.equal(PICKS.includes(record.pick), true);
  assert.notEqual(record.pick, "shopify");

  const versions = section(record.markdown, "Versions");
  assert.equal(versions.includes("re-resolve at install"), true);
  assert.equal(versions.includes("not a pin"), true);
  assert.equal(versions.includes("2026-10-05"), true);

  const change = section(record.markdown, "What would change this");
  assert.equal(change.includes("persistent canvas"), true);
  assert.equal(change.includes("motion level 10"), true);
  assert.equal(change.includes("app-style site type"), true);
  assert.equal(change.includes(record.pick), true);

  assert.match(
    record.markdown,
    /Inventory-heavy commerce escalates\. It does not change the site stack by itself\./,
  );
  assert.match(record.markdown, /This record does not select Shopify\./);
  assert.doesNotMatch(section(record.markdown, "Pick"), /shopify/i);

  const ids = alternativeIds(record.markdown);
  assert.deepEqual(
    ids,
    PICKS.filter((id) => id !== record.pick),
  );
  if (record.pick !== "sveltekit") {
    assert.match(section(record.markdown, "Alternatives"), /The 3D ecosystem is thinner\./);
  }
}

test("a marketing site defaults to astro and not sveltekit", () => {
  const record = decideStack({
    siteType: "marketing",
    motionLevel: 5,
    persistentCanvas: false,
  });
  assert.equal(record.pick, "astro");
  assert.equal(record.insisted, false);
  assertRecord(record);
  assert.match(section(record.markdown, "Why"), /Astro is the default marketing stack\./);
  assert.deepEqual(alternativeIds(record.markdown), ["next", "vite-react", "sveltekit"]);
});

test("an app site type selects next", () => {
  const record = decideStack({ siteType: "app", motionLevel: 4, persistentCanvas: false });
  assert.equal(record.pick, "next");
  assert.equal(record.insisted, false);
  assertRecord(record);
  assert.match(section(record.markdown, "Why"), /the site type is app/);
});

test("motion level 10 selects vite-react", () => {
  const record = decideStack({
    siteType: "marketing",
    motionLevel: 10,
    persistentCanvas: false,
  });
  assert.equal(record.pick, "vite-react");
  assert.equal(record.insisted, false);
  assertRecord(record);
  assert.match(section(record.markdown, "Why"), /single-page world/);
});

test("a sveltekit override is honored and insisted", () => {
  const record = decideStack({
    siteType: "marketing",
    motionLevel: 3,
    persistentCanvas: false,
    userOverride: "sveltekit",
  });
  assert.equal(record.pick, "sveltekit");
  assert.equal(record.insisted, true);
  assertRecord(record);
  const why = section(record.markdown, "Why");
  assert.match(why, /The user insisted on SvelteKit \(sveltekit\)\./);
  assert.match(why, /would have chosen Astro \(astro\)\./);
  assert.match(why, /The 3D ecosystem is thinner\./);
  assert.deepEqual(alternativeIds(record.markdown), ["astro", "next", "vite-react"]);
});

test("an override wins over the heuristic", () => {
  const record = decideStack({
    siteType: "app",
    motionLevel: 10,
    persistentCanvas: true,
    userOverride: "astro",
  });
  assert.equal(record.pick, "astro");
  assert.equal(record.insisted, true);
  assertRecord(record);
  assert.match(
    section(record.markdown, "Why"),
    /would have chosen Vite plus React \(vite-react\)\./,
  );
});

test("insisted stays true when the override matches the heuristic", () => {
  const record = decideStack({
    siteType: "app",
    motionLevel: 2,
    persistentCanvas: false,
    userOverride: "next",
  });
  assert.equal(record.pick, "next");
  assert.equal(record.insisted, true);
  assertRecord(record);
});

test("a null override is not an insistence", () => {
  const record = decideStack({
    siteType: "portfolio",
    motionLevel: 2,
    persistentCanvas: false,
    userOverride: null,
  });
  assert.equal(record.pick, "astro");
  assert.equal(record.insisted, false);
  assertRecord(record);
});

test("an override outside the set throws", () => {
  assert.throws(
    () =>
      decideStack({
        siteType: "marketing",
        motionLevel: 3,
        persistentCanvas: false,
        userOverride: "shopify" as StackPick,
      }),
    (error: unknown) => {
      assert.ok(error instanceof StackError);
      assert.match(error.message, /shopify/);
      assert.match(error.message, /astro, next, vite-react, sveltekit/);
      return true;
    },
  );
});

test("motion level outside 1 to 10 throws", () => {
  for (const motionLevel of [0, 11, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => decideStack({ siteType: "marketing", motionLevel, persistentCanvas: false }),
      (error: unknown) => {
        assert.ok(error instanceof StackError);
        assert.match(error.message, /integer from 1 to 10/);
        return true;
      },
    );
  }
});

test("motion levels 1 and 10 are inside the scale", () => {
  const low = decideStack({ siteType: "marketing", motionLevel: 1, persistentCanvas: false });
  assert.equal(low.pick, "astro");
  assertRecord(low);
  const high = decideStack({ siteType: "content", motionLevel: 10, persistentCanvas: false });
  assert.equal(high.pick, "vite-react");
  assertRecord(high);
});

test("level 10 and site type app: vite-react wins because the world is harder", () => {
  const record = decideStack({ siteType: "app", motionLevel: 10, persistentCanvas: false });
  assert.equal(record.pick, "vite-react");
  assert.equal(record.insisted, false);
  assertRecord(record);
  assert.match(
    section(record.markdown, "Why"),
    /Vite plus React wins because the world is the harder constraint\./,
  );
});

test("persistent canvas at level 9 stays next, and level 10 still selects vite-react", () => {
  const appCanvas = decideStack({ siteType: "app", motionLevel: 9, persistentCanvas: true });
  assert.equal(appCanvas.pick, "next");
  assertRecord(appCanvas);

  const canvasOnly = decideStack({
    siteType: "portfolio",
    motionLevel: 9,
    persistentCanvas: true,
  });
  assert.equal(canvasOnly.pick, "next");
  assert.equal(canvasOnly.insisted, false);
  assertRecord(canvasOnly);
  assert.match(section(canvasOnly.markdown, "Why"), /persistent canvas runs across routes/);

  const marketing = decideStack({
    siteType: "marketing",
    motionLevel: 9,
    persistentCanvas: false,
  });
  assert.equal(marketing.pick, "astro");
  assertRecord(marketing);

  const world = decideStack({
    siteType: "portfolio",
    motionLevel: 10,
    persistentCanvas: true,
  });
  assert.equal(world.pick, "vite-react");
  assertRecord(world);
  assert.match(section(world.markdown, "Why"), /Level 10 still selects Vite plus React/);

  const appWorld = decideStack({ siteType: "app", motionLevel: 10, persistentCanvas: true });
  assert.equal(appWorld.pick, "vite-react");
  assertRecord(appWorld);
  assert.match(
    section(appWorld.markdown, "Why"),
    /Vite plus React wins because the world is the harder constraint\./,
  );
});

test("commerce site types do not select Shopify", () => {
  for (const siteType of ["sales", "funnel"]) {
    const calm = decideStack({ siteType, motionLevel: 3, persistentCanvas: false });
    assert.equal(calm.pick, "astro");
    assertRecord(calm);

    const canvas = decideStack({ siteType, motionLevel: 6, persistentCanvas: true });
    assert.equal(canvas.pick, "next");
    assertRecord(canvas);

    const world = decideStack({ siteType, motionLevel: 10, persistentCanvas: false });
    assert.equal(world.pick, "vite-react");
    assertRecord(world);
  }
});

test("every known site type stays off sveltekit unless the user overrides", () => {
  for (const hint of SITE_TYPES) {
    const record = decideStack({
      siteType: hint.id,
      motionLevel: 4,
      persistentCanvas: false,
    });
    assert.equal(record.pick, hint.id === "app" ? "next" : "astro");
    assert.equal(record.insisted, false);
    assert.notEqual(record.pick, "sveltekit");
    assertRecord(record);
  }
});

test("a site type exclamation mark is dropped from the record", () => {
  const record = decideStack({ siteType: "Go!", motionLevel: 2, persistentCanvas: false });
  assert.equal(record.pick, "astro");
  assert.equal(record.markdown.includes("!"), false);
  assert.match(section(record.markdown, "Why"), /The site type is Go, motion level 2/);
  assertRecord(record);
});

test("a non-boolean canvas and a non-string site type throw", () => {
  assert.throws(
    () =>
      decideStack({
        siteType: "marketing",
        motionLevel: 2,
        persistentCanvas: "yes" as unknown as boolean,
      }),
    (error: unknown) => {
      assert.ok(error instanceof StackError);
      assert.match(error.message, /boolean/);
      return true;
    },
  );
  assert.throws(
    () =>
      decideStack({
        siteType: 4 as unknown as string,
        motionLevel: 2,
        persistentCanvas: false,
      }),
    (error: unknown) => {
      assert.ok(error instanceof StackError);
      assert.match(error.message, /string/);
      return true;
    },
  );
});
