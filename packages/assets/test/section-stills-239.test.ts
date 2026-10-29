import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { writeSectionStillPlan, type PlannedPage } from "@hitchhiker/engine";
import { RealSubjectError } from "../src/imagine-run.ts";
import { generateSectionStills, resolveDeskProvider, type MediaProvider } from "../src/section-generate.ts";
import { removeTempDir } from "./remove-temp.ts";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const SECRET = "xai-test-key-should-not-appear";

function tempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-section-stills-"));
}

function pages(): PlannedPage[] {
  return [
    { id: "home", title: "Home", route: "/", sections: ["hero", "farms"], contentSources: ["src/data/home.ts"] },
    { id: "visit", title: "Visit", route: "/visit", sections: ["about", "visit"], contentSources: ["src/data/visit.ts"] },
  ];
}

function brief(): string {
  return ["# Site Brief", "", "A supplied hero image is already in the project.", "", "## Vibe", "", "Calm and warm.", ""].join("\n");
}

function treeText(dir: string): string {
  const files = [
    path.join(dir, "src", "data", "credits.ts"),
    path.join(dir, "src", "data", "pictures.ts"),
    path.join(dir, ".hitchhiker", "assets", "fallback.md"),
    path.join(dir, ".hitchhiker", "assets", "generated-count.json"),
    path.join(dir, ".hitchhiker", "ASSETS.md"),
    path.join(dir, ".hitchhiker", "assets", "slots.json"),
  ];
  return files.map((file) => (existsSync(file) ? readFileSync(file, "utf8") : "")).join("\n");
}

test("generation writes each still as it arrives, with pictures and credits, and no key", async () => {
  const dir = tempDir();
  try {
    mkdirSync(path.join(dir, "public"), { recursive: true });
    writeFileSync(path.join(dir, "public", "field.jpg"), "owner-bytes");
    const plan = writeSectionStillPlan(dir, brief(), [], pages());
    assert.equal(plan.kept.length, 1);
    assert.equal(plan.slots.length, 3);
    assert.equal(plan.slots.some((slot) => slot.id === "hero"), false);
    let calls = 0;
    const provider: MediaProvider = {
      async generateImage() {
        calls += 1;
        if (calls === 2) {
          assert.equal(existsSync(path.join(dir, "src", "assets", "generated", "farms.png")), true);
          assert.equal(existsSync(path.join(dir, ".hitchhiker", "assets", "generated", "farms.png")), true);
          const count = JSON.parse(readFileSync(path.join(dir, ".hitchhiker", "assets", "generated-count.json"), "utf8")) as { count: number };
          assert.equal(count.count, 1);
        }
        return [{ b64: Buffer.from(PNG).toString("base64") }];
      },
    };
    const result = await generateSectionStills(dir, provider);
    assert.equal(calls, 3);
    assert.equal(result.count, 3);
    assert.deepEqual(result.fallbacks, []);
    const pictures = readFileSync(path.join(dir, "src", "data", "pictures.ts"), "utf8");
    const credits = readFileSync(path.join(dir, "src", "data", "credits.ts"), "utf8");
    for (const width of [640, 1280, 1920]) assert.match(pictures, new RegExp(String(width)));
    assert.equal(pictures.includes("2560"), false);
    assert.match(pictures, /avif/);
    assert.match(pictures, /webp/);
    assert.match(pictures, /"id": "hero"/);
    assert.match(pictures, /"eager": true/);
    assert.match(pictures, /"preload": true/);
    assert.match(credits, /Concept image, generated with Grok Imagine/);
    assert.match(credits, /"origin": "generated"/);
    assert.match(credits, /"origin": "owner"/);
    assert.match(credits, /grok-imagine-image-2\.0/);
    assert.match(credits, /not a real listing/);
    assert.equal(credits.includes("photo of the farm"), false);
    assert.match(credits, /trainedAlgorithmicMedia/);
    const blob = treeText(dir);
    assert.equal(blob.includes(SECRET), false);
    assert.equal(blob.includes("XAI_API_KEY"), false);
    assert.equal(blob.includes("keychain"), false);
    assert.equal(/TODO/i.test(blob), false);
  } finally {
    removeTempDir(dir);
  }
});

