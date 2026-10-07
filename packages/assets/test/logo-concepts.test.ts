import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { logoDirections as logoDirectionsFromIndex, quoteTopFour as quoteTopFourFromIndex } from "../src/index.ts";
import {
  logoDirections,
  pickFour,
  quoteTopFour,
  renderFour,
  type LogoDirection,
  type LogoKind,
} from "../src/logo-concepts.ts";
import { CapExceeded, quoteJob } from "../src/prices.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(here, "..", "src", "logo-concepts.ts");
const indexPath = path.join(here, "..", "src", "index.ts");

const KINDS: readonly LogoKind[] = [
  "wordmark",
  "wordmark",
  "lettermark",
  "lettermark",
  "symbol",
  "symbol",
  "combination",
  "combination",
  "emblem",
  "wildcard",
];

const SHAPE_KINDS: readonly LogoKind[] = ["symbol", "combination", "emblem", "wildcard"];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function exportedBody(source: string, name: string): string {
  const startAsync = source.indexOf(`export async function ${name}`);
  const startSync = source.indexOf(`export function ${name}`);
  const start = startAsync === -1 ? startSync : startAsync;
  if (start < 0) throw new Error(`missing ${name}`);
  const rest = source.slice(start + 1);
  const next = rest.search(/\nexport (async )?function /);
  if (next === -1) return source.slice(start);
  return source.slice(start, start + 1 + next);
}

function countingFetch(): { fetch: typeof fetch; calls: () => number } {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    throw new Error("fetch must not run");
  };
  return { fetch: fetchImpl, calls: () => calls };
}

test("logo sheet has ten ids and the kind counts 2, 2, 2, 2, 1, 1", () => {
  const sheet = logoDirections("North");
  assert.equal(sheet.length, 10);
  assert.deepEqual(
    sheet.map((direction) => direction.id),
    ["logo-01", "logo-02", "logo-03", "logo-04", "logo-05", "logo-06", "logo-07", "logo-08", "logo-09", "logo-10"],
  );
  assert.deepEqual(
    sheet.map((direction) => direction.kind),
    KINDS,
  );
  assert.equal(new Set(sheet.map((direction) => direction.prompt)).size, 10);
  assert.deepEqual(logoDirections("North"), sheet);
  assert.notEqual(logoDirections("South")[0]?.prompt, sheet[0]?.prompt);
});

test("wordmarks and lettermarks refuse rendered letters and keep the real font", () => {
  const sheet = logoDirections("North");
  const wordmarks = sheet.filter((direction) => direction.kind === "wordmark");
  const lettermarks = sheet.filter((direction) => direction.kind === "lettermark");
  assert.equal(wordmarks.length, 2);
  assert.equal(lettermarks.length, 2);
  for (const direction of [...wordmarks, ...lettermarks]) {
    assert.equal(direction.prompt.includes("do not render letters. Describe the personality only."), true);
    assert.equal(direction.prompt.includes("The letters will be set in a real font later."), true);
    assert.equal(direction.prompt.includes("Personality word North."), true);
  }
});

test("shape prompts are flat white stills with no text, gradient, or mockup", () => {
  const sheet = logoDirections("North");
  for (const direction of sheet) {
    assert.equal(direction.prompt.includes("!"), false);
    assert.equal(/signature/i.test(direction.prompt), false);
    assert.equal(direction.prompt.includes("no gradient"), true);
    assert.equal(direction.prompt.includes("no mockup"), true);
  }
  for (const direction of sheet.filter((item) => SHAPE_KINDS.includes(item.kind))) {
    assert.equal(direction.prompt.includes("no text"), true);
    assert.equal(
      direction.prompt.includes(
        "flat white shape on a plain background, no text, no gradient, no mockup",
      ),
      true,
    );
  }
  for (const direction of sheet.filter((item) => item.kind === "symbol")) {
    assert.equal(direction.prompt.includes("do not render letters"), true);
  }
});

