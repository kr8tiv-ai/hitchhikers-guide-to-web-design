import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  defaultConfig,
  think,
  type SpawnLike,
  type ThinkRequest,
} from "@hitchhiker/engine";
import { assertLogoSvg } from "../src/wordmark.ts";
import { LOGO_HAPPY_QUESTION, checkLogo } from "../src/logo/checks.ts";
import {
  LOGO_CLEAN_INSTRUCTIONS,
  LOGO_CLEAN_SCHEMA,
  LOGO_CLEAN_TASK,
  assertCleanedLogoSvg,
  cleanLogo,
} from "../src/logo/clean.ts";

const SQUARE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#111111" d="M4 4 H28 V28 H4 Z"/></svg>`;
const TRIANGLE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#111111" d="M4 28 L16 4 L28 28 Z"/></svg>`;
const LOOSE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="#111111" d="M4 4 H28 V28 H4 Z"/></svg>`;
const TIGHT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#111111" d="M4 4 H28 V28 H4 Z"/></svg>`;

const FLAGS = new Set([
  "-p",
  "-m",
  "--effort",
  "--json-schema",
  "--output-format",
  "--max-turns",
  "--tools",
  "--permission-mode",
]);

function scripted(value: unknown): typeof think {
  return async () => ({
    value: value as never,
    raw: JSON.stringify(value),
    durationMs: 1,
    cassette: "live",
  });
}

function throwingThink(): typeof think {
  return async () => {
    throw new Error("model offline");
  };
}

/** Unique coordinates so SVGO cannot fold the path under 30 KB. */
function heavyLogo(): string {
  const parts = ["M10.125 10.375"];
  for (let i = 0; i < 4500; i += 1) {
    const x = (10 + ((i * 17) % 997) / 10).toFixed(3);
    const y = (10 + ((i * 13) % 991) / 10).toFixed(3);
    parts.push(`L${x} ${y}`);
  }
  parts.push("Z");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#111111" d="${parts.join(" ")}"/></svg>`;
}

test("assertCleanedLogoSvg requires a square viewBox, a path, and under 30 KB", () => {
  assert.doesNotThrow(() => assertCleanedLogoSvg(SQUARE));
  assertLogoSvg(SQUARE);
  assert.throws(() => assertCleanedLogoSvg(`<svg><path d="M0 0 H10 V10 Z"/></svg>`), /viewBox/);
  assert.throws(
    () =>
      assertCleanedLogoSvg(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><path fill="#111" d="M0 0 H10 V10 Z"/></svg>`,
      ),
    /square/,
  );
  assert.throws(
    () =>
      assertCleanedLogoSvg(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><image href="mark.png"/><path d="M0 0 H10 V10 Z"/></svg>`,
      ),
    /image/i,
  );
  assert.throws(
    () =>
      assertCleanedLogoSvg(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><text>T</text><path d="M0 0 H10 V10 Z"/></svg>`,
      ),
    /text/i,
  );
  const heavy = heavyLogo();
  assert.ok(Buffer.byteLength(heavy, "utf8") >= 30 * 1024);
  assert.throws(() => assertCleanedLogoSvg(heavy), /30 KB/);
});

test("a valid model clean-up is kept after SVGO", async () => {
  const result = await cleanLogo(SQUARE, {
    think: scripted({ svg: SQUARE, changes: ["Snapped to the 0.5 grid."] }),
  });
  assert.equal(result.usedModel, true);
  assert.deepEqual(result.changes, ["Snapped to the 0.5 grid."]);
  assertCleanedLogoSvg(result.svg);
  assert.equal(result.svg.includes("<path"), true);
  assert.equal(result.svg.includes("<image"), false);
});

test("a tighter viewBox around the same path is not treated as distortion", async () => {
  const result = await cleanLogo(LOOSE, {
    think: scripted({ svg: TIGHT, changes: ["Set a square viewBox."] }),
  });
  assert.equal(result.usedModel, true, result.changes.join(" "));
  assert.match(result.svg, /viewBox="0 0 32 32"/);
});

test("model failure keeps the SVGO version and says so", async () => {
  const offline = await cleanLogo(SQUARE, { think: throwingThink() });
  assert.equal(offline.usedModel, false);
  assert.match(offline.changes[0] ?? "", /SVGO/);
  assert.match(offline.changes[0] ?? "", /model offline/);
  assertLogoSvg(offline.svg);

  const badSchema = await cleanLogo(SQUARE, { think: scripted({ svg: 4, changes: [] }) });
  assert.equal(badSchema.usedModel, false);
  assert.match(badSchema.changes[0] ?? "", /schema/);

  const image = await cleanLogo(SQUARE, {
    think: scripted({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><image href="a.png"/><path d="M4 4 H28 V28 H4 Z"/></svg>`,
      changes: ["added a raster"],
    }),
  });
  assert.equal(image.usedModel, false);
  assert.match(image.changes[0] ?? "", /image/i);
  assert.equal(image.svg.includes("<image"), false);

  const text = await cleanLogo(SQUARE, {
    think: scripted({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><text>No</text><path d="M4 4 H28 V28 H4 Z"/></svg>`,
      changes: [],
    }),
  });
  assert.equal(text.usedModel, false);
  assert.match(text.changes[0] ?? "", /text/i);

  const open = await cleanLogo(SQUARE, {
    think: scripted({
      svg: `<svg xmlns="http://www.w3.org/2000/svg"><path fill="#111" d="M4 4 H28 V28 H4 Z"/></svg>`,
      changes: [],
    }),
  });
  assert.equal(open.usedModel, false);
  assert.match(open.changes[0] ?? "", /viewBox/);

  const wide = await cleanLogo(SQUARE, {
    think: scripted({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 32"><path fill="#111" d="M4 4 H28 V28 H4 Z"/></svg>`,
      changes: [],
    }),
  });
  assert.equal(wide.usedModel, false);
  assert.match(wide.changes[0] ?? "", /square/);
});