test("a real subject is refused before the provider runs", async () => {
  const dir = tempDir();
  try {
    mkdirSync(path.join(dir, ".hitchhiker", "assets"), { recursive: true });
    writeFileSync(
      path.join(dir, ".hitchhiker", "assets", "slots.json"),
      `${JSON.stringify({
        slots: [
          {
            id: "portrait",
            kind: "still",
            model: "grok-imagine-image-2.0",
            prompt: "a concept still",
            aspect: "3:2",
            n: 1,
            subjectIsReal: true,
            light: "north window",
            replaces: "portrait",
          },
        ],
      })}\n`,
    );
    let called = false;
    const provider: MediaProvider = {
      async generateImage() {
        called = true;
        return [{ b64: Buffer.from(PNG).toString("base64") }];
      },
    };
    await assert.rejects(() => generateSectionStills(dir, provider), (error: unknown) => error instanceof RealSubjectError);
    assert.equal(called, false);
  } finally {
    removeTempDir(dir);
  }
});

test("a failed provider writes a composition and no TODO", async () => {
  const dir = tempDir();
  try {
    mkdirSync(path.join(dir, "public"), { recursive: true });
    writeFileSync(path.join(dir, "public", "field.jpg"), "owner-bytes");
    writeSectionStillPlan(dir, brief(), [], pages());
    const provider: MediaProvider = {
      async generateImage() {
        throw new Error("Imagine is not signed in.");
      },
    };
    const result = await generateSectionStills(dir, provider);
    assert.equal(result.count, 0);
    assert.equal(result.fallbacks.length, 3);
    const note = readFileSync(path.join(dir, ".hitchhiker", "assets", "fallback.md"), "utf8");
    assert.match(note, /art-directed composition/);
    assert.equal(existsSync(path.join(dir, "src", "assets", "generated", "farms.svg")), true);
    const blob = `${note}\n${readFileSync(path.join(dir, "src", "assets", "generated", "farms.svg"), "utf8")}`;
    assert.equal(/TODO/i.test(blob), false);
    assert.equal(blob.includes("placeholder"), false);
  } finally {
    removeTempDir(dir);
  }
});

test("open-license stock is used before a composition", async () => {
  const dir = tempDir();
  try {
    mkdirSync(path.join(dir, "public"), { recursive: true });
    writeFileSync(path.join(dir, "public", "meadow.jpg"), "stock-bytes");
    mkdirSync(path.join(dir, ".hitchhiker", "assets"), { recursive: true });
    writeFileSync(
      path.join(dir, ".hitchhiker", "assets", "slots.json"),
      `${JSON.stringify({
        slots: [
          {
            id: "farms",
            kind: "still",
            model: "grok-imagine-image-2.0",
            prompt: "Subject: a concept still.\nArt direction: warm film.",
            aspect: "3:2",
            n: 1,
            subjectIsReal: false,
            light: "warm",
          },
        ],
      })}\n`,
    );
    writeFileSync(
      path.join(dir, ".hitchhiker", "ASSETS.md"),
      [
        "| slot | source | file | cost | approved | license | status | grade | job |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
        "| meadow | upload | public/meadow.jpg | 0 | yes | CC0 | ready |  |  |",
        "",
      ].join("\n"),
    );
    const result = await generateSectionStills(dir, {
      async generateImage() {
        throw new Error("Imagine is not signed in.");
      },
    });
    assert.equal(result.count, 0);
    const note = readFileSync(path.join(dir, ".hitchhiker", "assets", "fallback.md"), "utf8");
    assert.match(note, /open-license stock/);
    assert.match(note, /public\/meadow\.jpg/);
    assert.equal(/TODO/i.test(note), false);
    assert.equal(existsSync(path.join(dir, "src", "assets", "generated", "farms.svg")), false);
  } finally {
    removeTempDir(dir);
  }
});

test("the desk chain does not call a billed provider unless that provider is enabled", async () => {
  const dir = tempDir();
  try {
    mkdirSync(path.join(dir, "public"), { recursive: true });
    writeFileSync(path.join(dir, "public", "field.jpg"), "owner-bytes");
    writeSectionStillPlan(dir, brief(), [], pages());
    let fetched = false;
    const provider = resolveDeskProvider(dir, {
      spawn: async () => ({ status: 1, stdout: "", stderr: "no grok", timedOut: false, errorCode: null }),
      fetchImpl: async () => {
        fetched = true;
        throw new Error(SECRET);
      },
      key: SECRET,
    });
    const result = await generateSectionStills(dir, provider);
    assert.equal(fetched, false);
    assert.equal(result.count, 0);
    assert.match(result.fallbacks[0] ?? "", /art-directed composition/);
    assert.equal(treeText(dir).includes(SECRET), false);
  } finally {
    removeTempDir(dir);
  }
});
