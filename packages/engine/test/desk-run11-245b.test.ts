/**
 * 245b. Locking DESIGN.md writes VISUAL-CONSTITUTION.md. A session edit of
 * that file fails the 245a design-drift check. A 244k recovery prompt starts
 * with the constitution.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  clearProjectBuildRunner,
  ensureSiteBuild,
  resetSiteBuildWatch,
  saveQueue,
  setProjectBuildRunner,
  setSiteBuildGate,
  siteBuildSettled,
  type BuildSpawn,
  type BuildSpawnResult,
} from "../src/index.ts";
import { writeDesignLock } from "../src/spec/design-lock.ts";
import { writeDesignMd } from "../src/spec/design-outputs.ts";
import { runPrebuildChecks } from "../src/spec/prebuild-checks.ts";
import { libraryBanHits } from "../src/spec/prompt-bans.ts";
import { constitutionBlock, renderVisualConstitution } from "../src/spec/visual-constitution.ts";
import { removeTempDir } from "./remove-temp.ts";

const BRIEF = "The site helps a visitor book a visit.";
const CAP = 1_200;
const TIMEOUT = 5_000;
const RECOVERY_TIMEOUT = 12_000;

function tempDir(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function bytes(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function section(markdown: string, heading: string): string {
  const lines = markdown.split("\n");
  const target = `## ${heading}`;
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] === target) {
      start = index + 1;
      break;
    }
  }
  if (start < 0) return "";
  const rest: string[] = [];
  for (let index = start; index < lines.length; index += 1) {
    if ((lines[index] ?? "").startsWith("## ")) break;
    rest.push(lines[index] ?? "");
  }
  return rest.join("\n").trim();
}

function labelled(text: string, label: string): string {
  const match = new RegExp(`^${label}: (.+)$`, "m").exec(text);
  return match?.[1] ?? "";
}

function signatureLines(text: string): string[] {
  const match = /^Signature:\n([\s\S]*?)\nDo not:\n/m.exec(text);
  return (match?.[1] ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "));
}

function dontLines(text: string): string[] {
  const match = /^Do not:\n([\s\S]*)$/m.exec(text);
  return (match?.[1] ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "));
}

function familyNames(design: string): string[] {
  const line = /Families:\s*([^\n]+)/.exec(design)?.[1] ?? "";
  const cleaned = line.replace(/\s*Source:.*$/i, "").replace(/\.\s*$/, "");
  const names: string[] = [];
  for (const part of cleaned.split(/,|\band\b/i)) {
    const name = part.trim().replace(/\.$/, "");
    if (name !== "" && !names.includes(name)) names.push(name);
  }
  return names;
}

function colourHexes(design: string): { role: string; hex: string }[] {
  const yaml = design.startsWith("---\n") ? design.slice(4, design.indexOf("\n---\n")) : "";
  const found: { role: string; hex: string }[] = [];
  const colors = /(?:^|\n)colors:\n([\s\S]*?)(?:\n[a-z])/i.exec(`${yaml}\n`);
  const body = colors?.[1] ?? "";
  for (const line of body.split("\n")) {
    const match = /^\s{2}(\w+):\s*"?(#[0-9a-fA-F]{3,8})"?/.exec(line);
    const role = match?.[1];
    const hex = match?.[2];
    if (role === undefined || hex === undefined) continue;
    found.push({ role, hex });
  }
  return found;
}

function withDonts(design: string, lines: readonly string[]): string {
  const next = design.replace(
    /## Do's and Don'ts\n\n[\s\S]*?\n## /,
    `## Do's and Don'ts\n\n${lines.join("\n")}\n\n## `,
  );
  assert.notEqual(next, design);
  return next;
}

function lockProject(dir: string, design = ""): string {
  writeDesignMd(dir, BRIEF);
  if (design !== "") writeFileSync(path.join(dir, "DESIGN.md"), design, "utf8");
  writeDesignLock(dir, "dir-sample");
  return readFileSync(path.join(dir, "DESIGN.md"), "utf8");
}

test("locking DESIGN.md writes a constitution with every part, under 1,200 bytes", { timeout: TIMEOUT }, () => {
  const dir = tempDir("hh-245b-lock-");
  try {
    const design = lockProject(dir);
    const file = path.join(dir, "VISUAL-CONSTITUTION.md");
    const constitution = readFileSync(file, "utf8");
    assert.equal(constitution, renderVisualConstitution(design));
    assert.equal(constitutionBlock(dir), constitution);
    assert.ok(bytes(constitution) <= CAP, `constitution is ${bytes(constitution)} bytes`);
    assert.equal(constitution.includes("!"), false);
    assert.equal(constitution.includes("\u2014"), false);
    assert.deepEqual(libraryBanHits(constitution), []);

    const idea = section(design, "Brand idea").split(/(?<=\.)\s+/)[0] ?? "";
    assert.ok(idea.length > 0);
    assert.match(constitution, /^Brand idea: /m);
    assert.ok(constitution.includes(idea), idea);

    const fonts = labelled(constitution, "Fonts");
    assert.ok(fonts.length > 0);
    assert.equal(fonts.includes("\n"), false);
    for (const name of familyNames(design)) assert.ok(fonts.includes(name), name);

    const colours = labelled(constitution, "Colours");
    assert.equal(colours.includes("\n"), false);
    for (const role of ["paper", "ink", "accent", "muted"] as const) {
      const hex = colourHexes(design).find((entry) => entry.role === role)?.hex ?? "";
      assert.ok(hex !== "", role);
      assert.ok(colours.includes(`${role} ${hex}`), `${role} ${hex}`);
    }

    const spacing = labelled(constitution, "Spacing");
    assert.ok(spacing.length > 0);
    assert.equal(spacing.includes("\n"), false);
    assert.match(spacing, /4px/);
    assert.match(spacing, /96px/);
    assert.equal((constitution.match(/^Spacing: /gm) ?? []).length, 1);

    const ratio = /Ratio:\s*[^\n]+/.exec(section(design, "Typography"))?.[0] ?? "";
    const typeLine = labelled(constitution, "Type");
    assert.ok(ratio.length > 0, "DESIGN.md names a ratio");
    assert.ok(typeLine.includes(ratio), typeLine);
    assert.equal(typeLine.includes("\n"), false);
    assert.match(typeLine, /display/);
    assert.match(typeLine, /body/);
    assert.equal((constitution.match(/^Type: /gm) ?? []).length, 1);

    const motion = labelled(constitution, "Motion");
    assert.match(motion, /Reveal duration/);
    assert.equal(motion.includes("\n"), false);
    assert.equal((constitution.match(/^Motion: /gm) ?? []).length, 1);

    const moments = signatureLines(constitution);
    assert.ok(moments.length >= 1 && moments.length <= 3, moments.join(" | "));
    const hero = section(design, "Signature techniques").split("\n").map((line) => line.trim()).find((line) => line !== "") ?? "";
    assert.ok(hero.length > 0);
    assert.ok(constitution.includes(hero), hero);

    const donts = dontLines(constitution);
    assert.ok(donts.length >= 1 && donts.length <= 10, `${donts.length} do-not lines`);
    assert.ok(donts.some((line) => /lorem/i.test(line)));
    assert.ok(donts.some((line) => /indigo|purple gradient|magnetic/i.test(line)));
    assert.ok(donts.some((line) => /library/i.test(line)));
  } finally {
    removeTempDir(dir);
  }
});

test("a long don't list is trimmed and the constitution stays under 1,200 bytes", { timeout: TIMEOUT }, () => {
  const dir = tempDir("hh-245b-trim-");
  try {
    writeDesignMd(dir, BRIEF);
    const original = readFileSync(path.join(dir, "DESIGN.md"), "utf8");
    const source = Array.from({ length: 16 }, (_, index) => {
      const id = String(index + 1).padStart(2, "0");
      return `Do not use filler glaze-${id} on a headline, a button, a caption, or a card.`;
    });
    const design = withDonts(original, source);
    writeFileSync(path.join(dir, "DESIGN.md"), design, "utf8");
    writeDesignLock(dir, "dir-sample");
    const constitution = readFileSync(path.join(dir, "VISUAL-CONSTITUTION.md"), "utf8");
    const donts = dontLines(constitution);
    assert.ok(bytes(constitution) <= CAP, `constitution is ${bytes(constitution)} bytes`);
    assert.ok(donts.length <= 10, `${donts.length} do-not lines`);
    assert.ok(donts.length < source.length, `${donts.length} kept of ${source.length}`);
    assert.ok(donts.some((line) => line.includes("glaze-01")));
    assert.equal(donts.some((line) => line.includes("glaze-16")), false);
    assert.match(constitution, /^Brand idea: /m);
    assert.match(constitution, /^Fonts: /m);
    assert.match(constitution, /^Colours: /m);
    assert.match(constitution, /^Spacing: /m);
    assert.match(constitution, /^Type: /m);
    assert.match(constitution, /^Motion: /m);
    assert.ok(signatureLines(constitution).length >= 1);
    assert.equal(constitution, renderVisualConstitution(design));
  } finally {
    removeTempDir(dir);
  }
});

test("an edited constitution fails the design-drift check", { timeout: TIMEOUT }, () => {
  const dir = tempDir("hh-245b-drift-");
  try {
    lockProject(dir);
    const file = path.join(dir, "VISUAL-CONSTITUTION.md");
    const constitution = readFileSync(file, "utf8");
    const before = runPrebuildChecks(BRIEF, dir).checks.find((check) => check.id === "design-drift");
    assert.ok(before);
    assert.equal(before.status, "pass", before.detail);

    writeFileSync(file, constitution.replace("Brand idea:", "Brand idea: edited"), "utf8");
    const edited = runPrebuildChecks(BRIEF, dir).checks.find((check) => check.id === "design-drift");
    assert.ok(edited);
    assert.equal(edited.status, "fail");
    assert.match(edited.detail, /VISUAL-CONSTITUTION\.md/);
    assert.match(edited.detail, /expected the render from DESIGN\.md/);

    writeDesignLock(dir, "dir-sample");
    const restored = runPrebuildChecks(BRIEF, dir).checks.find((check) => check.id === "design-drift");
    assert.ok(restored);
    assert.equal(restored.status, "pass", restored.detail);
    assert.equal(readFileSync(file, "utf8"), constitution);
  } finally {
    removeTempDir(dir);
  }
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ok(): BuildSpawnResult {
  return { code: 0, stdout: "", stderr: "", errorCode: null };
}

async function cleanup(dir: string): Promise<void> {
  await Promise.race([siteBuildSettled(dir).catch(() => undefined), delay(8_000)]);
  resetSiteBuildWatch(dir);
  clearProjectBuildRunner(dir);
  setSiteBuildGate(dir, null);
  removeTempDir(dir);
}

function writeText(dir: string, files: Record<string, string>): void {
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, text, "utf8");
  }
}

function page(body: string): string {
  return `<!doctype html><html><head><title>Farm | Example Site</title><meta name="description" content="Ask about this farm."></head><body>${body}</body></html>`;
}

function promptFor(id: string, requirement: string, files: string, title: string): string {
  return [
    "## Task",
    "",
    `Prompt ${id}. ${title}`,
    `Files: ${files}`,
    `Requirements: ${requirement}`,
    "",
    "## Design language",
    "",
    "Example only.",
    "",
  ].join("\n");
}

test("a 244k recovery prompt starts with the constitution text", { timeout: RECOVERY_TIMEOUT }, async () => {
  const dir = tempDir("hh-245b-recovery-");
  const sessions: string[] = [];
  let sawQueued = false;
  const counts = new Map<string, number>();
  const spawn: BuildSpawn = (request) => {
    const seen = (counts.get(request.promptId) ?? 0) + 1;
    counts.set(request.promptId, seen);
    if (request.promptId === "002") {
      const file = request.args[request.args.indexOf("--prompt-file") + 1] ?? "";
      sessions.push(readFileSync(file, "utf8"));
      if (seen === 2) sawQueued = true;
    }
    return { pid: 245201, done: Promise.resolve(ok()) };
  };
  try {
    lockProject(dir);
    const constitution = readFileSync(path.join(dir, "VISUAL-CONSTITUTION.md"), "utf8").trim();
    assert.ok(constitution.startsWith("# Visual constitution"));
    mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
    writeFileSync(path.join(dir, ".hitchhiker", "project.json"), `${JSON.stringify({ name: "Example Site" })}\n`, "utf8");
    writeText(dir, {
      ".hitchhiker/prompts/001.md": promptFor("001", "REQ-PAGE-home", "src/pages/index.astro", "Build the home page."),
      ".hitchhiker/prompts/002.md": promptFor("002", "REQ-PAGE-guide", "src/pages/guide.astro", "Build the guide page."),
      "src/pages/index.astro": "<p>Ask about this farm.</p>\n",
      "src/pages/guide.astro": "<p>The guide page introduces the visit.</p>\n",
    });
    writeText(path.join(dir, "dist"), {
      "index.html": page("<p>Ask about this farm.</p>"),
      "guide/index.html": page("<p>Messages go to hello@paradisefound.example</p>"),
    });
    setProjectBuildRunner(dir, spawn);
    await saveQueue(dir, {
      items: [
        { id: "001", kind: "build", status: "queued" },
        { id: "002", kind: "build", status: "queued" },
      ],
    });
    await ensureSiteBuild(dir);
    assert.equal(sawQueued, true);
    const recovery = sessions.find((text) => text.includes("Placeholder contact failed"));
    assert.ok(recovery, sessions.map((text) => text.slice(0, 80)).join(" || "));
    assert.ok(recovery.startsWith(constitution), recovery.slice(0, 80));
    assert.match(recovery, /Fix before you finish/);
  } finally {
    await cleanup(dir);
  }
});
