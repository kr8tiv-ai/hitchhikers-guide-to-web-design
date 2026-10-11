/**
 * Per-source install hosts. A download may follow redirects only onto the
 * list for the source it started on. There is no list that covers every tool.
 * A suffix matches on a dot boundary: ".hf.co" matches "us.aws.cdn.hf.co"
 * and rejects "evilhf.co" and "hf.co.evil.com".
 */

export interface HostPattern {
  /** "exact" is one host. "suffix" is a dot-boundary ending such as ".hf.co". */
  kind: "exact" | "suffix";
  value: string;
}

export interface SourcePolicy {
  id: string;
  recipeHosts: readonly string[];
  redirectHosts: readonly HostPattern[];
}

const GITHUB: SourcePolicy = {
  id: "github",
  recipeHosts: ["github.com"],
  redirectHosts: [
    { kind: "exact", value: "github.com" },
    { kind: "exact", value: "objects.githubusercontent.com" },
    { kind: "exact", value: "release-assets.githubusercontent.com" },
  ],
};

const HUGGINGFACE: SourcePolicy = {
  id: "huggingface",
  recipeHosts: ["huggingface.co"],
  redirectHosts: [
    { kind: "exact", value: "huggingface.co" },
    { kind: "suffix", value: ".hf.co" },
    { kind: "exact", value: "cdn-lfs.huggingface.co" },
    { kind: "exact", value: "cdn-lfs-us-1.huggingface.co" },
    { kind: "exact", value: "us.aws.cdn.hf.co" },
  ],
};

const XAI: SourcePolicy = {
  id: "xai",
  recipeHosts: ["x.ai", "docs.x.ai"],
  redirectHosts: [
    { kind: "exact", value: "x.ai" },
    { kind: "exact", value: "docs.x.ai" },
  ],
};

const NPM: SourcePolicy = {
  id: "npm",
  recipeHosts: ["registry.npmjs.org"],
  redirectHosts: [{ kind: "exact", value: "registry.npmjs.org" }],
};

const PLAYWRIGHT: SourcePolicy = {
  id: "playwright",
  recipeHosts: ["playwright.dev"],
  redirectHosts: [
    { kind: "exact", value: "playwright.dev" },
    { kind: "exact", value: "cdn.playwright.dev" },
  ],
};

const POPPLER: SourcePolicy = {
  id: "poppler",
  recipeHosts: ["poppler.freedesktop.org"],
  redirectHosts: [{ kind: "exact", value: "poppler.freedesktop.org" }],
};

export const SOURCE_POLICIES: readonly SourcePolicy[] = [
  GITHUB,
  HUGGINGFACE,
  XAI,
  NPM,
  PLAYWRIGHT,
  POPPLER,
];

const TOOL_POLICIES: Record<string, readonly SourcePolicy[]> = {
  grok: [XAI, NPM],
  playwright: [PLAYWRIGHT],
  whisper: [GITHUB, HUGGINGFACE],
  pdftotext: [POPPLER],
};

export function unrecognizedHostMessage(host: string): string {
  return `The download was sent to a server we do not recognize (${host}), so we stopped. Nothing was installed. Try again, or install by hand with the steps below.`;
}

export function insecureHopMessage(): string {
  return "The download tried to switch to an insecure http connection. Install URLs must stay on https, so we stopped. Nothing was installed. Try again, or install by hand with the steps below.";
}

export function assertRecipeUrl(url: string): void {
  const parsed = parseHttps(url);
  const host = parsed.hostname.toLowerCase();
  if (policyForHost(host) === null) throw new Error(unrecognizedHostMessage(host));
  assertRecipePath(host, parsed.pathname);
}

/**
 * `originUrl` is the recipe URL the download started from.
 * Every hop, including the last one, must sit on that source's list.
 */
export function assertRedirectUrl(url: string, originUrl: string): void {
  const parsed = parseHttps(url);
  const host = parsed.hostname.toLowerCase();
  const origin = parseHttps(originUrl);
  const policy = policyForHost(origin.hostname.toLowerCase());
  if (policy === null) throw new Error(unrecognizedHostMessage(origin.hostname.toLowerCase()));
  if (!hostAllowed(host, policy)) throw new Error(unrecognizedHostMessage(host));
}

export function hostAllowed(host: string, policy: SourcePolicy): boolean {
  const name = normalizeHost(host);
  for (const pattern of policy.redirectHosts) {
    if (pattern.kind === "exact") {
      if (name === pattern.value) return true;
      continue;
    }
    const suffix = pattern.value;
    if (!suffix.startsWith(".")) continue;
    if (name.endsWith(suffix) && name.length > suffix.length) return true;
  }
  return false;
}

export function policyForHost(host: string): SourcePolicy | null {
  const name = normalizeHost(host);
  for (const policy of SOURCE_POLICIES) {
    if (policy.recipeHosts.includes(name)) return policy;
  }
  return null;
}

export function allowedHostLabels(policy: SourcePolicy): string[] {
  return policy.redirectHosts.map((pattern) =>
    pattern.kind === "suffix" ? `*${pattern.value}` : pattern.value,
  );
}

/** Hosts the dialog may name for this tool. The same lists gate redirects. */
export function allowedHostsForTool(tool: string, urls: readonly string[]): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  const push = (label: string): void => {
    if (seen.has(label)) return;
    seen.add(label);
    labels.push(label);
  };
  for (const url of urls) {
    if (url.length === 0) continue;
    let host = "";
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      continue;
    }
    const policy = policyForHost(host);
    if (policy === null) continue;
    for (const label of allowedHostLabels(policy)) push(label);
  }
  const extras = TOOL_POLICIES[tool] ?? [];
  for (const policy of extras) {
    for (const label of allowedHostLabels(policy)) push(label);
  }
  return labels;
}

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/\.+$/, "");
}

function parseHttps(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid install URL: ${url}`);
  }
  if (parsed.protocol !== "https:") throw new Error(insecureHopMessage());
  if (parsed.username !== "" || parsed.password !== "") {
    throw new Error(`Install URL must not carry userinfo: ${url}`);
  }
  return parsed;
}

function assertRecipePath(host: string, pathname: string): void {
  if (host === "github.com") {
    const ok =
      pathname === "/ggml-org/whisper.cpp" ||
      pathname.startsWith("/ggml-org/whisper.cpp/releases/");
    if (!ok) throw new Error(`Host github.com rejected path ${pathname}.`);
  }
  if (host === "huggingface.co") {
    if (!pathname.startsWith("/ggerganov/whisper.cpp/resolve/main/ggml-")) {
      throw new Error(`Host huggingface.co rejected path ${pathname}.`);
    }
  }
  if (host === "x.ai" || host === "docs.x.ai") {
    if (!pathname.startsWith("/docs/") && !pathname.startsWith("/cli/")) {
      throw new Error(`Host ${host} rejected path ${pathname}.`);
    }
  }
  if (host === "playwright.dev" && !pathname.startsWith("/docs/")) {
    throw new Error(`Host playwright.dev rejected path ${pathname}.`);
  }
}
