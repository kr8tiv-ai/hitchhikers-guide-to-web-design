/**
 * Policy gate for the design library. One mode, with the reason recorded.
 * A refused item is not fetched and is not retried around this gate.
 */

import { CODE_LICENSES } from "./design-library.ts";

export type IngestMode = "code" | "feed" | "link-only" | "refuse";

export interface RobotsDecision {
  allowed: boolean;
  via: "auto" | "add";
}

export interface PolicyResult {
  mode: IngestMode;
  reason: string;
}

const CODE_SET = new Set<string>(CODE_LICENSES);

const AUTO_REFUSE_HOSTS = [
  "awwwards.com",
  "godly.website",
  "recent.design",
  "aura.build",
  "mobbin.com",
  "refero.design",
  "thefwa.com",
  "cssdesignawards.com",
];

const FEED_HOSTS = ["land-book.com", "lapa.ninja", "registry.npmjs.org"];

export function ingestPolicy(
  source: string,
  url: string,
  license: string | null,
  robots: RobotsDecision,
): PolicyResult {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { mode: "refuse", reason: "The URL could not be read." };
  }
  const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
  if (parsed.pathname.startsWith("/api/") && host === "www.siteinspire.com" || (host === "siteinspire.com" && parsed.pathname.startsWith("/api/"))) {
    return { mode: "refuse", reason: "Siteinspire /api/ is refused." };
  }
  if (!robots.allowed) return { mode: "refuse", reason: "robots.txt disallows the path." };

  if (AUTO_REFUSE_HOSTS.some((item) => host === item || host.endsWith(`.${item}`))) {
    if (robots.via === "add") {
      return { mode: "link-only", reason: `${host} is accepted only as a link, our notes, and our own screenshots.` };
    }
    return { mode: "refuse", reason: `${host} is refused on the automated path.` };
  }

  const spdx = (license ?? "").trim();
  const feed = source === "land-book" || source === "lapa" || source === "feed" || FEED_HOSTS.some((item) => host === item || host.endsWith(`.${item}`)) || parsed.pathname.endsWith("/rss.xml");
  if (host === "github.com" && CODE_SET.has(spdx)) {
    return { mode: "code", reason: `GitHub license ${spdx} is on the code allowlist.` };
  }
  if (host === "github.com") {
    return { mode: "link-only", reason: "A missing, custom, GPL, or AGPL license stores no code." };
  }
  if (feed && !CODE_SET.has(spdx)) {
    return { mode: "feed", reason: "A public feed supplies titles, links, and credit. No code is stored." };
  }
  if (CODE_SET.has(spdx) && (source === "codrops" || source === "official-docs" || source === "github")) {
    return { mode: "code", reason: `License ${spdx} is on the code allowlist.` };
  }
  if (source === "codrops" && spdx === "") {
    return { mode: "refuse", reason: "Codrops is skipped when no license is stated." };
  }
  if (robots.via === "add" || source === "direct" || source === "candidate") {
    return { mode: "link-only", reason: "A supplied public page is stored as a link, our notes, and our own screenshots." };
  }
  return { mode: "link-only", reason: "The automated path stores a link and our notes when the host is allowed." };
}

export const DESIGN_LIBRARY_USER_AGENT = "HitchhikerGuideDesignLibrary/0.1 (design library ingest; respects robots)";

export function robotsAllow(body: string, pathname: string, agent = "HitchhikerGuideDesignLibrary"): boolean {
  const groups = body.split(/\r?\n\s*\r?\n/);
  let matched: string[] = [];
  let star: string[] = [];
  for (const group of groups.length > 0 ? groups : [body]) {
    const lines = group.split(/\r?\n/).map((line) => line.replace(/#.*$/, "").trim()).filter((line) => line !== "");
    const agents = lines.filter((line) => /^user-agent:/i.test(line)).map((line) => line.split(":").slice(1).join(":").trim().toLowerCase());
    const rules = lines.filter((line) => /^disallow:/i.test(line)).map((line) => line.split(":").slice(1).join(":").trim());
    if (agents.includes("*")) star = rules;
    if (agents.some((name) => name !== "*" && agent.toLowerCase().includes(name))) matched = rules;
  }
  const rules = matched.length > 0 ? matched : star;
  return !rules.some((rule) => rule !== "" && pathname.startsWith(rule));
}
