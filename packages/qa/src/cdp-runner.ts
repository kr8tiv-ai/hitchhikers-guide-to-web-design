/**
 * Collects CDP facts and evaluates them (245c).
 *
 * withChromium opens headless Chromium. Computed style is read with
 * CSS.getComputedStyleForNode on a CDP session. runAxe always launches
 * its own 375px context and drops the node selector, so this scan uses
 * AxeBuilder on the page already open at the assertion width.
 *
 * Port 4175 is the desk. It is refused before a browser starts. Every
 * navigation uses CDP_NAV_TIMEOUT_MS. The CLI has no qa command group,
 * so there is no `hh qa cdp` entry.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { AxeBuilder } from "@axe-core/playwright";
import type { Browser, Page } from "playwright";
import type { A11yImpact } from "./a11y-gate.ts";
import {
  INTERACTION_LIMIT_MS,
  evaluateCollectedFacts,
  probesForSection,
  sectionSelectors,
  sectionSpecsForPage,
  sectionsInScope,
  summaryForModel,
  toHex,
  type AxeSample,
  type CdpAssertionReport,
  type CdpScope,
  type CollectedBoxes,
  type CollectedFacts,
  type Finding,
  type InteractionProbe,
  type InteractionSample,
  type SectionSpec,
  type StyleSample,
  type TextBoxSample,
} from "./cdp-assertions.ts";
import { withChromium } from "./playwright-opener.ts";

export const CDP_WIDTHS = [375, 768, 1440] as const;

/** Same navigation budget as captureDeviceShot. */
export const CDP_NAV_TIMEOUT_MS = 20_000;

const DESK_PORT = "4175";

const SITEMAP_REL = ".hitchhiker/sitemap.md";
const WIREFRAME_REL = ".hitchhiker/wireframe.md";

export interface CdpPageInput {
  path: string;
  sections?: readonly SectionSpec[];
}

export interface CdpCollectRequest {
  url: string;
  width: number;
  scope: CdpScope;
  sections: readonly SectionSpec[];
  timeoutMs: number;
}

export type CdpCollector = (request: CdpCollectRequest) => Promise<CollectedFacts>;

export interface RunCdpAssertionsInput {
  baseUrl: string;
  pages: readonly (string | CdpPageInput)[];
  widths?: readonly number[];
  scope: CdpScope;
  designMd?: string;
  sitemap?: string;
  wireframe?: string;
  /** Reads DESIGN.md, sitemap.md, and wireframe.md when the strings are omitted. */
  projectDir?: string;
  /** Tests pass a fake. Production leaves this unset and uses Playwright. */
  collect?: CdpCollector;
  timeoutMs?: number;
}

export interface CdpAssertionRun {
  passed: boolean;
  reports: CdpAssertionReport[];
  summaryForModel: string;
}

interface CdpSessionLike {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  detach(): Promise<void>;
}

interface SignatureEl {
  getAttribute(name: string): string | null;
  className: string;
  childElementCount: number;
  textContent: string | null;
  getBoundingClientRect(): { top: number };
}

interface PlannedPage {
  path: string;
  sections: SectionSpec[];
}

export async function runCdpAssertions(input: RunCdpAssertionsInput): Promise<CdpAssertionRun> {
  refuseDeskPort(input.baseUrl);
  const designMd = resolveDesign(input);
  const sitemap = resolveOptional(input.sitemap, input.projectDir, SITEMAP_REL);
  const wireframe = resolveOptional(input.wireframe, input.projectDir, WIREFRAME_REL);
  const timeoutMs = input.timeoutMs ?? CDP_NAV_TIMEOUT_MS;
  const widths = input.widths === undefined ? [...CDP_WIDTHS] : [...input.widths];
  const pages = normalizePages(input.pages, sitemap, wireframe);
  const requests = buildRequests(pages, input.baseUrl, widths, input.scope, timeoutMs);
  const reports: CdpAssertionReport[] = [];
  if (input.collect !== undefined) {
    for (const request of requests) {
      reports.push(await evaluateRequest(designMd, input.scope, request, input.collect));
    }
  } else {
    await withChromium(async (browser) => {
      for (const request of requests) {
        try {
          const facts = await collectInBrowser(browser, request);
          reports.push(evaluateCollectedFacts({ designMd, sections: request.sections, scope: input.scope, facts }));
        } catch (error) {
          reports.push(navigationReport(request, error));
        }
      }
    });
  }
  return finish(reports);
}

