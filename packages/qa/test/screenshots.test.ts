import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { REVIEW_WIDTHS, captureAll } from "../src/screenshots.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

test("captureAll requests 375, 768, 1440, and 1920 in order", async () => {
  const seen: number[] = [];
  const shots = await captureAll(async (width) => {
    seen.push(width);
    return Buffer.from("png");
  });

  assert.deepEqual(seen, [...REVIEW_WIDTHS]);
  assert.deepEqual([...REVIEW_WIDTHS], [375, 768, 1440, 1920]);
  assert.deepEqual(
    Object.keys(shots).map((key) => Number(key)),
    [...REVIEW_WIDTHS],
  );
  for (const width of REVIEW_WIDTHS) {
    const shot = shots[width];
    assert.ok(shot);
    assert.ok(shot.length > 0);
    assert.equal(shot.toString(), "png");
  }
});

test("an empty buffer at 375 throws and does not continue", async () => {
  const seen: number[] = [];
  await assert.rejects(
    () =>
      captureAll(async (width) => {
        seen.push(width);
        if (width === 375) return Buffer.alloc(0);
        return Buffer.from("png");
      }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /375/);
      return true;
    },
  );
  assert.deepEqual(seen, [375]);
});

test("an empty buffer at a later width stops the run", async () => {
  const seen: number[] = [];
  await assert.rejects(
    () =>
      captureAll(async (width) => {
        seen.push(width);
        if (width === 1440) return Buffer.alloc(0);
        return Buffer.from("png");
      }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /1440/);
      return true;
    },
  );
  assert.deepEqual(seen, [375, 768, 1440]);
});

test("a thrown opener names the width and does not continue", async () => {
  const seen: number[] = [];
  await assert.rejects(
    () =>
      captureAll(async (width) => {
        seen.push(width);
        if (width === 768) throw new Error("viewport closed");
        return Buffer.from("png");
      }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /768/);
      assert.match(err.message, /viewport closed/);
      assert.equal(err.cause instanceof Error, true);
      return true;
    },
  );
  assert.deepEqual(seen, [375, 768]);
});

test("a non-Error throw still names the width", async () => {
  await assert.rejects(
    () =>
      captureAll(async (width) => {
        if (width === 375) throw "no page";
        return Buffer.from("png");
      }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /375/);
      assert.match(err.message, /no page/);
      return true;
    },
  );
});

test("the capture modules do not import a browser", () => {
  const files = [
    path.join(here, "..", "src", "screenshots.ts"),
    path.join(here, "..", "src", "visual-policy.ts"),
    path.join(here, "screenshots.test.ts"),
    path.join(here, "visual-policy.test.ts"),
  ];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /from\s+["']playwright["']/);
    assert.doesNotMatch(source, /import\s*\(\s*["']playwright["']\s*\)/);
  }
});
