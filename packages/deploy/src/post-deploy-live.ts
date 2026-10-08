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

import { postCheck, type PostCheckResult } from "./post-check.ts";

const FLOOR = 90;
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
