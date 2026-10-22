/**
 * Locates data and modules that ship beside the CLI.
 * Source walks up to the monorepo `packages/` tree.
 * A bundle's import.meta.url is `dist/main.js` or a file under `dist/shipped`,
 * so the same walk hits the copied tree first. Node will not run TypeScript
 * from inside node_modules, so a bundle prefers the compiled `.js`.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MARKERS: Record<string, string> = {
  app: "public",
  assets: "src",
  crawler: "src",
  deploy: "src",
  engine: "src",
  "grok-plugin": "skills",
  knowledge: "packs",
  orchestrator: "src",
  qa: "src",
  templates: "astro-default",
  voice: "src",
};

function hereFile(): string {
  return fileURLToPath(import.meta.url);
}

/** True when this module is running from the esbuild output, not from source. */
export function bundleRuntime(): boolean {
  const file = hereFile();
  const distSeg = `${path.sep}dist${path.sep}`;
  return (
    file.includes(distSeg) &&
    (file.endsWith(`${path.sep}main.js`) || file.includes(`${path.sep}shipped${path.sep}`))
  );
}

export function packagedPath(parts: readonly string[], marker: string): string {
  const start = path.dirname(hereFile());
  let dir = start;
  for (let hop = 0; hop < 12; hop += 1) {
    const candidates = [
      path.join(dir, "shipped", "packages", ...parts),
      path.join(dir, "packages", ...parts),
      path.join(dir, ...parts),
    ];
    for (const candidate of candidates) {
      if (existsSync(path.join(candidate, marker))) return path.resolve(candidate);
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(start, "..", "..", "..", "packages", ...parts);
}

export function packagedPackage(name: string): string {
  const marker = MARKERS[name] ?? "src";
  return packagedPath([name], marker);
}

/** A file inside a workspace package. `.ts` from source, `.js` from the bundle. */
export function packagedModule(pkg: string, relPosix: string): string {
  const root = packagedPackage(pkg);
  const rel = relPosix.split("/").join(path.sep);
  const tsFile = path.join(root, rel);
  const jsFile = tsFile.endsWith(".ts") ? `${tsFile.slice(0, -3)}.js` : tsFile;
  const fromBundle = bundleRuntime();
  if (fromBundle && existsSync(jsFile)) return jsFile;
  if (existsSync(tsFile)) return tsFile;
  if (existsSync(jsFile)) return jsFile;
  return fromBundle ? jsFile : tsFile;
}

/** A repo-root file such as `interview/tree.yaml`, or its copy under `dist/shipped`. */
export function shippedRepoFile(relPosix: string): string {
  const parts = relPosix.split("/");
  const start = path.dirname(hereFile());
  let dir = start;
  for (let hop = 0; hop < 12; hop += 1) {
    const candidates = [path.join(dir, "shipped", ...parts), path.join(dir, ...parts)];
    for (const candidate of candidates) {
      if (existsSync(candidate)) return path.resolve(candidate);
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(start, "..", "..", "..", ...parts);
}

export function interviewTreeFile(): string {
  return shippedRepoFile("interview/tree.yaml");
}
