/**
 * Client PDFs via Playwright page.pdf.
 * Writes .hitchhiker/exports/PRD.pdf and brand-kit.pdf.
 * Agency mode adds a cover with the agency name and the client name.
 * Without agency, that cover is absent.
 * Playwright is the copy already pinned on @hitchhiker/qa (1.63.0, Apache-2.0).
 * The engine boundary does not take it as a runtime dependency.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hiddenChildOptions } from "../hidden-child.ts";
import {
  assertExportOptions,
  ExportPdfError,
  oneLine,
  readBrandName,
  renderBrandKitPrint,
  renderPrintDocument,
  type PdfExportOptions,
  type PdfPaper,
} from "./brand-kit-pdf.ts";

export type { PdfAgency, PdfExportOptions, PdfPaper } from "./brand-kit-pdf.ts";
export { ExportPdfError } from "./brand-kit-pdf.ts";

interface PdfPage {
  emulateMedia(options: { media?: "print" | "screen"; colorScheme?: "light" }): Promise<void>;
  setContent(html: string, options?: { waitUntil?: "load" | "domcontentloaded" }): Promise<void>;
  evaluate(expression: string): Promise<unknown>;
  pdf(options: {
    format?: PdfPaper;
    printBackground?: boolean;
    preferCSSPageSize?: boolean;
    margin?: { top: string; right: string; bottom: string; left: string };
  }): Promise<Buffer>;
  close(): Promise<void>;
}

interface PdfBrowser {
  newPage(): Promise<PdfPage>;
  close(): Promise<void>;
}

interface PlaywrightChromium {
  launch(options?: {
    executablePath?: string;
    args?: string[];
    headless?: boolean;
  }): Promise<PdfBrowser>;
  executablePath(): string;
}

const here = path.dirname(fileURLToPath(import.meta.url));

const CHROMIUM_FIX = "Chromium is missing. Run: pnpm exec playwright install chromium";

export async function exportPdf(
  kind: "prd" | "brand-kit",
  projectDir: string,
  opts: PdfExportOptions,
): Promise<string> {
  if (kind !== "prd" && kind !== "brand-kit") {
    throw new ExportPdfError("PDF kind must be prd or brand-kit.");
  }
  assertExportOptions(opts);
  const root = path.resolve(projectDir);
  const brandName = resolveBrandName(root, opts);
  const documentTitle = kind === "prd" ? "PRD" : "Brand kit";
  const body = kind === "prd" ? renderPrdBody(root) : renderBrandKitPrint(root, brandName);
  const html = renderPrintDocument({
    paper: opts.paper,
    brandName,
    documentTitle,
    bodyHtml: body,
    ...(opts.agency === undefined ? {} : { agency: opts.agency }),
  });
  const bytes = await printHtml(html, opts.paper);
  if (bytes.length < 5 || bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new ExportPdfError("Playwright did not return a PDF.");
  }
  const dir = path.join(root, ".hitchhiker", "exports");
  await mkdir(dir, { recursive: true });
  const fileName = kind === "prd" ? "PRD.pdf" : "brand-kit.pdf";
  const output = path.join(dir, fileName);
  await writeFile(output, bytes);
  return output;
}

function resolveBrandName(projectDir: string, opts: PdfExportOptions): string {
  const named = readBrandName(projectDir);
  if (named !== null) return named;
  if (opts.agency !== undefined) {
    const client = oneLine(opts.agency.client);
    if (client !== "") return client;
  }
  throw new ExportPdfError("The brand name is missing. Add a Name line to CONTEXT.md.");
}

function renderPrdBody(projectDir: string): string {
  const file = path.join(projectDir, ".hitchhiker", "PRD.md");
  let markdown: string;
  try {
    markdown = readFileSync(file, "utf8");
  } catch (error) {
    if (!isEnoent(error)) throw error;
    return `<section class="pdf-section"><p>The PRD is not on disk yet.</p></section>`;
  }
  const html = markdownHtml(markdown);
  if (html === "") return `<section class="pdf-section"><p>The PRD is not on disk yet.</p></section>`;
  return html;
}

function markdownHtml(markdown: string): string {
  const lines = markdown.replace(/[!！]/g, "").replace(/\u2014/g, ", ").split(/\r?\n/);
  const parts: string[] = [];
  let paragraph: string[] = [];
  const flush = (): void => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(" ").replace(/\s+/g, " ").trim();
    paragraph = [];
    if (text === "") return;
    parts.push(`<p>${escape(text)}</p>`);
  };
  for (const line of lines) {
    const trimmed = line.trim();
    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading !== null) {
      flush();
      const text = (heading[2] ?? "").trim();
      if (text !== "") parts.push(`<h2 class="hh-title">${escape(text)}</h2>`);
      continue;
    }
    if (trimmed === "") {
      flush();
      continue;
    }
    paragraph.push(trimmed);
  }
  flush();
  if (parts.length === 0) return "";
  return `<section class="pdf-section">${parts.join("\n")}</section>`;
}

function escape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function printHtml(html: string, paper: PdfPaper): Promise<Buffer> {
  const chromium = await loadChromium();
  const executablePath = await ensureChromium(chromium);
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ["--disable-dev-shm-usage", "--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    try {
      await page.emulateMedia({ media: "print", colorScheme: "light" });
      await page.setContent(html, { waitUntil: "load" });
      await Promise.race([
        page.evaluate("document.fonts.ready"),
        new Promise<void>((resolve) => {
          setTimeout(resolve, 3000);
        }),
      ]);
      const pdf = await page.pdf({
        format: paper,
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      });
      return Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

function loadChromium(): PlaywrightChromium {
  const qaPackage = path.resolve(here, "../../../qa/package.json");
  if (!existsSync(qaPackage)) {
    throw new ExportPdfError("Playwright is not installed beside the qa package. The pin is playwright 1.63.0.");
  }
  let loaded: unknown;
  try {
    loaded = createRequire(qaPackage)("playwright");
  } catch {
    throw new ExportPdfError("Playwright is not installed beside the qa package. The pin is playwright 1.63.0.");
  }
  const record = asRecord(loaded);
  const chromium = record?.chromium ?? asRecord(record?.default)?.chromium;
  if (
    typeof chromium !== "object" ||
    chromium === null ||
    typeof (chromium as PlaywrightChromium).launch !== "function" ||
    typeof (chromium as PlaywrightChromium).executablePath !== "function"
  ) {
    throw new ExportPdfError("Playwright did not expose chromium.");
  }
  return chromium as PlaywrightChromium;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  return value as Record<string, unknown>;
}

async function ensureChromium(chromium: PlaywrightChromium): Promise<string> {
  const first = chromium.executablePath();
  if (existsSync(first)) return first;
  const cli = playwrightCli();
  if (cli === null) throw new ExportPdfError(CHROMIUM_FIX);
  const code = await new Promise<number | null>((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "install", "chromium"], hiddenChildOptions());
    child.on("error", reject);
    child.on("close", (status) => resolve(status));
  });
  if (code !== 0) throw new ExportPdfError(CHROMIUM_FIX);
  const second = chromium.executablePath();
  if (existsSync(second)) return second;
  throw new ExportPdfError(CHROMIUM_FIX);
}

function playwrightCli(): string | null {
  const qaPackage = path.resolve(here, "../../../qa/package.json");
  if (!existsSync(qaPackage)) return null;
  try {
    const requireFromQa = createRequire(qaPackage);
    return path.join(path.dirname(requireFromQa.resolve("playwright/package.json")), "cli.js");
  } catch {
    return null;
  }
}

function isEnoent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
