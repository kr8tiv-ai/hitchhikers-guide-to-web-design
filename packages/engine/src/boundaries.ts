import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export interface PackageBoundary {
  name: string;
  allowDeps: readonly string[];
  /** Pinned third-party packages. Workspace edges stay in allowDeps. */
  allowExternal?: readonly string[];
}

/**
 * Allowed dependency edges. cli is published as hitchhikers-guide.
 * Nothing may depend on the cli package. grok-plugin stays isolated.
 * allowDeps values are workspace:*. allowExternal names a pinned package
 * from a later prompt (gsap on the app, prompt 010; the motion toolkit
 * on the app, prompt 038; pdfjs-dist on the engine, prompt 025;
 * opentype.js, @visioncortex/vtracer, and svgo on assets, prompt 055;
 * @resvg/resvg-js and pdf-lib on assets, prompt 063;
 * templates on engine for the brand truth gate, prompt 065;
 * @gltf-transform/core, @gltf-transform/extensions, @gltf-transform/functions,
 * draco3dgltf, and meshoptimizer on assets for 3D optimization, prompt 085).
 */
export const BOUNDARIES: readonly PackageBoundary[] = [
  { name: "@hitchhiker/engine", allowDeps: [], allowExternal: ["pdfjs-dist"] },
  { name: "@hitchhiker/orchestrator", allowDeps: ["@hitchhiker/engine"] },
  { name: "@hitchhiker/grok-plugin", allowDeps: [] },
  {
    name: "@hitchhiker/app",
    allowDeps: ["@hitchhiker/engine"],
    allowExternal: ["@theatre/core", "animejs", "gsap", "lenis", "motion", "ogl", "three"],
  },
  { name: "hitchhikers-guide", allowDeps: ["@hitchhiker/engine"] },
  { name: "@hitchhiker/voice", allowDeps: [] },
  { name: "@hitchhiker/crawler", allowDeps: [] },
  {
    name: "@hitchhiker/assets",
    allowDeps: ["@hitchhiker/engine"],
    allowExternal: [
      "@gltf-transform/core",
      "@gltf-transform/extensions",
      "@gltf-transform/functions",
      "@resvg/resvg-js",
      "@visioncortex/vtracer",
      "draco3dgltf",
      "meshoptimizer",
      "opentype.js",
      "pdf-lib",
      "svgo",
    ],
  },
  { name: "@hitchhiker/qa", allowDeps: ["@hitchhiker/engine"] },
  { name: "@hitchhiker/deploy", allowDeps: ["@hitchhiker/engine"] },
  { name: "@hitchhiker/knowledge", allowDeps: [] },
  { name: "@hitchhiker/templates", allowDeps: ["@hitchhiker/engine"] },
];

/** Package name, then a slash of either kind, then another path segment. */
const DEEP_IMPORT = /@hitchhiker[/\\][a-z-]+[/\\]/g;

const IMPORT_SPECIFIER =
  /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;

interface BoundaryHit {
  file: string;
  specifier: string;
}

function isDirectory(dir: string): boolean {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function walkTypeScriptFiles(dir: string, into: string[]): void {
  if (!isDirectory(dir)) {
    return;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTypeScriptFiles(full, into);
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".d.ts")
    ) {
      into.push(full);
    }
  }
}

function packageDirectories(root: string): string[] {
  const packagesDir = path.join(root, "packages");
  if (!isDirectory(packagesDir)) {
    return [];
  }
  const dirs: string[] = [];
  for (const name of readdirSync(packagesDir)) {
    const dir = path.join(packagesDir, name);
    if (isDirectory(dir)) {
      dirs.push(dir);
    }
  }
  return dirs;
}

function specifierAt(text: string, index: number): string {
  const slice = text.slice(index);
  const end = slice.search(/['"`\s]/);
  return end === -1 ? slice : slice.slice(0, end);
}

/** Deep imports look like a package name plus a slash. Scan .ts only. */
export function findDeepImports(root: string): BoundaryHit[] {
  const hits: BoundaryHit[] = [];
  for (const packageDir of packageDirectories(root)) {
    for (const folder of ["src", "test"]) {
      const files: string[] = [];
      walkTypeScriptFiles(path.join(packageDir, folder), files);
      for (const file of files) {
        const text = readFileSync(file, "utf8");
        const seen = new Set<string>();
        for (const match of text.matchAll(DEEP_IMPORT)) {
          if (match.index === undefined) {
            continue;
          }
          const specifier = specifierAt(text, match.index);
          if (seen.has(specifier)) {
            continue;
          }
          seen.add(specifier);
          hits.push({ file, specifier });
        }
      }
    }
  }
  return hits;
}

function importSpecifiers(text: string): string[] {
  const specs: string[] = [];
  for (const match of text.matchAll(IMPORT_SPECIFIER)) {
    const value = match[1];
    if (value !== undefined && value.length > 0) {
      specs.push(value);
    }
  }
  return specs;
}

/** Both separators count, so a Windows-style specifier is the same escape on every OS. */
function withPlatformSeparators(specifier: string): string {
  return specifier.split(/[\\/]/).join(path.sep);
}

function leavesPackage(
  file: string,
  specifier: string,
  packageRoot: string,
): boolean {
  if (!specifier.startsWith(".")) {
    return false;
  }
  const resolved = path.resolve(path.dirname(file), withPlatformSeparators(specifier));
  const relative = path.relative(packageRoot, resolved);
  return (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  );
}

function mentionsVendor(specifier: string): boolean {
  return specifier.replaceAll("\\", "/").includes("vendor/gsd-core");
}

/**
 * Imports of vendor/gsd-core, and relative imports that resolve outside
 * the package directory. A test may still import its own package by relative path.
 */
export function findEscapes(root: string): BoundaryHit[] {
  const hits: BoundaryHit[] = [];
  for (const packageDir of packageDirectories(root)) {
    const files: string[] = [];
    walkTypeScriptFiles(packageDir, files);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      const seen = new Set<string>();
      for (const specifier of importSpecifiers(text)) {
        if (!mentionsVendor(specifier) && !leavesPackage(file, specifier, packageDir)) {
          continue;
        }
        if (seen.has(specifier)) {
          continue;
        }
        seen.add(specifier);
        hits.push({ file, specifier });
      }
    }
  }
  return hits;
}