test("an empty name throws and a name with < is stripped", () => {
  assert.throws(() => logoDirections(""), /empty/);
  assert.throws(() => logoDirections("   "), /empty/);
  assert.throws(() => logoDirections("<"), /empty/);
  assert.throws(() => logoDirections("!"), /empty/);
  assert.throws(() => logoDirections(undefined as unknown as string), /text/);
  const sheet = logoDirections("North<wind");
  for (const direction of sheet) {
    assert.equal(direction.prompt.includes("<"), false);
    assert.equal(direction.prompt.includes("Northwind"), true);
    assert.equal(direction.prompt.includes("!"), false);
  }
  const shouted = logoDirections("North!wind");
  assert.equal(shouted[0]?.prompt.includes("!"), false);
  assert.equal(shouted[0]?.prompt.includes("Northwind"), true);
});

test("quoteTopFour is $0.08 from quoteJob on the default still model", () => {
  const card = quoteJob({
    kind: "still",
    model: "grok-imagine-image",
    resolution: "default",
    prompt: "card-check",
    count: 4,
  });
  const quoted = quoteTopFour();
  assert.equal(quoted.usd, card.usd);
  assert.equal(quoted.usd, 0.08);
  assert.equal(quoted.usd.toFixed(2), "0.08");
  assert.match(quoted.line, /grok-imagine-image/);
  assert.match(quoted.line, /default/);
  assert.match(quoted.line, /count 4/);
  assert.match(quoted.line, /\$0\.08/);
  assert.equal(quoted.line.includes("card-check"), false);
  assert.equal(quoted.line.includes("flat white shape"), false);
  assert.equal(quoteTopFourFromIndex().usd, quoted.usd);
});