export async function collectInBrowser(browser: Browser, request: CdpCollectRequest): Promise<CollectedFacts> {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: request.width, height: request.width < 768 ? 812 : 900 },
  });
  try {
    const page = await context.newPage();
    try {
      page.setDefaultNavigationTimeout(request.timeoutMs);
      page.setDefaultTimeout(request.timeoutMs);
      await page.goto(request.url, { waitUntil: "load", timeout: request.timeoutMs });
      const session = (await page.context().newCDPSession(page)) as CdpSessionLike;
      try {
        const snapshot = await readSnapshot(session, request.sections.map((section) => section.id));
        await overlayComputedStyle(session, snapshot.styles);
        const axe = await readAxe(page, request);
        const interactions = await readInteractions(page, request.sections);
        return {
          url: request.url,
          width: request.width,
          styles: snapshot.styles,
          boxes: snapshot.boxes,
          interactions,
          axe,
        };
      } finally {
        await session.detach();
      }
    } finally {
      await page.close();
    }
  } finally {
    await context.close();
  }
}

function refuseDeskPort(baseUrl: string): void {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(`baseUrl is not a URL: ${baseUrl}`);
  }
  if (url.port === DESK_PORT) {
    throw new Error(`Refusing the desk port ${DESK_PORT}. Run CDP assertions against the site preview, not the desk.`);
  }
}

function resolveDesign(input: RunCdpAssertionsInput): string {
  if (typeof input.designMd === "string") return input.designMd;
  if (typeof input.projectDir === "string") {
    const file = path.join(input.projectDir, "DESIGN.md");
    if (existsSync(file)) return readFileSync(file, "utf8");
  }
  throw new Error("DESIGN.md is required for CDP assertions.");
}

function resolveOptional(given: string | undefined, projectDir: string | undefined, relative: string): string {
  if (typeof given === "string") return given;
  if (typeof projectDir !== "string") return "";
  const file = path.join(projectDir, relative);
  if (!existsSync(file)) return "";
  return readFileSync(file, "utf8");
}

function normalizePages(
  pages: readonly (string | CdpPageInput)[],
  sitemap: string,
  wireframe: string,
): PlannedPage[] {
  return pages.map((page) => {
    if (typeof page === "string") {
      return { path: page, sections: sectionSpecsForPage({ route: page, sitemap, wireframe }) };
    }
    const sections =
      page.sections === undefined
        ? sectionSpecsForPage({ route: page.path, sitemap, wireframe })
        : page.sections.map((section) => ({ ...section }));
    return { path: page.path, sections };
  });
}

function buildRequests(
  pages: readonly PlannedPage[],
  baseUrl: string,
  widths: readonly number[],
  scope: CdpScope,
  timeoutMs: number,
): CdpCollectRequest[] {
  const requests: CdpCollectRequest[] = [];
  for (const page of pages) {
    const sections = sectionsInScope(page.sections, scope);
    const url = joinUrl(baseUrl, page.path);
    for (const width of widths) {
      requests.push({ url, width, scope, sections, timeoutMs });
    }
  }
  return requests;
}

function joinUrl(baseUrl: string, pagePath: string): string {
  const root = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const relative = pagePath.startsWith("/") ? pagePath.slice(1) : pagePath;
  return new URL(relative, root).href;
}

async function evaluateRequest(
  designMd: string,
  scope: CdpScope,
  request: CdpCollectRequest,
  collect: CdpCollector,
): Promise<CdpAssertionReport> {
  try {
    const facts = await collect(request);
    return evaluateCollectedFacts({ designMd, sections: request.sections, scope, facts });
  } catch (error) {
    return navigationReport(request, error);
  }
}

