import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  BRAND_SECTIONS,
  BrandApprovalError,
  applyStatus,
  approveSection,
  redoSection,
} from "../src/brand/approve.ts";
import { BRAND_WORD_CAP, compileBrand } from "../src/brand/brain.ts";
import type { BrandParts } from "../src/brand/brain.ts";
import { LockHeld, withStateLock } from "../src/lock.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(here, "..", "src", "brand", "approve.ts");

function smallParts(): BrandParts {
  return {
    why: {
      siteWhy: "The stall exists so regulars can find the tea.",
      brandWhy:
        "A night regular comes for a tin of tea because the stall exists so regulars can find the tea.",
      status: "ASSUMED",
      warnings: [],
      siteTruncated: false,
    },
    story: {
      archetype: "caretaker",
      archetypeStatus: "ASSUMED",
      positioning: "For a night regular, Night Stall is the tin of tea that keeps the stall open.",
      words25:
        "A night regular comes for a tin of tea because the stall exists so regulars can find the tea.",
      words100: "The answers give this: a night regular.",
      words300: "The long stall story stays short in this fixture.",
      holes: [],
    },
    teardownMarkdown: "Sameness was not computed.",
    voiceMarkdown: "Plain speech. Short sentences.",
    cssVars: ":root {\n  --paper: #f4f0e6;\n  --ink: #1c1915;\n  --signal: #9a3412;\n}",
    imageryMarkdown: "Photograph the work that already exists.",
    evidence: { quotes: [], awards: [], numbers: [] },
  };
}

function countWords(value: string): number {
  const trimmed = value.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}

function brandFile(dir: string): string {
  return path.join(dir, ".hitchhiker", "BRAND.md");
}

function approvalFile(dir: string): string {
  return path.join(dir, ".hitchhiker", "brand-approval.json");
}

function tempProject(): { dir: string; markdown: string } {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-approve-"));
  const markdown = compileBrand(smallParts()).markdown;
  mkdirSync(path.join(dir, ".hitchhiker"));
  writeFileSync(brandFile(dir), markdown, "utf8");
  return { dir, markdown };
}

function discard(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

function readFlags(dir: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(approvalFile(dir), "utf8"));
  assert.ok(parsed !== null && typeof parsed === "object" && !Array.isArray(parsed));
  return parsed as Record<string, unknown>;
}

function allTrue(): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const section of BRAND_SECTIONS) flags[section] = true;
  return flags;
}

test("applyStatus throws when the Status line is missing", () => {
  assert.throws(
    () => applyStatus("# Purpose\n\nThe stall stays open.\n", allTrue()),
    (error: unknown) => {
      assert.ok(error instanceof BrandApprovalError);
      assert.match(error.message, /missing a Status line/);
      return true;
    },
  );
  assert.throws(
    () => applyStatus("status: draft\n", allTrue()),
    (error: unknown) => error instanceof BrandApprovalError,
  );
});

test("partial approval stays draft", async () => {
  const { dir } = tempProject();
  try {
    const result = await approveSection(dir, "purpose");
    assert.equal(result.allApproved, false);
    const markdown = readFileSync(brandFile(dir), "utf8");
    assert.match(markdown, /^Status: draft$/m);
    assert.equal(markdown.includes("Status: approved"), false);
    const flags = readFlags(dir);
    assert.deepEqual(Object.keys(flags), [...BRAND_SECTIONS]);
    assert.equal(flags.purpose, true);
    for (const section of BRAND_SECTIONS) {
      if (section === "purpose") continue;
      assert.equal(flags[section], false);
    }
  } finally {
    discard(dir);
  }
});

test("full approval flips the status line compileBrand wrote", async () => {
  const { dir, markdown } = tempProject();
  try {
    assert.match(markdown, /^Status: draft$/m);
    let last = { allApproved: false };
    for (const section of BRAND_SECTIONS) {
      last = await approveSection(dir, section);
      const current = readFileSync(brandFile(dir), "utf8");
      if (section === "neighbors") {
        assert.equal(last.allApproved, true);
        assert.match(current, /^Status: approved$/m);
      } else {
        assert.equal(last.allApproved, false);
        assert.match(current, /^Status: draft$/m);
      }
    }
    const saved = readFileSync(brandFile(dir), "utf8");
    assert.equal(saved, markdown.replace(/^Status: draft$/m, "Status: approved"));
    assert.match(saved, /Why status:/);
    assert.equal(saved.includes("\r"), false);
    const flags = readFlags(dir);
    for (const section of BRAND_SECTIONS) assert.equal(flags[section], true);
    const names = readFileSync(approvalFile(dir), "utf8");
    assert.equal(names.includes("\r"), false);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "state.lock")), false);
  } finally {
    discard(dir);
  }
});

