import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { exportPdf, ExportPdfError } from "../src/exports/prd-pdf.ts";
import { extractPdfText } from "../src/ingest.ts";

const BRAND = "Northglass Studio";
const VOICE = "Direct, not rude.";
const PURPOSE = "Northglass Studio cuts architectural glass.";
const NEIGHBOR = "Do not print this neighbor line.";
const SECRET = "Secret unapproved line stays out.";
const TAGLINE = "Glass that keeps the weather out.";

test("agency PDFs are written, named, and withhold unapproved sections", { timeout: 180_000 }, async () => {
  const projectDir = mkdtempSync(path.join(tmpdir(), "hh-exports-"));
  try {
    seed(projectDir);
    const prd = await exportPdf("prd", projectDir, {
      paper: "A4",
      agency: { name: "Harbor Desk", client: "Northglass Studio" },
    });
    const kit = await exportPdf("brand-kit", projectDir, { paper: "Letter" });
    assert.equal(path.basename(prd), "PRD.pdf");
    assert.equal(path.basename(kit), "brand-kit.pdf");
    assert.equal(prd, path.join(projectDir, ".hitchhiker", "exports", "PRD.pdf"));
    const prdBytes = readFileSync(prd);
    const kitBytes = readFileSync(kit);
    assert.ok(prdBytes.length > 1000);
    assert.ok(kitBytes.length > 1000);
    assert.equal(prdBytes.subarray(0, 5).toString("latin1"), "%PDF-");
    assert.equal(kitBytes.subarray(0, 5).toString("latin1"), "%PDF-");
    assert.ok(mediaWidth(prdBytes) < 600, "A4 width");
    assert.ok(mediaWidth(kitBytes) > 600, "Letter width");

    const prdText = await pdfText(prd, projectDir);
    const kitText = await pdfText(kit, projectDir);
    assert.ok(has(prdText, BRAND), prdText.slice(0, 500));
    assert.ok(has(kitText, BRAND), kitText.slice(0, 500));
    assert.ok(has(prdText, "Harbor Desk"), prdText.slice(0, 500));
    assert.ok(has(prdText, "Prepared for"), prdText.slice(0, 800));
    assert.ok(has(prdText, "cuts architectural glass"), prdText.slice(0, 800));
    assert.equal(has(kitText, "Prepared for"), false);
    assert.equal(has(kitText, "Harbor Desk"), false);
    assert.ok(has(kitText, VOICE), kitText.slice(0, 800));
    assert.ok(has(kitText, PURPOSE), kitText.slice(0, 800));
    assert.ok(has(kitText, TAGLINE), kitText.slice(0, 800));
    assert.equal(kitText.includes(NEIGHBOR), false);
    assert.equal(kitText.includes(SECRET), false);
    assert.equal(kitText.includes("Status:"), false);

    const covered = await exportPdf("brand-kit", projectDir, {
      paper: "A4",
      agency: { name: "Harbor Desk", client: "Ada North" },
    });
    const coveredText = await pdfText(covered, projectDir);
    const coveredExtract = await extractPdfText(covered, { root: projectDir });
    assert.ok(coveredExtract.pages >= 2, `pages ${coveredExtract.pages}`);
    assert.ok(has(coveredText, "Prepared for Ada North"), coveredText.slice(0, 800));
    assert.ok(mediaWidth(readFileSync(covered)) < 600);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("a missing brand name and a bad cover fail before a file is written", async () => {
  const projectDir = mkdtempSync(path.join(tmpdir(), "hh-exports-bare-"));
  try {
    const hitch = path.join(projectDir, ".hitchhiker");
    mkdirSync(hitch, { recursive: true });
    writeFileSync(path.join(hitch, "PRD.md"), "A page with no name.\n", "utf8");
    await assert.rejects(
      () => exportPdf("prd", projectDir, { paper: "A4" }),
      (error: unknown) => error instanceof ExportPdfError && /Name line/.test(error.message),
    );
    assert.equal(existsSync(path.join(hitch, "exports", "PRD.pdf")), false);
    await assert.rejects(
      () => exportPdf("brand-kit", projectDir, { paper: "A4", agency: { name: " ", client: "Ada" } }),
      /Agency name and client are required/,
    );
    await assert.rejects(
      () => exportPdf("prd", projectDir, { paper: "folio" as "A4" }),
      /Paper must be A4 or Letter/,
    );
    assert.equal(existsSync(path.join(hitch, "exports")), false);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

function seed(projectDir: string): void {
  const hitch = path.join(projectDir, ".hitchhiker");
  mkdirSync(path.join(hitch, "brand"), { recursive: true });
  writeFileSync(path.join(hitch, "CONTEXT.md"), `Name: ${BRAND}\n`, "utf8");
  writeFileSync(
    path.join(hitch, "PRD.md"),
    `# Product\n\n${BRAND} cuts architectural glass for houses that face the weather.\n`,
    "utf8",
  );
  writeFileSync(
    path.join(hitch, "BRAND.md"),
    [
      "# Purpose",
      PURPOSE,
      "Status: draft",
      "",
      "## Voice",
      VOICE,
      "",
      "## Neighbors",
      NEIGHBOR,
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    path.join(hitch, "brand-approval.json"),
    JSON.stringify({
      purpose: true,
      voice: true,
      tokens: false,
      imagery: false,
      logo: false,
      neighbors: false,
    }),
    "utf8",
  );
  writeFileSync(
    path.join(hitch, "brand", "approvals.json"),
    JSON.stringify({
      version: 1,
      items: [
        { itemId: "t1", kind: "tagline", text: TAGLINE, status: "approved" },
        { itemId: "t2", kind: "tagline", text: SECRET, status: "rejected" },
      ],
    }),
    "utf8",
  );
}

async function pdfText(file: string, projectDir: string): Promise<string> {
  const extracted = await extractPdfText(file, { root: projectDir });
  return extracted.text;
}

function has(text: string, needle: string): boolean {
  return text.replace(/\s+/g, " ").toLowerCase().includes(needle.toLowerCase());
}

function mediaWidth(bytes: Buffer): number {
  const match = /\/MediaBox\s*\[\s*0\s+0\s+([0-9.]+)\s+([0-9.]+)\s*\]/.exec(bytes.toString("latin1"));
  const width = match?.[1];
  assert.ok(width !== undefined, "MediaBox missing");
  return Number(width);
}