function navigationReport(request: CdpCollectRequest, error: unknown): CdpAssertionReport {
  const message = error instanceof Error ? error.message : "Navigation failed.";
  const row: Finding = {
    kind: "navigation",
    selector: request.url,
    actual: message.replace(/\s+/g, " ").trim(),
    expected: "a loaded page",
    detail: `Navigation failed within ${request.timeoutMs}ms.`,
  };
  return {
    url: request.url,
    width: request.width,
    blockers: [row],
    fixes: [],
    passed: false,
    summaryForModel: summaryForModel([row], []),
  };
}

function finish(reports: CdpAssertionReport[]): CdpAssertionRun {
  const blockers = reports.flatMap((report) => report.blockers.map((item) => tag(report, item)));
  const fixes = reports.flatMap((report) => report.fixes.map((item) => tag(report, item)));
  return {
    passed: reports.every((report) => report.passed),
    reports,
    summaryForModel: summaryForModel(blockers, fixes),
  };
}

function tag(report: CdpAssertionReport, item: Finding): Finding {
  return { ...item, selector: `${report.width} ${item.selector}` };
}

async function readSnapshot(
  session: CdpSessionLike,
  sectionIds: readonly string[],
): Promise<{ styles: StyleSample[]; boxes: CollectedBoxes }> {
  const evaluated = asRecord(
    await session.send("Runtime.evaluate", {
      expression: snapshotExpression(sectionIds),
      returnByValue: true,
    }),
  );
  const result = asRecord(evaluated?.result);
  const raw = typeof result?.value === "string" ? result.value : "";
  const parsed = parseSnapshot(raw);
  return parsed;
}

function snapshotExpression(sectionIds: readonly string[]): string {
  return `(() => {
    const sectionIds = ${JSON.stringify(sectionIds)};
    const ident = (id) => /^[A-Za-z_][\\w-]*$/.test(id);
    const rootFor = (id) => {
      const selectors = [];
      const safe = String(id).replace(/"/g, "");
      if (ident(id)) selectors.push("#" + CSS.escape(id), "section." + CSS.escape(id), "." + CSS.escape(id));
      selectors.push('[data-section="' + safe + '"]', '[data-section-id="' + safe + '"]');
      for (const selector of selectors) {
        const node = document.querySelector(selector);
        if (node) return { node, selector };
      }
      return null;
    };
    const selectorOf = (node, fallback) => {
      if (node.id) return "#" + CSS.escape(node.id);
      const tag = String(node.tagName || "").toLowerCase();
      const raw = typeof node.className === "string" ? node.className : "";
      const className = raw.trim().split(/\\s+/).filter(Boolean)[0];
      if (className) return tag + "." + CSS.escape(className);
      return fallback;
    };
    const readStyle = (selector, role, node) => {
      const style = getComputedStyle(node);
      const fontSize = Number.parseFloat(style.fontSize);
      const padding = [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map((edge) => Number.parseFloat(edge));
      return {
        selector,
        role,
        fontFamily: style.fontFamily,
        fontSizePx: Number.isFinite(fontSize) ? fontSize : 0,
        color: style.color,
        backgroundColor: style.backgroundColor,
        paddingPx: padding.every((value) => Number.isFinite(value)) ? padding : [],
      };
    };
    const styles = [];
    const texts = [];
    const interactives = [];
    const taps = [];
    const seen = new Set();
    for (const id of sectionIds) {
      const found = rootFor(id);
      if (!found) continue;
      styles.push(readStyle(found.selector, "section", found.node));
      const h1 = found.node.querySelector("h1");
      if (h1) styles.push(readStyle(selectorOf(h1, found.selector + " h1"), "h1", h1));
      const h2 = found.node.querySelector("h2");
      if (h2) styles.push(readStyle(selectorOf(h2, found.selector + " h2"), "h2", h2));
      const body = found.node.querySelector("p");
      if (body) styles.push(readStyle(selectorOf(body, found.selector + " p"), "body", body));
      for (const node of found.node.querySelectorAll("h1, h2, p")) {
        const style = getComputedStyle(node);
        texts.push({
          selector: selectorOf(node, found.selector),
          scrollWidth: node.scrollWidth,
          clientWidth: node.clientWidth,
          overflowX: style.overflowX,
        });
      }
      for (const node of found.node.querySelectorAll("a[href], button, input, select, textarea, summary, [role=button]")) {
        const rect = node.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        const selector = selectorOf(node, found.selector);
        const key = selector + ":" + Math.round(rect.x) + ":" + Math.round(rect.y);
        if (seen.has(key)) continue;
        seen.add(key);
        interactives.push({ selector, x: rect.x, y: rect.y, width: rect.width, height: rect.height });
        taps.push({ selector, width: rect.width, height: rect.height });
      }
    }
    const root = document.documentElement;
    return JSON.stringify({
      styles,
      boxes: {
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
        interactives,
        texts,
        taps,
      },
    });
  })()`;
}

