/**
 * Live checks after a deploy.
 *
 * Lighthouse uses the prompt 122 phone floor: all four categories at
 * least 90. The injected runner owns the mobile preset and the median
 * of three runs. This module judges the scores it returns. Ratios from
 * 0 to 1 scale by 100, and 0.9 is 90. A missing run is a blocker.
 *
 * The homepage also goes through postCheck from prompt 145.
 * Form posts and analytics events wait for their own yes. A decline
 * does not send them. Sitemap text names Google Search Console and
 * Bing Webmaster Tools and is not submitted.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PHONE_CATEGORY_FLOOR, postCheck, type PostCheckResult } from "./post-check.ts";

const FLOOR = PHONE_CATEGORY_FLOOR;
const RATIO_MAX = 1;
const REDIRECT_CAP = 3;

export interface PhoneScores {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
}

export interface LhciRunner {
  runMobile(url: string): Promise<unknown>;
}

export interface PostDeployDeps {
  fetchImpl: typeof fetch;
  lhci: LhciRunner;
  yes: () => Promise<boolean>;
}

export interface RouteCheck {
  route: string;
  status: number;
  ok: boolean;
}

export interface RedirectCheck {
  from: string;
  to: string;
  status: number;
  ok: boolean;
}

export interface SideEffectCheck {
  declined: boolean;
  ok: boolean;
  reason: string;
}

export interface PostDeployReport {
  url: string;
  lighthouse: {
    status: "PASS" | "BLOCKER";
    scores: PhoneScores | null;
    reasons: string[];
  };
  routes: RouteCheck[];
  homepage: PostCheckResult;
  form: SideEffectCheck;
  analytics: SideEffectCheck & { confirm: string };
  og: {
    ok: boolean;
    title: string;
    description: string;
    image: string;
    preview: string;
  };
  https: { ok: boolean; hsts: boolean; reason: string };
  redirects: RedirectCheck[];
  sitemap: { submitted: false; instructions: string };
}

interface FetchedPage {
  status: number;
  body: string;
  headers: Headers;
  redirects: number;
  finalUrl: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scaleScore(raw: number): number {
  const scaled = raw <= RATIO_MAX ? raw * 100 : raw;
  return Math.round(scaled * 1e9) / 1e9;
}

function readScore(raw: unknown, field: string): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
    throw new Error(`${field} is missing. A mobile category score is required.`);
  }
  const score = scaleScore(raw);
  if (score > 100) throw new Error(`${field} is above 100.`);
  return score;
}

function categoryScore(categories: Record<string, unknown>, key: string): number {
  const category = categories[key];
  if (!isRecord(category)) {
    throw new Error(`categories.${key} is missing.`);
  }
  return readScore(category.score, `categories.${key}.score`);
}

function bestPractices(categories: Record<string, unknown>): number {
  const kebab = Object.hasOwn(categories, "best-practices");
  const camel = Object.hasOwn(categories, "bestPractices");
  if (!kebab && !camel) throw new Error("categories.best-practices is missing.");
  const fromKebab = kebab ? categoryScore(categories, "best-practices") : undefined;
  const fromCamel = camel ? categoryScore(categories, "bestPractices") : undefined;
  if (fromKebab !== undefined && fromCamel !== undefined && fromKebab !== fromCamel) {
    throw new Error("best-practices and bestPractices disagree.");
  }
  if (fromKebab !== undefined) return fromKebab;
  if (fromCamel !== undefined) return fromCamel;
  throw new Error("categories.best-practices is missing.");
}

/** Map a runner result into the four phone scores. Partial reports throw. */
export function readPhoneScores(json: unknown): PhoneScores {
  if (!isRecord(json)) {
    throw new Error("Lighthouse result is missing. A real mobile run is required.");
  }
  if (
    typeof json.performance === "number"
    && typeof json.accessibility === "number"
    && (typeof json.bestPractices === "number" || typeof json["best-practices"] === "number")
    && typeof json.seo === "number"
    && !isRecord(json.categories)
  ) {
    const best = typeof json.bestPractices === "number" ? json.bestPractices : json["best-practices"];
    return {
      performance: readScore(json.performance, "performance"),
      accessibility: readScore(json.accessibility, "accessibility"),
      bestPractices: readScore(best, "bestPractices"),
      seo: readScore(json.seo, "seo"),
    };
  }
  const categories = isRecord(json.categories)
    ? json.categories
    : isRecord(json.lhr) && isRecord(json.lhr.categories)
      ? json.lhr.categories
      : null;
  if (categories === null) {
    throw new Error("Lighthouse result is missing categories. A real mobile run is required.");
  }
  return {
    performance: categoryScore(categories, "performance"),
    accessibility: categoryScore(categories, "accessibility"),
    bestPractices: bestPractices(categories),
    seo: categoryScore(categories, "seo"),
  };
}