test("redo clears voice only and does not delete BRAND.md", async () => {
  const { dir, markdown } = tempProject();
  try {
    for (const section of BRAND_SECTIONS) await approveSection(dir, section);
    const approved = readFileSync(brandFile(dir), "utf8");
    await redoSection(dir, "voice");
    assert.equal(existsSync(brandFile(dir)), true);
    const saved = readFileSync(brandFile(dir), "utf8");
    assert.equal(saved, approved.replace(/^Status: approved$/m, "Status: draft"));
    assert.equal(saved.includes(markdown.slice(markdown.indexOf("## Voice"))), true);
    const flags = readFlags(dir);
    assert.equal(flags.voice, false);
    for (const section of BRAND_SECTIONS) {
      if (section === "voice") continue;
      assert.equal(flags[section], true);
    }
  } finally {
    discard(dir);
  }
});

test("approving twice is idempotent", async () => {
  const { dir } = tempProject();
  try {
    await approveSection(dir, "logo");
    const jsonOnce = readFileSync(approvalFile(dir), "utf8");
    const markdownOnce = readFileSync(brandFile(dir), "utf8");
    const again = await approveSection(dir, "logo");
    assert.equal(again.allApproved, false);
    assert.equal(readFileSync(approvalFile(dir), "utf8"), jsonOnce);
    assert.equal(readFileSync(brandFile(dir), "utf8"), markdownOnce);

    for (const section of BRAND_SECTIONS) await approveSection(dir, section);
    const jsonAll = readFileSync(approvalFile(dir), "utf8");
    const markdownAll = readFileSync(brandFile(dir), "utf8");
    assert.match(markdownAll, /^Status: approved$/m);
    const repeat = await approveSection(dir, "logo");
    assert.equal(repeat.allApproved, true);
    assert.equal(readFileSync(approvalFile(dir), "utf8"), jsonAll);
    assert.equal(readFileSync(brandFile(dir), "utf8"), markdownAll);
  } finally {
    discard(dir);
  }
});

test("unknown section gsap throws and stays out of the file", async () => {
  const empty = mkdtempSync(path.join(os.tmpdir(), "hh-approve-"));
  const { dir } = tempProject();
  try {
    await assert.rejects(
      () => approveSection(empty, "gsap"),
      (error: unknown) => {
        assert.ok(error instanceof BrandApprovalError);
        assert.match(error.message, /Unknown brand section: gsap/);
        return true;
      },
    );
    assert.equal(existsSync(path.join(empty, ".hitchhiker")), false);

    const seeded = {
      purpose: false,
      voice: true,
      tokens: false,
      imagery: false,
      logo: false,
      neighbors: false,
      gsap: true,
    };
    writeFileSync(approvalFile(dir), `${JSON.stringify(seeded, null, 2)}\n`, "utf8");
    const before = readFileSync(approvalFile(dir), "utf8");
    await assert.rejects(() => approveSection(dir, "gsap"), /Unknown brand section: gsap/);
    assert.equal(readFileSync(approvalFile(dir), "utf8"), before);

    await approveSection(dir, "purpose");
    const flags = readFlags(dir);
    assert.equal("gsap" in flags, false);
    assert.deepEqual(Object.keys(flags), [...BRAND_SECTIONS]);
    assert.equal(flags.purpose, true);
    assert.equal(flags.voice, true);
  } finally {
    discard(empty);
    discard(dir);
  }
});

test("section names are case-sensitive", async () => {
  const { dir } = tempProject();
  try {
    await approveSection(dir, "voice");
    const before = readFileSync(approvalFile(dir), "utf8");
    const brandBefore = readFileSync(brandFile(dir), "utf8");
    await assert.rejects(() => approveSection(dir, "Voice"), /Unknown brand section: Voice/);
    await assert.rejects(() => redoSection(dir, "VOICE"), /Unknown brand section: VOICE/);
    assert.equal(readFileSync(approvalFile(dir), "utf8"), before);
    assert.equal(readFileSync(brandFile(dir), "utf8"), brandBefore);
  } finally {
    discard(dir);
  }
});

test("a corrupt brand-approval.json throws and is not deleted", async () => {
  const { dir } = tempProject();
  try {
    const junk = "{not json";
    writeFileSync(approvalFile(dir), junk, "utf8");
    const brandBefore = readFileSync(brandFile(dir), "utf8");
    await assert.rejects(
      () => approveSection(dir, "purpose"),
      (error: unknown) => {
        assert.ok(error instanceof BrandApprovalError);
        assert.match(error.message, /not valid JSON/);
        return true;
      },
    );
    assert.equal(existsSync(approvalFile(dir)), true);
    assert.equal(readFileSync(approvalFile(dir), "utf8"), junk);
    assert.equal(readFileSync(brandFile(dir), "utf8"), brandBefore);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "state.lock")), false);

    const typed = `${JSON.stringify({
      purpose: "yes",
      voice: false,
      tokens: false,
      imagery: false,
      logo: false,
      neighbors: false,
    })}\n`;
    writeFileSync(approvalFile(dir), typed, "utf8");
    await assert.rejects(() => redoSection(dir, "voice"), /purpose is not a boolean/);
    assert.equal(readFileSync(approvalFile(dir), "utf8"), typed);
    assert.equal(readFileSync(brandFile(dir), "utf8"), brandBefore);
  } finally {
    discard(dir);
  }
});