function parseSnapshot(raw: string): { styles: StyleSample[]; boxes: CollectedBoxes } {
  const empty: CollectedBoxes = { scrollWidth: 0, clientWidth: 0, interactives: [], texts: [], taps: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { styles: [], boxes: empty };
  }
  const record = asRecord(parsed);
  if (record === null) return { styles: [], boxes: empty };
  const styles = Array.isArray(record.styles) ? record.styles.flatMap((item) => readStyle(item)) : [];
  const boxes = asRecord(record.boxes);
  return {
    styles,
    boxes: {
      scrollWidth: numberOr(boxes?.scrollWidth, 0),
      clientWidth: numberOr(boxes?.clientWidth, 0),
      interactives: Array.isArray(boxes?.interactives) ? boxes.interactives.flatMap((item) => readRect(item)) : [],
      texts: Array.isArray(boxes?.texts) ? boxes.texts.flatMap((item) => readText(item)) : [],
      taps: Array.isArray(boxes?.taps) ? boxes.taps.flatMap((item) => readTap(item)) : [],
    },
  };
}

function readStyle(value: unknown): StyleSample[] {
  const record = asRecord(value);
  if (record === null || typeof record.selector !== "string") return [];
  const role = record.role;
  if (role !== "h1" && role !== "h2" && role !== "body" && role !== "section") return [];
  const padding = Array.isArray(record.paddingPx)
    ? record.paddingPx.filter((item): item is number => typeof item === "number" && Number.isFinite(item))
    : [];
  const sample: StyleSample = {
    selector: record.selector,
    role,
    fontFamily: typeof record.fontFamily === "string" ? record.fontFamily : "",
    fontSizePx: numberOr(record.fontSizePx, 0),
    color: typeof record.color === "string" ? record.color : "",
    backgroundColor: typeof record.backgroundColor === "string" ? record.backgroundColor : "",
  };
  if (padding.length > 0) sample.paddingPx = padding;
  return [sample];
}

function readRect(value: unknown): { selector: string; x: number; y: number; width: number; height: number }[] {
  const record = asRecord(value);
  if (record === null || typeof record.selector !== "string") return [];
  return [
    {
      selector: record.selector,
      x: numberOr(record.x, 0),
      y: numberOr(record.y, 0),
      width: numberOr(record.width, 0),
      height: numberOr(record.height, 0),
    },
  ];
}

function readText(value: unknown): TextBoxSample[] {
  const record = asRecord(value);
  if (record === null || typeof record.selector !== "string") return [];
  return [
    {
      selector: record.selector,
      scrollWidth: numberOr(record.scrollWidth, 0),
      clientWidth: numberOr(record.clientWidth, 0),
      overflowX: typeof record.overflowX === "string" ? record.overflowX : "",
    },
  ];
}

function readTap(value: unknown): { selector: string; width: number; height: number }[] {
  const record = asRecord(value);
  if (record === null || typeof record.selector !== "string") return [];
  return [{ selector: record.selector, width: numberOr(record.width, 0), height: numberOr(record.height, 0) }];
}

