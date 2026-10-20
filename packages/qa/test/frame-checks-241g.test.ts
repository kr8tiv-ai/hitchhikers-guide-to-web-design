import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FRAME_AREAS,
  FRAME_MARGIN_TOLERANCE_PX,
  FRAME_WIDTHS,
  judgeFrameLayout,
  measureFrameLayout,
  type FrameLayout,
} from "../src/detail-pass.ts";
import { withChromium } from "../src/playwright-opener.ts";

const POSTER =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function layout(overrides: Partial<FrameLayout> = {}): FrameLayout {
  return {
    viewportWidth: 1440,
    viewportHeight: 900,
    titleTop: 48,
    titleBottom: 120,
    contentLeft: 24,
    contentRight: 1416,
    sections: [],
    ...overrides,
  };
}

function area(checks: { area: string; ok: boolean; note: string }[], name: string) {
  const found = checks.find((check) => check.area === name);
  assert.ok(found, name);
  return found;
}

test("the title, the margins, and a dead blank stretch are measured outcomes", () => {
  assert.equal(FRAME_MARGIN_TOLERANCE_PX, 4);
  assert.deepEqual(FRAME_WIDTHS, [375, 768, 1440]);
  assert.deepEqual(FRAME_AREAS, ["frame-title", "frame-margins", "frame-blank"]);

  const below = judgeFrameLayout(layout({ titleTop: 940, titleBottom: 1020 }));
  assert.equal(area(below, "frame-title").ok, false);
  assert.match(area(below, "frame-title").note, /first viewport/);

  const missing = judgeFrameLayout(layout({ titleTop: null, titleBottom: null }));
  assert.equal(area(missing, "frame-title").ok, false);

  const uneven = judgeFrameLayout(layout({ contentLeft: 10, contentRight: 1400 }));
  assert.equal(area(uneven, "frame-margins").ok, false);
  assert.match(area(uneven, "frame-margins").note, /tolerance is 4/);

  const even = judgeFrameLayout(layout({ contentLeft: 10, contentRight: 1428 }));
  assert.equal(area(even, "frame-margins").ok, true);

  const dead = judgeFrameLayout(
    layout({
      sections: [{ height: 901, empty: true, hasTitle: false, hasPoster: false }],
    }),
  );
  assert.equal(area(dead, "frame-blank").ok, false);
  assert.match(area(dead, "frame-blank").note, /empty section/);

  const hero = judgeFrameLayout(
    layout({
      sections: [{ height: 1600, empty: true, hasTitle: true, hasPoster: true }],
    }),
  );
  assert.equal(area(hero, "frame-blank").ok, true);
  assert.match(area(hero, "frame-blank").note, /poster/);

  const short = judgeFrameLayout(
    layout({
      sections: [{ height: 900, empty: true, hasTitle: false, hasPoster: false }],
    }),
  );
  assert.equal(area(short, "frame-blank").ok, true);

  for (const checks of [below, uneven, dead, hero]) {
    for (const check of checks) {
      assert.equal(check.note.includes("!"), false, check.note);
      assert.equal(check.note.includes("\u2014"), false, check.note);
    }
  }
});

test("frame checks use element bounds at 375, 768, and 1440", { timeout: 120_000 }, async () => {
  const good = `<!doctype html><html><body style="margin:0">
    <section style="position:relative;height:140vh;margin:0">
      <img alt="" src="${POSTER}" style="display:block;width:100%;height:100%;object-fit:cover" />
      <h1 style="position:absolute;top:32px;left:24px;right:24px;margin:0">Visit the studio.</h1>
    </section>
    <main style="padding:24px"><p style="margin:0">A line under the hero.</p></main>
  </body></html>`;
  const bad = `<!doctype html><html><body style="margin:0">
    <main style="padding:10px 80px 10px 10px;margin-top:120vh"><h1 style="margin:0">Below the fold.</h1></main>
    <section style="height:150vh"></section>
  </body></html>`;

  await withChromium(async (browser) => {
    const page = await browser.newPage();
    try {
      for (const width of FRAME_WIDTHS) {
        const height = width < 768 ? 812 : 900;
        await page.setViewportSize({ width, height });
        await page.setContent(good, { waitUntil: "load" });
        const passed = judgeFrameLayout(await measureFrameLayout(page));
        assert.deepEqual(
          passed.map((check) => check.area),
          [...FRAME_AREAS],
        );
        for (const check of passed) {
          assert.equal(check.ok, true, `${width} ${check.area}: ${check.note}`);
          assert.equal(check.note.includes("!"), false);
        }
        await page.setContent(bad, { waitUntil: "load" });
        const failed = judgeFrameLayout(await measureFrameLayout(page));
        for (const name of FRAME_AREAS) {
          assert.equal(area(failed, name).ok, false, `${width} ${name}: ${area(failed, name).note}`);
        }
      }
    } finally {
      await page.close();
    }
  });
});