test("logo can be approved without an svg, which records no logo yet", async () => {
  const { dir } = tempProject();
  try {
    const source = readFileSync(sourcePath, "utf8");
    assert.equal(source.includes(".svg"), false);
    const result = await approveSection(dir, "logo");
    assert.equal(result.allApproved, false);
    assert.equal(readFlags(dir).logo, true);
    assert.match(readFileSync(brandFile(dir), "utf8"), /^Status: draft$/m);
    assert.equal(existsSync(path.join(dir, "logo.svg")), false);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "logo.svg")), false);
  } finally {
    discard(dir);
  }
});

test("a boolean edited in memory does not relabel the draft on disk", async () => {
  const { dir } = tempProject();
  try {
    await approveSection(dir, "purpose");
    const onDisk = readFlags(dir);
    const relabeled = applyStatus(readFileSync(brandFile(dir), "utf8"), allTrue());
    assert.match(relabeled, /^Status: approved$/m);
    assert.match(readFileSync(brandFile(dir), "utf8"), /^Status: draft$/m);
    assert.equal(onDisk.purpose, true);
    assert.equal(onDisk.voice, false);
    assert.equal(readFlags(dir).voice, false);
  } finally {
    discard(dir);
  }
});

test("a hand-edited approved line is forced back to draft", async () => {
  const { dir, markdown } = tempProject();
  try {
    const edited = markdown.replace(/^Status: draft$/m, "Status: approved");
    writeFileSync(brandFile(dir), edited, "utf8");
    const result = await approveSection(dir, "imagery");
    assert.equal(result.allApproved, false);
    const saved = readFileSync(brandFile(dir), "utf8");
    assert.equal(saved, markdown);
    assert.match(saved, /^Status: draft$/m);
  } finally {
    discard(dir);
  }
});

test("a missing Status line throws and writes nothing", async () => {
  const { dir } = tempProject();
  try {
    const stripped = "# Purpose\n\nThe stall stays open.\n";
    writeFileSync(brandFile(dir), stripped, "utf8");
    await assert.rejects(() => approveSection(dir, "neighbors"), /missing a Status line/);
    assert.equal(existsSync(approvalFile(dir)), false);
    assert.equal(readFileSync(brandFile(dir), "utf8"), stripped);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "state.lock")), false);
  } finally {
    discard(dir);
  }
});

test("approveSection and redoSection use the state lock", async () => {
  const source = readFileSync(sourcePath, "utf8");
  assert.match(source, /withStateLock/);
  assert.match(source, /replaceViaTemp/);
  const { dir } = tempProject();
  try {
    const before = readFileSync(brandFile(dir), "utf8");
    await withStateLock(dir, async () => {
      await assert.rejects(
        () => approveSection(dir, "purpose"),
        (error: unknown) => {
          assert.ok(error instanceof LockHeld);
          return true;
        },
      );
      await assert.rejects(
        () => redoSection(dir, "voice"),
        (error: unknown) => error instanceof LockHeld,
      );
      assert.equal(existsSync(approvalFile(dir)), false);
      assert.equal(readFileSync(brandFile(dir), "utf8"), before);
    });
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "state.lock")), false);
    assert.equal(existsSync(approvalFile(dir)), false);
  } finally {
    discard(dir);
  }
});

test("phase end covers brand brain length only by calling compileBrand on a small fixture and then applyStatus", () => {
  const compiled = compileBrand(smallParts());
  assert.ok(compiled.words <= BRAND_WORD_CAP);
  assert.equal(compiled.words, countWords(compiled.markdown));
  assert.match(compiled.markdown, /^Status: draft$/m);
  const partial: Record<string, boolean> = {};
  for (const section of BRAND_SECTIONS) partial[section] = section !== "neighbors";
  const stillDraft = applyStatus(compiled.markdown, partial);
  assert.match(stillDraft, /^Status: draft$/m);
  assert.equal(countWords(stillDraft), compiled.words);
  const approved = applyStatus(compiled.markdown, allTrue());
  assert.equal(approved, compiled.markdown.replace(/^Status: draft$/m, "Status: approved"));
  assert.equal(countWords(approved), compiled.words);
  assert.ok(countWords(approved) <= BRAND_WORD_CAP);
  assert.match(approved, /Why status:/);
  assert.match(approved, /assumed until approved/);
});

test("Babel Fish approval does not launch Deep Thought", () => {
  const source = readFileSync(sourcePath, "utf8");
  assert.equal(source.includes("brain.ts"), false);
  assert.equal(/compileBrand\s*\(/.test(source), false);
  assert.equal(source.includes("child_process"), false);
  assert.equal(/imagine|image_gen|prd\.ts|site-prompt|prompt generator/i.test(source), false);
  assert.deepEqual(
    [...BRAND_SECTIONS],
    ["purpose", "voice", "tokens", "imagery", "logo", "neighbors"],
  );
});
