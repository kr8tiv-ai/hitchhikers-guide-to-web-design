import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { DIY_SUFFIX, writeDiyPack } from "../src/diy-pack.ts";
import { importDiyFiles } from "../src/diy-import.ts";
import { readAssetTable, type AssetSlot } from "../src/slots.ts";

function tempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-diy-"));
}

function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

function still(id: string, prompt = "a green towel on a dark table"): AssetSlot {
  return {
    id,
    kind: "still",
    model: "grok-imagine-image",
    prompt,
    aspect: "16:9",
    n: 1,
    subjectIsReal: false,
    light: "north window",
  };
}

function video(id: string): AssetSlot {
  return {
    id,
    kind: "video",
    model: "grok-imagine-video-1.5-lite",
    prompt: "a towel folding once",
    aspect: "16:9",
    n: 1,
    subjectIsReal: false,
    light: "",
    seconds: 4,
    resolution: "720p",
  };
}

function countSuffix(text: string): number {
  const haystack = text.toLowerCase();
  let count = 0;
  let from = 0;
  while (from < haystack.length) {
    const at = haystack.indexOf(DIY_SUFFIX, from);
    if (at === -1) break;
    count += 1;
    from = at + DIY_SUFFIX.length;
  }
  return count;
}

test("the DIY pack has one block per slot and the suffix once", async () => {
  const dir = tempDir();
  try {
    const file = await writeDiyPack(dir, [still("hero"), video("loop")]);
    assert.equal(file, path.join(dir, ".hitchhiker", "assets", "diy", "PROMPTS.md"));
    const text = await readFile(file, "utf8");
    assert.equal(countSuffix(text), 2);
    assert.match(text, /## hero/);
    assert.match(text, /## loop/);
    assert.match(text, /Aspect: 16:9/);
    assert.match(text, /Light: north window/);
    assert.match(text, /Light: not set/);
    assert.match(text, /Kind: still/);
    assert.match(text, /Kind: video/);
    assert.match(text, /Seconds: 4/);
    assert.match(text, /Resolution: 720p/);
    assert.equal(text.includes("!"), false);

    const packed = await writeDiyPack(dir, [still("hero", `a chair\n\n${DIY_SUFFIX.toUpperCase()}`)]);
    const again = await readFile(packed, "utf8");
    assert.equal(countSuffix(again), 1);
  } finally {
    cleanup(dir);
  }
});

test("import matches a file name before falling back to order", async () => {
  const dir = tempDir();
  const drop = path.join(dir, "drop");
  await mkdir(drop, { recursive: true });
  const beta = path.join(drop, "beta.png");
  const other = path.join(drop, "other.png");
  await writeFile(beta, Buffer.from("beta-bytes"));
  await writeFile(other, Buffer.from("other-bytes"));
  try {
    const done = await importDiyFiles(dir, [still("first"), still("beta")], [beta, other]);
    assert.equal(path.basename(done[0]?.file ?? ""), "first.png");
    assert.equal(path.basename(done[1]?.file ?? ""), "beta.png");
    assert.equal(await readFile(done[1]?.file ?? "", "utf8"), "beta-bytes");
    assert.equal(await readFile(done[0]?.file ?? "", "utf8"), "other-bytes");
    const rows = readAssetTable(await readFile(path.join(dir, ".hitchhiker", "ASSETS.md"), "utf8"));
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.slot, "first");
    assert.equal(rows[0]?.source, "diy");
    assert.equal(rows[0]?.cost, "0.00");
    assert.equal(rows[0]?.approved, "no");
    assert.equal(rows[0]?.license, "user-supplied");
    assert.equal(rows[0]?.status, "done");
    assert.equal(rows[1]?.slot, "beta");
  } finally {
    cleanup(dir);
  }
});

test("import by order, by case, and ignores extras", async () => {
  const dir = tempDir();
  const drop = path.join(dir, "drop");
  await mkdir(drop, { recursive: true });
  const a = path.join(drop, "a.png");
  const b = path.join(drop, "b.png");
  const extra = path.join(drop, "c.png");
  await writeFile(a, Buffer.from("aaa"));
  await writeFile(b, Buffer.from("bbb"));
  await writeFile(extra, Buffer.from("ccc"));
  try {
    const ordered = await importDiyFiles(dir, [still("alpha"), still("beta")], [a, b]);
    assert.equal(await readFile(ordered[0]?.file ?? "", "utf8"), "aaa");
    assert.equal(await readFile(ordered[1]?.file ?? "", "utf8"), "bbb");

    const upper = path.join(drop, "ALPHA.png");
    await writeFile(upper, Buffer.from("upper"));
    const cased = await importDiyFiles(dir, [still("alpha")], [upper]);
    assert.equal(await readFile(cased[0]?.file ?? "", "utf8"), "upper");

    const crowded = await importDiyFiles(dir, [still("alpha"), still("beta")], [a, b, extra]);
    const imported = path.join(dir, ".hitchhiker", "assets", "diy", "imported");
    const names = readdirSync(imported).sort();
    assert.deepEqual(names, ["alpha.png", "beta.png"]);
    assert.equal(crowded[0]?.source, "diy");
    assert.equal(crowded[0]?.costUsd, 0);
  } finally {
    cleanup(dir);
  }
});

test("a missing file is refused before any copy", async () => {
  const dir = tempDir();
  const drop = path.join(dir, "drop");
  await mkdir(drop, { recursive: true });
  const present = path.join(drop, "present.png");
  await writeFile(present, Buffer.from("keep"));
  const missing = path.join(drop, "missing.png");
  try {
    await assert.rejects(
      () => importDiyFiles(dir, [still("alpha"), still("beta")], [missing, present]),
      /missing\.png/,
    );
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "assets", "diy", "imported")), false);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "ASSETS.md")), false);
  } finally {
    cleanup(dir);
  }
});

test("import keeps a footer under the asset table", async () => {
  const dir = tempDir();
  const drop = path.join(dir, "drop");
  await mkdir(drop, { recursive: true });
  const file = path.join(drop, "alpha.png");
  await writeFile(file, Buffer.from("alpha"));
  const assets = path.join(dir, ".hitchhiker", "ASSETS.md");
  await mkdir(path.dirname(assets), { recursive: true });
  await writeFile(
    assets,
    [
      "# Assets",
      "",
      "| slot | source | file | cost | approved | license | status | grade | job |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      "| keep | upload | keep.png | 0.00 | yes | user-supplied | done |  |  |",
      "",
      "Notes stay.",
      "",
    ].join("\n"),
  );
  try {
    await importDiyFiles(dir, [still("alpha")], [file]);
    const text = await readFile(assets, "utf8");
    assert.match(text, /Notes stay\./);
    const rows = readAssetTable(text);
    assert.equal(rows.map((row) => row.slot).join(","), "keep,alpha");
    assert.equal(rows[1]?.source, "diy");
  } finally {
    cleanup(dir);
  }
});