async function overlayComputedStyle(session: CdpSessionLike, styles: StyleSample[]): Promise<void> {
  await session.send("DOM.enable");
  await session.send("CSS.enable");
  const doc = asRecord(await session.send("DOM.getDocument", { depth: 0 }));
  const root = asRecord(doc?.root);
  const rootId = typeof root?.nodeId === "number" ? root.nodeId : 0;
  if (rootId === 0) return;
  for (const sample of styles) {
    const found = asRecord(await session.send("DOM.querySelector", { nodeId: rootId, selector: sample.selector }));
    const nodeId = typeof found?.nodeId === "number" ? found.nodeId : 0;
    if (nodeId === 0) continue;
    const styled = asRecord(await session.send("CSS.getComputedStyleForNode", { nodeId }));
    const entries = Array.isArray(styled?.computedStyle) ? styled.computedStyle : [];
    const map = new Map<string, string>();
    for (const entry of entries) {
      const row = asRecord(entry);
      if (row === null || typeof row.name !== "string" || typeof row.value !== "string") continue;
      map.set(row.name, row.value);
    }
    const family = map.get("font-family");
    if (family !== undefined && family !== "") sample.fontFamily = family;
    const size = parsePx(map.get("font-size") ?? "");
    if (size !== null) sample.fontSizePx = size;
    const color = map.get("color");
    if (color !== undefined && toHex(color) !== null) sample.color = color;
    const background = map.get("background-color");
    if (background !== undefined) sample.backgroundColor = background;
    if (sample.role !== "section") continue;
    const edges = ["padding-top", "padding-right", "padding-bottom", "padding-left"]
      .map((name) => parsePx(map.get(name) ?? ""))
      .filter((value): value is number => value !== null);
    if (edges.length > 0) sample.paddingPx = edges;
  }
}

async function readAxe(page: Page, request: CdpCollectRequest): Promise<AxeSample[]> {
  try {
    let builder = new AxeBuilder({
      page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]["page"],
    });
    if (request.scope === "hero") {
      let included = 0;
      for (const section of request.sections) {
        for (const selector of sectionSelectors(section.id)) {
          if ((await page.locator(selector).count()) === 0) continue;
          builder = builder.include(selector);
          included += 1;
          break;
        }
      }
      if (included === 0) {
        for (const selector of ["#hero", ".hero", "header", "main"]) {
          if ((await page.locator(selector).count()) === 0) continue;
          builder = builder.include(selector);
        }
      }
    }
    const scan = (await builder.analyze()) as {
      violations?: { id?: unknown; impact?: unknown; nodes?: { target?: unknown }[] }[];
    };
    const samples: AxeSample[] = [];
    for (const item of scan.violations ?? []) {
      if (typeof item.id !== "string" || item.id.length === 0) continue;
      const impact = asImpact(item.impact);
      const nodes = item.nodes ?? [];
      if (nodes.length === 0) {
        samples.push({ id: item.id, impact, selector: "page" });
        continue;
      }
      for (const node of nodes.slice(0, 20)) {
        const target = Array.isArray(node.target) ? node.target.find((part) => typeof part === "string") : undefined;
        samples.push({ id: item.id, impact, selector: typeof target === "string" && target !== "" ? target : "page" });
      }
    }
    return samples;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Axe crashed.";
    return [{ id: message.slice(0, 120), impact: "critical", selector: "page" }];
  }
}

function asImpact(value: unknown): A11yImpact {
  if (value === "minor" || value === "moderate" || value === "serious" || value === "critical") return value;
  return "serious";
}

async function readInteractions(page: Page, sections: readonly SectionSpec[]): Promise<InteractionSample[]> {
  const planned: { probe: InteractionProbe; sectionId: string }[] = [];
  for (const section of sections) {
    for (const probe of probesForSection(section)) {
      if (planned.some((item) => item.probe === probe)) continue;
      planned.push({ probe, sectionId: section.id });
    }
  }
  const samples: InteractionSample[] = [];
  for (const item of planned) {
    samples.push(await runProbe(page, item.probe, item.sectionId));
  }
  return samples;
}

async function runProbe(page: Page, probe: InteractionProbe, sectionId: string): Promise<InteractionSample> {
  const selector = probeSelector(probe, sectionId);
  const started = Date.now();
  try {
    const before = await readSignature(page, selector);
    const acted = await act(page, probe, selector);
    if (!acted) {
      return { probe, selector, changed: false, withinMs: Math.min(Date.now() - started, INTERACTION_LIMIT_MS) };
    }
    const changed = await waitForChange(page, selector, before, started);
    return { probe, selector, changed, withinMs: Date.now() - started };
  } catch {
    return { probe, selector, changed: false, withinMs: INTERACTION_LIMIT_MS };
  }
}

