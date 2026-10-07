import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { assertLogoSvg } from "../src/wordmark.ts";
import { pngSize, pngToIco } from "../src/logo/ico.ts";
import {
  exportLogoSet,
  logoDir,
  logoExportNames,
  pathsForPrint,
  slugifyLogoName,
} from "../src/logo/export-set.ts";

const SQUARE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#111111" d="M4 4 H28 V28 H4 Z"/></svg>`;
const OTHER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#111111" d="M8 8 H16 V24 H8 Z"/></svg>`;

const PNG_SIGNATURE = "89504e470d0a1a0a";

function pngBox(bytes: Buffer): { width: number; height: number } {
  assert.equal(bytes.subarray(0, 8).toString("hex"), PNG_SIGNATURE);
  return pngSize(bytes);
}

test("brand names with spaces or accents are slugified", () => {
  assert.equal(slugifyLogoName("Café North"), "cafe-north");
  assert.equal(slugifyLogoName("Towel & Tea"), "towel-tea");
  assert.equal(slugifyLogoName("Ångström"), "angstrom");
  assert.equal(slugifyLogoName("   "), "mark");
  assert.equal(slugifyLogoName("v1.2"), "v1.2");
  const names = logoExportNames("Café North", "v1.2");
  assert.equal(names[0], "cafe-north-logo-v1.2-master.svg");
  assert.ok(names.includes("cafe-north-logo-v1.2-4096.png"));
  assert.ok(names.includes("cafe-north-logo-v1.2-print.pdf"));
  assert.equal(logoDir(path.join("proj", "site")), path.join("proj", "site", ".hitchhiker", "brand", "logo"));
});

test("group transforms are baked into the print path", () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g transform="translate(10 10)"><path fill="#111111" d="M0 0 H10 V10 H0 Z"/></g></svg>`;
  const paths = pathsForPrint(svg);
  assert.equal(paths.length, 1);
  assert.match(paths[0] ?? "", /M10 10/);
  const shifted = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="5 5 20 20"><path fill="#111111" d="M5 5 H15 V15 H5 Z"/></svg>`;
  const moved = pathsForPrint(shifted);
  assert.match(moved[0] ?? "", /M0 0/);
});

test("pngToIco wraps one square PNG", () => {
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from([0, 0, 0, 13]),
    Buffer.from("IHDR"),
    Buffer.from([0, 0, 0, 16, 0, 0, 0, 16]),
    Buffer.from("rest-of-png"),
  ]);
  const ico = pngToIco(png);
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 1);
  assert.equal(ico.readUInt8(6), 16);
  assert.equal(ico.readUInt8(7), 16);
  assert.equal(ico.readUInt16LE(12), 32);
  assert.equal(ico.subarray(22).equals(png), true);
  assert.throws(() => pngToIco(Buffer.from("nope")), /PNG/);
});

test("exportLogoSet writes every file, exact PNG sizes, and valid SVGs", { timeout: 120_000 }, async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "hh-logo-export-"));
  const outDir = logoDir(root);
  try {
    const written = await exportLogoSet(SQUARE, "Café North", "v1.2", outDir);
    const names = logoExportNames("Café North", "v1.2");
    assert.deepEqual(
      written.map((file) => path.basename(file)),
      names,
    );
    for (const file of written) {
      assert.equal(file.startsWith(outDir), true);
      assert.ok(readFileSync(file).length > 0);
    }
    for (const name of names.filter((file) => file.endsWith(".svg"))) {
      const svg = readFileSync(path.join(outDir, name), "utf8");
      assertLogoSvg(svg);
      assert.equal(svg.includes("<image"), false);
      assert.equal(svg.includes("<text"), false);
    }
    const black = readFileSync(path.join(outDir, "cafe-north-logo-v1.2-black.svg"), "utf8");
    const white = readFileSync(path.join(outDir, "cafe-north-logo-v1.2-white.svg"), "utf8");
    assert.equal(/#fff/i.test(black), false);
    assert.match(white, /#fff/i);
    const favicon = readFileSync(path.join(outDir, "cafe-north-logo-v1.2-favicon.svg"), "utf8");
    const box = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(favicon);
    assert.equal(box?.[1], box?.[2]);

    const expected: Record<string, number> = {
      "cafe-north-logo-v1.2-16.png": 16,
      "cafe-north-logo-v1.2-32.png": 32,
      "cafe-north-logo-v1.2-profile.png": 512,
      "cafe-north-logo-v1.2-app-512.png": 512,
      "cafe-north-logo-v1.2-512.png": 512,
      "cafe-north-logo-v1.2-1024.png": 1024,
      "cafe-north-logo-v1.2-4096.png": 4096,
    };
    for (const [name, size] of Object.entries(expected)) {
      const box = pngBox(readFileSync(path.join(outDir, name)));
      assert.equal(box.width, size, name);
      assert.equal(box.height, size, name);
    }
    const transparent = readFileSync(path.join(outDir, "cafe-north-logo-v1.2-512.png"));
    const profile = readFileSync(path.join(outDir, "cafe-north-logo-v1.2-profile.png"));
    const app = readFileSync(path.join(outDir, "cafe-north-logo-v1.2-app-512.png"));
    assert.equal(transparent.equals(profile), false);
    assert.equal(transparent.equals(app), false);
    assert.equal(profile.equals(app), false);

    const ico16 = readFileSync(path.join(outDir, "cafe-north-logo-v1.2-16.ico"));
    const ico32 = readFileSync(path.join(outDir, "cafe-north-logo-v1.2-32.ico"));
    const png16 = readFileSync(path.join(outDir, "cafe-north-logo-v1.2-16.png"));
    const png32 = readFileSync(path.join(outDir, "cafe-north-logo-v1.2-32.png"));
    assert.equal(ico16.readUInt8(6), 16);
    assert.equal(ico32.readUInt8(6), 32);
    assert.equal(ico16.subarray(22).equals(png16), true);
    assert.equal(ico32.subarray(22).equals(png32), true);

    const pdfBytes = readFileSync(path.join(outDir, "cafe-north-logo-v1.2-print.pdf"));
    assert.equal(pdfBytes.subarray(0, 5).toString("ascii"), "%PDF-");
    const pdf = await PDFDocument.load(pdfBytes);
    assert.equal(pdf.getPageCount(), 1);
    assert.equal(pdf.getPage(0).getWidth(), 612);
    assert.equal(pdf.getPage(0).getHeight(), 792);

    const otherDir = path.join(root, "other");
    const other = await exportLogoSet(OTHER, "Café North", "v1.2", otherDir);
    const otherPdf = readFileSync(other.find((file) => file.endsWith(".pdf")) ?? "");
    assert.equal(pdfBytes.equals(otherPdf), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the export source draws print paths with drawSvgPath", () => {
  const source = readFileSync(new URL("../src/logo/export-set.ts", import.meta.url), "utf8");
  assert.match(source, /drawSvgPath\(/);
  assert.doesNotMatch(source, /potrace|@resvg\/resvg-js/);
});