/**
 * Prompt 122 phone gate. Floors stay at 90. Desktop scores are not accepted
 * here because a post-deploy check is the phone run.
 */
export function judgePhoneLighthouse(json: unknown): PostDeployReport["lighthouse"] {
  if (json === null || json === undefined) {
    return {
      status: "BLOCKER",
      scores: null,
      reasons: ["A real mobile run is required."],
    };
  }
  let scores: PhoneScores;
  try {
    scores = readPhoneScores(json);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "A real mobile run is required.";
    return { status: "BLOCKER", scores: null, reasons: [reason] };
  }
  const rows = [
    ["Phone performance", scores.performance],
    ["Phone accessibility", scores.accessibility],
    ["Phone best practices", scores.bestPractices],
    ["Phone SEO", scores.seo],
  ] as const;
  const reasons: string[] = [];
  for (const [name, score] of rows) {
    if (score < FLOOR) reasons.push(`${name} is ${score}, below the floor of ${FLOOR}.`);
  }
  return {
    status: reasons.length > 0 ? "BLOCKER" : "PASS",
    scores,
    reasons,
  };
}

export function sitemapInstructions(siteUrl: string): string {
  const sitemap = new URL("/sitemap.xml", siteUrl).href;
  return [
    `Sitemap: ${sitemap}`,
    "Submit it yourself in Google Search Console.",
    "Submit it yourself in Bing Webmaster Tools.",
    "The Guide does not submit a sitemap on your behalf.",
  ].join("\n");
}

function attr(source: string, name: string): string {
  const match = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(source);
  return match?.[1]?.trim() ?? "";
}

function metaContent(html: string, name: string): string {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const key = attr(tag, "name") || attr(tag, "property");
    if (key.toLowerCase() === name.toLowerCase()) return attr(tag, "content");
  }
  return "";
}

function titleText(html: string): string {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (match === null || match[1] === undefined) return "";
  return match[1].replace(/\s+/g, " ").trim();
}

function previewCard(title: string, description: string, image: string): string {
  const rows = [
    title === "" ? "Untitled" : title,
    description === "" ? "No description" : description,
    image === "" ? "No image" : image,
  ];
  const width = Math.max(...rows.map((row) => row.length), 8);
  const line = `+${"-".repeat(width + 2)}+`;
  const body = rows.map((row) => `| ${row.padEnd(width)} |`).join("\n");
  return `${line}\n${body}\n${line}`;
}