test("quoteTopFour and pickFour call quoteJob, and directions do not call runJobs", () => {
  const source = stripComments(readFileSync(sourcePath, "utf8"));
  assert.match(source, /quoteJob[\s\S]*from "\.\/prices\.ts"/);
  assert.match(exportedBody(source, "quoteTopFour"), /quoteJob\(/);
  assert.match(exportedBody(source, "pickFour"), /quoteJob\(/);
  assert.equal(exportedBody(source, "logoDirections").includes("runJobs"), false);
  assert.match(exportedBody(source, "renderFour"), /runJobs\(/);
  assert.match(exportedBody(source, "renderFour"), /confirm/);
  assert.equal(source.includes("0.08"), false);
  assert.equal(source.includes("0.02"), false);
  const indexSource = readFileSync(indexPath, "utf8");
  assert.match(indexSource, /logoDirections/);
  assert.match(indexSource, /quoteTopFour/);
  assert.match(indexSource, /pickFour/);
  assert.match(indexSource, /renderFour/);
  assert.match(indexSource, /logo-concepts\.ts/);
  assert.equal(logoDirectionsFromIndex, logoDirections);
});

test("pickFour returns four directions and rejects indexes outside 0..9", () => {
  const sheet = logoDirections("North");
  const picked = pickFour(sheet, [9, 0, 4, 5]);
  assert.equal(picked.length, 4);
  assert.deepEqual(
    picked.map((direction) => direction.id),
    ["logo-10", "logo-01", "logo-05", "logo-06"],
  );
  assert.throws(() => pickFour(sheet, [0, 1, 2, 10]), /outside 0\.\.9/);
  assert.throws(() => pickFour(sheet, [0, 1, 2, -1]), /outside 0\.\.9/);
  assert.throws(() => pickFour(sheet, [0, 1, 2, 1.5]), /outside 0\.\.9/);
  assert.throws(() => pickFour(sheet, [0, 1, 2]), /0\.\.9/);
  assert.throws(() => pickFour(sheet, [0, 1, 2, 3, 4]), /0\.\.9/);
  assert.throws(() => pickFour(sheet, [0, 0, 1, 2]), /repeated/);
  assert.throws(() => pickFour(sheet.slice(0, 2), [0, 1, 2, 3]), /direction list/);
});

test("renderFour with confirm false does not fetch", async () => {
  const seen = countingFetch();
  await assert.rejects(
    () =>
      renderFour({
        confirm: false,
        remainingUsd: 0.05,
        mode: "api",
        fetch: seen.fetch,
        name: "North",
        indexes: [4, 5, 6, 7],
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error instanceof CapExceeded, false);
      assert.match(error.message, /confirm/);
      assert.equal(error.message.includes("!"), false);
      return true;
    },
  );
  assert.equal(seen.calls(), 0);
});

test("renderFour with confirm true and remaining 0.05 throws CapExceeded", async () => {
  const seen = countingFetch();
  await assert.rejects(
    () =>
      renderFour({
        confirm: true,
        remainingUsd: 0.05,
        mode: "diy",
        fetch: seen.fetch,
        name: "North",
        indexes: [4, 5, 6, 7],
      }),
    (error: unknown) => {
      assert.ok(error instanceof CapExceeded);
      assert.equal(error.usd, 0.08);
      assert.equal(error.remainingUsd, 0.05);
      assert.match(error.message, /grok-imagine-image/);
      assert.match(error.message, /default/);
      assert.equal(error.message.includes("!"), false);
      return true;
    },
  );
  assert.equal(seen.calls(), 0);
});

test("confirmed render under the cap sends four stills and skips fetch in DIY", async () => {
  const seen = countingFetch();
  const quoted = quoteTopFour();
  const result = await renderFour({
    confirm: true,
    remainingUsd: quoted.usd,
    mode: "diy",
    fetch: seen.fetch,
    name: "North",
    indexes: [4, 5, 6, 7],
  });
  assert.equal(seen.calls(), 0);
  assert.equal(result.mode, "diy");
  assert.equal(result.usd, 0);
  assert.equal(result.prompts.length, 4);
  for (const prompt of result.prompts) {
    assert.equal(prompt.includes("no text"), true);
    assert.equal(prompt.includes("no gradient"), true);
    assert.equal(prompt.includes("Personality word North."), true);
    assert.equal(prompt.includes("!"), false);
  }
});

test("confirmed API render fetches once per still and keeps the key out of the URL", async () => {
  const apiKey = "logo-render-test-key";
  let calls = 0;
  const result = await renderFour({
    confirm: true,
    remainingUsd: quoteTopFour().usd,
    mode: "api",
    apiKey,
    name: "North",
    indexes: [4, 5, 8, 9],
    fetch: async (input, init) => {
      calls += 1;
      assert.equal(String(input).includes(apiKey), false);
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("Authorization"), `Bearer ${apiKey}`);
      const body = JSON.parse(String(init?.body)) as { model?: string; n?: number; prompt?: string };
      assert.equal(body.model, "grok-imagine-image");
      assert.equal(body.n, 1);
      assert.equal(typeof body.prompt, "string");
      assert.equal(body.prompt?.includes("no gradient"), true);
      assert.equal(body.prompt?.includes("no text"), true);
      assert.equal(body.prompt?.includes(apiKey), false);
      return new Response("{}", { status: 200 });
    },
  });
  assert.equal(calls, 4);
  assert.equal(result.mode, "api");
  assert.equal(result.usd, 0.08);
  assert.equal(result.prompts.length, 4);
});

test("renderFour can take four directions directly", async () => {
  const sheet = logoDirections("North");
  const four: LogoDirection[] = sheet.slice(4, 8);
  const seen = countingFetch();
  const result = await renderFour({
    confirm: true,
    remainingUsd: 1,
    mode: "diy",
    fetch: seen.fetch,
    directions: four,
  });
  assert.equal(seen.calls(), 0);
  assert.deepEqual(result.prompts, four.map((direction) => direction.prompt));
});
