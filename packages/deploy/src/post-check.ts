/**
 * One check of a completed deploy URL.
 *
 * Queued and failed states match DeployResult and skip the fetch.
 * The caller injects fetchImpl. This module does not open a socket
 * and does not log the response body. More than three redirects fail
 * the check. file: and other non-http(s) URLs throw.
 */

import type { DeployResult } from "./types.ts";

const REDIRECT_CAP = 3;

export interface PostCheckPage {
  status: number;
  body: string;
  redirects: number;
}

export interface PostCheckInput {
  state: DeployResult["state"];
  url: string;
  siteName: string;
  fetchImpl: (url: string) => Promise<PostCheckPage>;
}

export interface PostCheckResult {
  skipped: boolean;
  ok: boolean;
  reason: string;
}

function titleText(body: string): string {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(body);
  if (match === null) return "";
  return match[1].replace(/\s+/g, " ").trim();
}

function assertWebUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("url must be http or https");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("url must be http or https");
  }
}

export async function postCheck(input: PostCheckInput): Promise<PostCheckResult> {
  if (input.siteName.trim().length === 0) {
    throw new Error("siteName is empty");
  }
  if (input.state !== "completed") {
    return { skipped: true, ok: false, reason: input.state };
  }
  assertWebUrl(input.url);
  const page = await input.fetchImpl(input.url);
  if (page.redirects > REDIRECT_CAP) {
    return { skipped: false, ok: false, reason: "too many redirects" };
  }
  if (page.status !== 200) {
    return { skipped: false, ok: false, reason: `status ${page.status}` };
  }
  if (!page.body.includes(input.siteName)) {
    return { skipped: false, ok: false, reason: "site name missing" };
  }
  if (titleText(page.body).length === 0) {
    return { skipped: false, ok: false, reason: "title missing" };
  }
  return { skipped: false, ok: true, reason: "ok" };
}
