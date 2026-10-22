/**
 * Desk identity files. Paths are an allow-list. User input never joins a directory.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { packagedPackage } from "@hitchhiker/engine";

const PUBLIC_ROOT = path.join(packagedPackage("app"), "public");

const RELATIVE: Record<string, string> = {
  "/favicon.svg": "favicon.svg",
  "/favicon.ico": "favicon.ico",
  "/apple-touch-icon.png": "apple-touch-icon.png",
  "/social-card.png": "social-card.png",
  "/manifest.webmanifest": "manifest.webmanifest",
  "/icons/icon-192.png": "icons/icon-192.png",
  "/icons/icon-512.png": "icons/icon-512.png",
  "/icons/icon-maskable-192.png": "icons/icon-maskable-192.png",
  "/icons/icon-maskable-512.png": "icons/icon-maskable-512.png",
  "/brand/logo-mark.svg": "brand/logo-mark.svg",
  "/brand/logo-mark-dark.svg": "brand/logo-mark-dark.svg",
  "/brand/logo-lockup.svg": "brand/logo-lockup.svg",
  "/brand/social-card.svg": "brand/social-card.svg",
};

if (existsSync(path.join(PUBLIC_ROOT, "sw.js"))) {
  RELATIVE["/sw.js"] = "sw.js";
}

const TYPES: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".js": "text/javascript; charset=utf-8",
};

export const IDENTITY_CACHE = { "cache-control": "no-cache" } as const;

/** file: serve it. missing: 404. no: not an identity route. */
export function identityClaim(pathname: string): "file" | "missing" | "no" {
  if (pathname.includes("\\") || pathname.includes("\0") || pathname.includes("..")) {
    if (pathname.startsWith("/icons/") || pathname.startsWith("/brand/") || pathname.startsWith("/favicon")) {
      return "missing";
    }
    return "no";
  }
  if (RELATIVE[pathname] !== undefined) return "file";
  if (pathname.startsWith("/icons/")) return "missing";
  if (pathname.startsWith("/brand/") && pathname !== "/brand/logo") return "missing";
  return "no";
}

export function loadIdentity(pathname: string): { type: string; body: Buffer } | null {
  const rel = RELATIVE[pathname];
  if (rel === undefined) return null;
  const full = path.resolve(PUBLIC_ROOT, rel);
  const fromRoot = path.relative(PUBLIC_ROOT, full);
  if (fromRoot.startsWith("..") || path.isAbsolute(fromRoot)) return null;
  const ext = path.extname(rel).toLowerCase();
  const type = TYPES[ext];
  if (type === undefined) return null;
  return { type, body: readFileSync(full) };
}