test("a silhouette that changes area by more than 5% is rejected", async () => {
  const result = await cleanLogo(SQUARE, {
    think: scripted({ svg: TRIANGLE, changes: ["replaced the square"] }),
  });
  assert.equal(result.usedModel, false);
  assert.match(result.changes[0] ?? "", /silhouette/);
  assert.match(result.svg, /H4Z|h24v24H4Z/);
  assert.equal(result.svg.includes("L16"), false);
});

test("an oversized model SVG keeps the SVGO version", async () => {
  const heavy = heavyLogo();
  const result = await cleanLogo(SQUARE, {
    think: scripted({ svg: heavy, changes: ["added nodes"] }),
  });
  assert.equal(result.usedModel, false);
  assert.match(result.changes[0] ?? "", /30 KB/);
  assert.ok(Buffer.byteLength(result.svg, "utf8") < 30 * 1024);
});

test("cleanLogo replays a cassette through think()", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-logo-clean-"));
  const cassetteDir = path.join(dir, "cassettes");
  const payload = { svg: SQUARE, changes: ["Snapped to the 0.5 grid."] };
  let spawns = 0;
  const spawnImpl: SpawnLike = async () => {
    spawns += 1;
    return {
      status: 0,
      stdout: JSON.stringify({
        text: JSON.stringify(payload),
        stopReason: "end_turn",
        usage: { input_tokens: 11, output_tokens: 7 },
      }),
      stderr: "",
      timedOut: false,
      errorCode: null,
    };
  };
  let seen: ThinkRequest<unknown> | undefined;
  const recorded: typeof think = (req) => {
    seen = req;
    return think(req, {
      spawnImpl,
      projectDir: dir,
      cassetteDir,
      config: defaultConfig(),
      flags: FLAGS,
      env: { HH_CASSETTE: "record", PATH: "" },
    });
  };
  try {
    const first = await cleanLogo(SQUARE, { think: recorded });
    assert.equal(first.usedModel, true);
    assert.deepEqual(first.changes, ["Snapped to the 0.5 grid."]);
    assert.equal(spawns, 1);
    assert.equal(seen?.task, LOGO_CLEAN_TASK);
    assert.equal(seen?.input.includes(LOGO_CLEAN_INSTRUCTIONS), true);
    assert.equal(seen?.input.includes("0.5"), true);
    assert.equal(seen?.input.includes(SQUARE), true);
    assert.deepEqual(seen?.schema, LOGO_CLEAN_SCHEMA);

    const replayed: typeof think = (req) =>
      think(req, {
        spawnImpl: async () => {
          throw new Error("spawned during replay");
        },
        projectDir: dir,
        cassetteDir,
        config: defaultConfig(),
        flags: FLAGS,
        env: { HH_CASSETTE: "replay", PATH: "" },
      });
    const second = await cleanLogo(SQUARE, { think: replayed });
    assert.equal(second.usedModel, true);
    assert.deepEqual(second.changes, ["Snapped to the 0.5 grid."]);
    assertCleanedLogoSvg(second.svg);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("32 and 16 checks report a squint score and ask for an improvement", async () => {
  const bold = await checkLogo(SQUARE);
  assert.ok(bold.px32.filledRatio > 0.2);
  assert.ok(bold.px16.filledRatio > 0.2);
  assert.equal(bold.px32.components, 1);
  assert.equal(bold.px16.components, 1);
  assert.ok(bold.px32.oneColourFilledRatio > 0.2);
  assert.ok(bold.px32.reversedFilledRatio > 0.2);
  assert.ok(bold.squint > 0.5);
  assert.ok(bold.squint <= 1);
  assert.equal(bold.advice.includes(LOGO_HAPPY_QUESTION), true);
  assert.equal(bold.advice.some((line) => /simplified favicon mark/i.test(line)), false);

  const hairline = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="none" stroke="#111111" stroke-width="1" d="M4 4 H28 V28 H4 Z"/></svg>`;
  const thin = await checkLogo(hairline);
  const detail = JSON.stringify({
    px32: thin.px32,
    px16: thin.px16,
    squint: thin.squint,
    advice: thin.advice,
  });
  assert.equal(thin.advice.some((line) => /simplified favicon mark/i.test(line)), true, detail);
  assert.equal(thin.advice.includes(LOGO_HAPPY_QUESTION), true);
  assert.equal(hairline.includes("stroke-width"), true);
});
