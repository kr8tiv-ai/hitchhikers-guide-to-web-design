/**
 * Minimal robots.txt: User-agent and Disallow only.
 * A body larger than 500 KiB is a deny, so a hostile file is not parsed.
 * Allow, Crawl-delay, and Sitemap lines are ignored.
 */

/** 500 KiB, measured as UTF-16 code units (String.length). Larger bodies deny. */
export const ROBOTS_MAX_CHARS = 500 * 1024;

export interface RobotsGroup {
  agents: string[];
  disallows: string[];
}

export interface RobotsRules {
  oversized: boolean;
  groups: RobotsGroup[];
}

export function parseRobots(body: string): RobotsRules {
  if (body.length > ROBOTS_MAX_CHARS) {
    return { oversized: true, groups: [] };
  }

  const source = body.charCodeAt(0) === 0xfeff ? body.slice(1) : body;
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let seenRule = false;

  for (const raw of source.split(/\r?\n/)) {
    const line = stripComment(raw).trim();
    if (line.length === 0) {
      current = null;
      seenRule = false;
      continue;
    }
    const sep = line.indexOf(":");
    if (sep < 0) continue;
    const key = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();
    if (key === "user-agent") {
      if (current === null || seenRule) {
        current = { agents: [], disallows: [] };
        groups.push(current);
        seenRule = false;
      }
      current.agents.push(value);
      continue;
    }
    if (current === null) continue;
    seenRule = true;
    if (key === "disallow") current.disallows.push(value);
  }

  return { oversized: false, groups };
}

/**
 * True when `robotsBody` allows `url` for `userAgent`.
 * `*` applies only when no specific product-token block matches.
 * An empty Disallow allows. `/` denies every path. `/admin` denies that
 * path and its children, not a longer sibling such as `/administrator`.
 */
export function allowed(url: string, robotsBody: string, userAgent: string): boolean {
  const rules = parseRobots(robotsBody);
  if (rules.oversized) return false;

  let pathname = "/";
  try {
    pathname = new URL(url).pathname;
  } catch {
    return false;
  }

  const groups = selectGroups(rules.groups, userAgent);
  if (groups === null) return true;
  for (const group of groups) {
    for (const rule of group.disallows) {
      if (ruleDenies(pathname, rule)) return false;
    }
  }
  return true;
}

function stripComment(line: string): string {
  const hash = line.indexOf("#");
  return hash === -1 ? line : line.slice(0, hash);
}

function productToken(userAgent: string): string {
  const token = userAgent.trim().split(/\s+/)[0] ?? "";
  const slash = token.indexOf("/");
  const product = slash === -1 ? token : token.slice(0, slash);
  return product.toLowerCase();
}

function agentMatches(rule: string, userAgent: string): boolean {
  const agent = rule.trim().toLowerCase();
  if (agent.length === 0 || agent === "*") return false;
  const full = userAgent.trim().toLowerCase();
  const product = productToken(userAgent);
  return agent === full || agent === product || product.startsWith(agent) || full.startsWith(agent);
}

function selectGroups(groups: readonly RobotsGroup[], userAgent: string): RobotsGroup[] | null {
  let best = 0;
  const specific: RobotsGroup[] = [];
  for (const group of groups) {
    let groupBest = 0;
    for (const agent of group.agents) {
      if (!agentMatches(agent, userAgent)) continue;
      const len = agent.trim().length;
      if (len > groupBest) groupBest = len;
    }
    if (groupBest === 0) continue;
    if (groupBest > best) {
      best = groupBest;
      specific.length = 0;
      specific.push(group);
    } else if (groupBest === best) {
      specific.push(group);
    }
  }
  if (specific.length > 0) return specific;

  const star = groups.filter((group) => group.agents.some((agent) => agent.trim() === "*"));
  return star.length > 0 ? star : null;
}

function ruleDenies(pathname: string, rule: string): boolean {
  if (rule.length === 0) return false;
  const path = rule.startsWith("/") ? rule : `/${rule}`;
  if (path === "/") return true;
  if (pathname === path) return true;
  const folder = path.endsWith("/") ? path : `${path}/`;
  return pathname.startsWith(folder);
}