function probeSelector(probe: InteractionProbe, sectionId: string): string {
  const rooted = (suffix: string): string => {
    const safe = sectionId.replace(/"/g, "");
    const parts: string[] = [];
    if (/^[A-Za-z_][\w-]*$/.test(sectionId)) {
      parts.push(suffix === "" ? `#${sectionId}` : `#${sectionId} ${suffix}`);
    }
    parts.push(suffix === "" ? `[data-section="${safe}"]` : `[data-section="${safe}"] ${suffix}`);
    return parts.join(", ");
  };
  if (probe === "nav-toggle") {
    return "button[aria-expanded], button[aria-controls], .nav-toggle, .menu-toggle, header button";
  }
  if (probe === "accordion") return rooted("button") + ", " + rooted("summary");
  if (probe === "tab") return rooted("[role=tab]");
  if (probe === "form") return `${rooted("form")}, form`;
  if (probe === "hover") return `${rooted("a")}, ${rooted("article")}, .card`;
  return rooted("");
}

async function act(page: Page, probe: InteractionProbe, selector: string): Promise<boolean> {
  if (probe === "form") return fillForm(page, selector);
  if (probe === "hover") {
    const target = page.locator(selector).first();
    if ((await target.count()) === 0) return false;
    await target.hover({ timeout: INTERACTION_LIMIT_MS });
    return true;
  }
  if (probe === "scroll-reveal") {
    const target = page.locator(selector).first();
    if ((await target.count()) === 0) return false;
    await target.scrollIntoViewIfNeeded({ timeout: INTERACTION_LIMIT_MS });
    return true;
  }
  const target = page.locator(selector).first();
  if ((await target.count()) === 0) return false;
  await target.click({ timeout: INTERACTION_LIMIT_MS });
  return true;
}

async function fillForm(page: Page, selector: string): Promise<boolean> {
  const form = page.locator(selector).first();
  if ((await form.count()) === 0) return false;
  const fields = form.locator("input:not([type=hidden]):not([type=submit]):not([type=button]), textarea");
  const count = await fields.count();
  for (let index = 0; index < count; index += 1) {
    const field = fields.nth(index);
    const type = (await field.getAttribute("type")) ?? "";
    if (type === "checkbox" || type === "radio") {
      await field.check({ timeout: INTERACTION_LIMIT_MS });
    } else {
      await field.fill("visitor", { timeout: INTERACTION_LIMIT_MS });
    }
  }
  const submit = form.locator("button[type=submit], input[type=submit], button").first();
  if ((await submit.count()) > 0) await submit.click({ timeout: INTERACTION_LIMIT_MS });
  else await form.press("Enter", { timeout: INTERACTION_LIMIT_MS });
  return true;
}

async function readSignature(page: Page, selector: string): Promise<string> {
  return page.evaluate((sel) => {
    const view = globalThis as unknown as {
      document: { querySelector: (selector: string) => SignatureEl | null };
      getComputedStyle: (el: SignatureEl) => {
        display: string;
        visibility: string;
        opacity: string;
        transform: string;
      };
    };
    const el = view.document.querySelector(sel);
    if (el === null) return "missing";
    const style = view.getComputedStyle(el);
    return [
      style.display,
      style.visibility,
      style.opacity,
      style.transform,
      el.getAttribute("aria-expanded") ?? "",
      el.getAttribute("hidden") ?? "",
      String(el.className),
      String(el.childElementCount),
      (el.textContent ?? "").slice(0, 120),
      String(Math.round(el.getBoundingClientRect().top)),
    ].join("|");
  }, selector);
}

async function waitForChange(page: Page, selector: string, before: string, started: number): Promise<boolean> {
  const deadline = started + INTERACTION_LIMIT_MS;
  while (Date.now() <= deadline) {
    const next = await readSignature(page, selector);
    if (next !== before) return true;
    if (Date.now() + 50 > deadline) return false;
    await delay(50);
  }
  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parsePx(value: string): number | null {
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(value.trim());
  if (match?.[1] === undefined) return null;
  const number = Number(match[1]);
  return Number.isFinite(number) ? number : null;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
