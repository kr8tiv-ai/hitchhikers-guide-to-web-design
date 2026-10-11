/**
 * Official hosts only. Recipe URLs are checked against the path rules.
 * Redirects may land on the vendor CDN after the first hop.
 */

const RECIPE_HOSTS = new Set([
  "github.com",
  "huggingface.co",
  "x.ai",
  "docs.x.ai",
  "playwright.dev",
  "poppler.freedesktop.org",
]);

const REDIRECT_EXACT = new Set([
  "release-assets.githubusercontent.com",
  "objects.githubusercontent.com",
  "cdn-lfs.huggingface.co",
  "cdn-lfs-us-1.huggingface.co",
  "cas-bridge.xethub.hf.co",
]);

export function assertRecipeUrl(url: string): void {
  const parsed = parseHttps(url);
  const host = parsed.hostname.toLowerCase();
  if (!RECIPE_HOSTS.has(host)) {
    throw new Error(`Host ${host} is not an official install source.`);
  }
  assertRecipePath(host, parsed.pathname);
}

export function assertRedirectUrl(url: string): void {
  const parsed = parseHttps(url);
  const host = parsed.hostname.toLowerCase();
  if (RECIPE_HOSTS.has(host)) {
    assertRecipePath(host, parsed.pathname);
    return;
  }
  if (REDIRECT_EXACT.has(host)) return;
  if (host.endsWith(".githubusercontent.com")) return;
  if (host.endsWith(".huggingface.co")) return;
  throw new Error(`Host ${host} is not an official install source.`);
}

function parseHttps(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid install URL: ${url}`);
  }
  if (parsed.protocol !== "https:") throw new Error(`Install URL must be https: ${url}`);
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