function absolute(base: string, route: string): string {
  if (/^https?:\/\//i.test(route)) return route;
  const pathPart = route.startsWith("/") ? route : `/${route}`;
  return new URL(pathPart, base).href;
}

function httpTwin(pageUrl: string): string | null {
  const parsed = new URL(pageUrl);
  if (parsed.protocol !== "https:") return null;
  parsed.protocol = "http:";
  return parsed.href;
}

async function follow(fetchImpl: typeof fetch, start: string): Promise<FetchedPage> {
  let current = start;
  let redirects = 0;
  for (let hop = 0; hop <= REDIRECT_CAP; hop += 1) {
    const response = await fetchImpl(current, { redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location === null || location.trim() === "" || redirects >= REDIRECT_CAP) {
        return {
          status: response.status,
          body: await response.text(),
          headers: response.headers,
          redirects,
          finalUrl: current,
        };
      }
      redirects += 1;
      current = new URL(location, current).href;
      continue;
    }
    return {
      status: response.status,
      body: await response.text(),
      headers: response.headers,
      redirects,
      finalUrl: current,
    };
  }
  throw new Error("Redirect follow did not finish.");
}

function findForm(html: string): { action: string; inbox: string } | null {
  const form = /<form\b([^>]*)>/i.exec(html);
  if (form === null || form[1] === undefined) return null;
  const mailto = /mailto:([^"'?\s>]+)/i.exec(html);
  const inbox = attr(form[1], "data-inbox") || metaContent(html, "hh-inbox") || mailto?.[1] || "";
  return { action: attr(form[1], "action"), inbox };
}

interface AnalyticsCall {
  endpoint: string;
  body: string;
}

function findAnalytics(html: string, pageUrl: string): AnalyticsCall | null {
  const scripts = html.match(/<script\b[^>]*>/gi) ?? [];
  const page = new URL(pageUrl);
  for (const script of scripts) {
    const src = attr(script, "src");
    const domain = attr(script, "data-domain");
    if (src !== "" && domain !== "" && /plausible/i.test(src)) {
      const endpoint = new URL("/api/event", src).href;
      return {
        endpoint,
        body: JSON.stringify({ name: "guide-deploy-check", url: pageUrl, domain }),
      };
    }
    const website = attr(script, "data-website-id");
    if (src !== "" && website !== "" && /umami/i.test(src)) {
      const endpoint = new URL("/api/send", src).href;
      return {
        endpoint,
        body: JSON.stringify({
          type: "event",
          payload: {
            website,
            hostname: page.hostname,
            url: page.pathname,
            name: "guide-deploy-check",
          },
        }),
      };
    }
  }
  return null;
}

async function postForm(
  fetchImpl: typeof fetch,
  pageUrl: string,
  html: string,
  yes: () => Promise<boolean>,
): Promise<SideEffectCheck> {
  const form = findForm(html);
  if (form === null) {
    return { declined: false, ok: false, reason: "No contact form was found. Nothing was submitted." };
  }
  if (form.inbox === "" || !form.inbox.includes("@")) {
    return {
      declined: false,
      ok: false,
      reason: "The page has a form and no inbox address. Nothing was submitted.",
    };
  }
  if ((await yes()) !== true) {
    return { declined: true, ok: false, reason: "Form test declined. Nothing was submitted." };
  }
  const action = form.action === "" ? pageUrl : absolute(pageUrl, form.action);
  const body = new URLSearchParams({ email: form.inbox, message: "Guide deploy check" }).toString();
  const response = await fetchImpl(action, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    redirect: "manual",
  });
  const ok = response.status === 200 || response.status === 201 || response.status === 202 || response.status === 204 || response.status === 302;
  return {
    declined: false,
    ok,
    reason: ok ? "Form test submitted to the address on the page." : `Form test returned status ${response.status}.`,
  };
}

async function postAnalytics(
  fetchImpl: typeof fetch,
  pageUrl: string,
  html: string,
  yes: () => Promise<boolean>,
): Promise<PostDeployReport["analytics"]> {
  const call = findAnalytics(html, pageUrl);
  if (call === null) {
    return {
      declined: false,
      ok: false,
      confirm: "",
      reason: "No Plausible or Umami snippet was found. No event was sent.",
    };
  }
  if ((await yes()) !== true) {
    return {
      declined: true,
      ok: false,
      confirm: "",
      reason: "Analytics test declined. No event was sent.",
    };
  }
  const response = await fetchImpl(call.endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: call.body,
    redirect: "manual",
  });
  const ok = response.status >= 200 && response.status < 300;
  return {
    declined: false,
    ok,
    confirm: "Confirm the test event in your analytics dashboard. The Guide cannot see that dashboard.",
    reason: ok ? "Analytics test event was sent." : `Analytics endpoint returned status ${response.status}.`,
  };
}

/**
 * Check a live URL. Route failures stay in the report. This function
 * does not delete a deploy record.
 */
export async function postDeployChecks(
  url: string,
  routes: readonly string[],
  deps: PostDeployDeps,
): Promise<PostDeployReport> {
  let lighthouse: PostDeployReport["lighthouse"];
  try {
    lighthouse = judgePhoneLighthouse(await deps.lhci.runMobile(url));
  } catch (error) {
    const reason = error instanceof Error ? error.message : "A real mobile run is required.";
    lighthouse = { status: "BLOCKER", scores: null, reasons: [reason] };
  }

  const home = await follow(deps.fetchImpl, url);
  const parsed = new URL(url);
  const hsts = (home.headers.get("strict-transport-security") ?? "").trim() !== "";
  const httpsOk = parsed.protocol === "https:" && hsts;
  const https = {
    ok: httpsOk,
    hsts,
    reason: parsed.protocol !== "https:"
      ? "The live URL is not https."
      : hsts
        ? "HTTPS and HSTS are present."
        : "HTTPS is present and the strict-transport-security header is missing.",
  };

  const redirects: RedirectCheck[] = [];
  const twin = httpTwin(url);
  if (twin !== null) {
    const hop = await deps.fetchImpl(twin, { redirect: "manual" });
    const location = hop.headers.get("location") ?? "";
    const target = location === "" ? "" : new URL(location, twin).href;
    const status = hop.status;
    const upgraded = status >= 300 && status < 400 && target.startsWith("https://");
    redirects.push({ from: twin, to: target, status, ok: upgraded });
  }

  const routeChecks: RouteCheck[] = [];
  for (const route of routes) {
    const routeUrl = absolute(url, route);
    const page = await follow(deps.fetchImpl, routeUrl);
    routeChecks.push({ route, status: page.status, ok: page.status === 200 });
  }

  const siteName = titleText(home.body) || parsed.hostname;
  const homepage = await postCheck({
    state: "completed",
    url,
    siteName,
    fetchImpl: () => Promise.resolve({
      status: home.status,
      body: home.body,
      redirects: home.redirects,
    }),
  });

  const title = metaContent(home.body, "og:title");
  const description = metaContent(home.body, "og:description");
  const image = metaContent(home.body, "og:image");
  const og = {
    ok: title !== "" && description !== "" && image !== "",
    title,
    description,
    image,
    preview: previewCard(title, description, image),
  };

  const form = await postForm(deps.fetchImpl, home.finalUrl, home.body, deps.yes);
  const analytics = await postAnalytics(deps.fetchImpl, home.finalUrl, home.body, deps.yes);

  return {
    url,
    lighthouse,
    routes: routeChecks,
    homepage,
    form,
    analytics,
    og,
    https,
    redirects,
    sitemap: { submitted: false, instructions: sitemapInstructions(url) },
  };
}

/**
 * Idea 25. Yes or no launch checklist. Run the same rows on staging,
 * then on the live domain within an hour. The desk prepares this list
 * when the user deploys. These functions do not deploy, publish, or
 * call a host. A live failure is not waived by a staging pass.
 *
 * The first eleven ids match the juror floor. Phone and desktop
 * Lighthouse use the same floor of 90 as the phone gate above.
 */
export const LAUNCH_WINDOW_MS = 60 * 60 * 1000;

export const LAUNCH_CHECK_ROWS = [
  "horizontal-overflow",
  "control-under-44",
  "keyboard-trap",
  "missing-focus",
  "text-under-16",
  "contrast-under-floor",
  "hover-only-control",
  "video-autoplay-sound",
  "reduced-motion-hides-content",
  "empty-heading",
  "fake-testimonial",
  "lighthouse-phone",
  "lighthouse-desktop",
  "license-file",
] as const;

export type LaunchCheckRow = (typeof LAUNCH_CHECK_ROWS)[number];

export interface LaunchChecklistRun {
  url: string;
  at: string;
  answers: Readonly<Record<string, boolean>>;
}

export interface LaunchCheckComparison {
  id: LaunchCheckRow;
  staging: boolean;
  live: boolean;
}

export interface LaunchChecklistReport {
  status: "PASS" | "BLOCKER";
  reopened: boolean;
  procedureFailed: boolean;
  /** This checklist never deploys. */
  deployed: false;
  deltaMs: number;
  rows: LaunchCheckComparison[];
  reasons: string[];
}

/** Fill the yes or no rows from measured evidence. Does not fetch or deploy. */
export function prepareLaunchChecklist(input: {
  url: string;
  at: string;
  floor: Readonly<Record<string, boolean>>;
  phoneLighthouse: unknown;
  desktopLighthouse: unknown;
  licenseFilePresent: boolean;
}): LaunchChecklistRun {
  const phone = judgePhoneLighthouse(input.phoneLighthouse).status === "PASS";
  const desktop = judgePhoneLighthouse(input.desktopLighthouse).status === "PASS";
  const answers: Record<string, boolean> = {};
  for (const id of LAUNCH_CHECK_ROWS) {
    if (id === "lighthouse-phone") answers[id] = phone;
    else if (id === "lighthouse-desktop") answers[id] = desktop;
    else if (id === "license-file") answers[id] = input.licenseFilePresent === true;
    else answers[id] = input.floor[id] === true;
  }
  return { url: input.url, at: input.at, answers };
}

/**
 * Judge the staging run and the live run. A gap over an hour fails the
 * procedure even when every row is yes. A live no reopens the launch.
 */
export function judgeLaunchChecklist(
  staging: LaunchChecklistRun,
  live: LaunchChecklistRun,
): LaunchChecklistReport {
  const reasons: string[] = [];
  const rows: LaunchCheckComparison[] = LAUNCH_CHECK_ROWS.map((id) => ({
    id,
    staging: staging.answers[id] === true,
    live: live.answers[id] === true,
  }));
  if (staging.url.trim() === "" || live.url.trim() === "") {
    reasons.push("The checklist needs a staging URL and a live URL.");
  }
  const stagingMs = Date.parse(staging.at);
  const liveMs = Date.parse(live.at);
  let deltaMs = 0;
  let procedureFailed = false;
  if (!Number.isFinite(stagingMs) || !Number.isFinite(liveMs)) {
    procedureFailed = true;
    reasons.push("The checklist timestamps are not readable.");
  } else {
    deltaMs = liveMs - stagingMs;
    if (deltaMs < 0) {
      procedureFailed = true;
      reasons.push("The live checklist ran before staging.");
    } else if (deltaMs > LAUNCH_WINDOW_MS) {
      procedureFailed = true;
      reasons.push("The live checklist ran more than an hour after staging.");
    }
  }
  const stagingNo = rows.filter((row) => !row.staging).map((row) => row.id);
  const liveNo = rows.filter((row) => !row.live).map((row) => row.id);
  if (stagingNo.length > 0) reasons.push(`Staging failed ${stagingNo.join(", ")}.`);
  const reopened = liveNo.length > 0;
  if (reopened) {
    reasons.push(
      `Live failed ${liveNo.join(", ")}. A staging pass does not waive a live failure.`,
    );
  }
  return {
    status: reasons.length === 0 ? "PASS" : "BLOCKER",
    reopened,
    procedureFailed,
    deployed: false,
    deltaMs,
    rows,
    reasons,
  };
}

/**
 * Plain record of a live check.
 *
 * The four phone scores, every route, the secure address, and the share
 * card are the pass. A 404 names that route. This text is what a person
 * reads. It does not mention the tools that produced the numbers.
 */
export interface PostCheckSummary {
  ok: boolean;
  lines: string[];
}

export interface LiveCheckRecord {
  ok: boolean;
  lines: string[];
  closer: string;
}

export interface GoodDeploy {
  target: "preview" | "hostinger" | "vercel" | "netlify" | "cloudflare";
  shape: "static" | "node";
  url: string;
}

function isGoodTarget(value: string): value is GoodDeploy["target"] {
  return value === "preview" || value === "hostinger" || value === "vercel" || value === "netlify" || value === "cloudflare";
}

const PASSED = "The live check passed.";
const FAILED = "The live check failed.";
const ROW = /^- \S+ — (preview|hostinger|vercel|netlify|cloudflare) — (static|node) — (\S+) — (\S+)\s*$/;

const PHONE_ROWS = [
  ["performance", "Phone speed"],
  ["accessibility", "Phone reading"],
  ["bestPractices", "Phone care"],
  ["seo", "Phone search"],
] as const;

function calm(value: string): string {
  return value.replace(/!/g, ".").replace(/\u2014/g, ",").replace(/\s+/g, " ").trim();
}

function formatScore(score: number): string {
  const rounded = Math.round(score * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function joinAnd(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "its details";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  const last = items[items.length - 1] ?? "its details";
  return `${items.slice(0, -1).join(", ")}, and ${last}`;
}

function phoneLines(report: PostDeployReport): string[] {
  const scores = report.lighthouse.scores;
  if (scores === null) return ["The phone check did not finish."];
  return PHONE_ROWS.map(([key, label]) => {
    const score = scores[key];
    const shown = formatScore(score);
    if (score < PHONE_CATEGORY_FLOOR) return `${label} is ${shown}, below ${PHONE_CATEGORY_FLOOR}.`;
    return `${label} is ${shown}, which meets ${PHONE_CATEGORY_FLOOR}.`;
  });
}

function routeLine(route: RouteCheck): string {
  const label = calm(route.route) === "" ? "/" : calm(route.route);
  if (route.status === 404) return `Page ${label} was not found (404).`;
  if (!route.ok || route.status !== 200) return `Page ${label} answered with status ${route.status}.`;
  return `Page ${label} answered.`;
}

function httpsLine(report: PostDeployReport): string {
  if (report.https.ok) return "The address is secure, and browsers are asked to stay on https.";
  if (report.https.reason.includes("not https")) return "The address is not a secure https address.";
  return "The address is secure, and it is missing the setting that keeps browsers on https.";
}

function ogLine(report: PostDeployReport): string {
  if (report.og.ok) return "The share card has a title, a description, and an image.";
  const missing: string[] = [];
  if (report.og.title.trim() === "") missing.push("a title");
  if (report.og.description.trim() === "") missing.push("a description");
  if (report.og.image.trim() === "") missing.push("an image");
  return `The share card is missing ${joinAnd(missing)}.`;
}

function homeLine(result: PostCheckResult): string | null {
  if (result.ok) return null;
  if (result.skipped) return "The home page check waited, because the publish did not finish.";
  if (result.reason === "site name missing") return "The home page is missing the site name.";
  if (result.reason === "title missing") return "The home page is missing a title.";
  if (result.reason === "too many redirects") return "The home page was redirected too many times.";
  if (result.reason.startsWith("status ")) return `The home page answered with status ${result.reason.slice("status ".length)}.`;
  return "The home page check did not pass.";
}

/** Sentences for the phone check, the routes, the secure address, and the share card. */
export function summarizePostCheck(report: PostDeployReport): PostCheckSummary {
  const lines = [...phoneLines(report), ...report.routes.map(routeLine), httpsLine(report), ogLine(report)];
  const home = homeLine(report.homepage);
  if (home !== null) lines.push(home);
  if (report.redirects.some((row) => !row.ok)) {
    lines.push("The plain address did not move to the secure one.");
  }
  const phoneOk =
    report.lighthouse.status === "PASS" &&
    report.lighthouse.scores !== null &&
    report.lighthouse.scores.performance >= PHONE_CATEGORY_FLOOR &&
    report.lighthouse.scores.accessibility >= PHONE_CATEGORY_FLOOR &&
    report.lighthouse.scores.bestPractices >= PHONE_CATEGORY_FLOOR &&
    report.lighthouse.scores.seo >= PHONE_CATEGORY_FLOOR;
  const routesOk = report.routes.every((route) => route.ok && route.status === 200);
  const homeOk = report.homepage.skipped === false && report.homepage.ok === true;
  const redirectOk = report.redirects.every((row) => row.ok);
  const ok = phoneOk && routesOk && report.https.ok === true && report.og.ok === true && homeOk && redirectOk;
  const calmLines = lines.map(calm).filter((line) => line.length > 0);
  if (calmLines.length === 0) calmLines.push("The live check did not report a result.");
  return { ok, lines: calmLines };
}

/** Markdown appended under a deploy row. A 404 route is named. The earlier rows stay. */
export function renderPostCheckSection(report: PostDeployReport): string {
  const summary = summarizePostCheck(report);
  const bullets = summary.lines.map((line) => `- ${line}`).join("\n");
  const closer = summary.ok ? PASSED : FAILED;
  return `## Post-check\n\n${bullets}\n\n${closer}\n`;
}

function isEnoent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

async function appendDeployText(projectDir: string, section: string): Promise<string> {
  const dir = path.join(projectDir, ".hitchhiker", "deploy");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "DEPLOYS.md");
  let previous = "";
  try {
    previous = await readFile(file, "utf8");
  } catch (error) {
    if (!isEnoent(error)) throw error;
  }
  const header = "# Deploys\n\nA row is written only after a deploy runs with an explicit yes.\n\n";
  const body = section.trim();
  const next = previous.trim() === "" ? `${header}${body}\n` : `${previous.trimEnd()}\n${body}\n`;
  await writeFile(file, next, "utf8");
  return file;
}

/**
 * Append a post-check section. The deploy rows already in the file stay.
 * This does not call a host and does not fetch.
 */
export async function appendPostCheckSection(projectDir: string, report: PostDeployReport): Promise<string> {
  return appendDeployText(projectDir, renderPostCheckSection(report));
}

/** Append one plain sentence when the live check did not run. */
export async function appendPostCheckNote(projectDir: string, note: string): Promise<string> {
  const line = calm(note);
  if (line === "") throw new Error("post-check note is empty");
  return appendDeployText(projectDir, `## Post-check\n\n${line}\n`);
}

/**
 * Run the injected checkers and append the section.
 * The caller supplies the runners. This function does not open its own.
 */
export async function recordLiveCheck(
  projectDir: string,
  url: string,
  routes: readonly string[],
  deps: PostDeployDeps,
): Promise<LiveCheckRecord> {
  const report = await postDeployChecks(url, routes, deps);
  const summary = summarizePostCheck(report);
  await appendPostCheckSection(projectDir, report);
  return {
    ok: summary.ok,
    lines: summary.lines,
    closer: summary.ok ? PASSED : FAILED,
  };
}

/**
 * The newest completed row whose post-check did not fail.
 * A row with no post-check section still counts. A failed section does not.
 */
export function readLastGoodDeploy(markdown: string): GoodDeploy | null {
  const lines = markdown.split(/\r?\n/);
  const starts: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (ROW.test(lines[index] ?? "")) starts.push(index);
  }
  for (let index = starts.length - 1; index >= 0; index -= 1) {
    const start = starts[index];
    if (start === undefined) continue;
    const end = starts[index + 1] ?? lines.length;
    const match = ROW.exec(lines[start] ?? "");
    if (match === null) continue;
    const target = match[1];
    const shape = match[2];
    const state = match[3];
    const url = match[4];
    if (target === undefined || shape === undefined || state === undefined || url === undefined) continue;
    if (state !== "completed") continue;
    if (shape !== "static" && shape !== "node") continue;
    const chunk = lines.slice(start, end).join("\n");
    if (chunk.includes(FAILED)) continue;
    if (!isGoodTarget(target)) continue;
    return { target, shape, url };
  }
  return null;
}
