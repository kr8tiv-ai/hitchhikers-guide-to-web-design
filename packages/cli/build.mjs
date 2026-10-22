/**
 * Bundle the CLI and the modules it loads by file URL.
 * Copies desk assets, skills, templates, and knowledge packs under dist/shipped.
 * Source package.json keeps bin ./src/main.ts. npm pack overlays publishConfig.
 */
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const cliRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.resolve(cliRoot, "..", "..");
const distDir = path.join(cliRoot, "dist");
const shippedRoot = path.join(distDir, "shipped");
const shippedPackages = path.join(shippedRoot, "packages");

const SKIP_DIR = new Set(["node_modules", "dist", "test", "e2e", ".git", "coverage"]);

const COPY_TREES = [
  ["packages/app/public", "packages/app/public"],
  ["packages/app/src", "packages/app/src"],
  ["packages/grok-plugin/skills", "packages/grok-plugin/skills"],
  ["packages/grok-plugin/agents", "packages/grok-plugin/agents"],
  ["packages/grok-plugin/hooks", "packages/grok-plugin/hooks"],
  ["packages/grok-plugin/rules", "packages/grok-plugin/rules"],
  ["packages/grok-plugin/src", "packages/grok-plugin/src"],
  ["packages/grok-plugin/.grok-plugin", "packages/grok-plugin/.grok-plugin"],
  ["packages/knowledge/packs", "packages/knowledge/packs"],
  ["packages/knowledge/golden", "packages/knowledge/golden"],
  ["packages/knowledge/design-library", "packages/knowledge/design-library"],
  ["packages/knowledge/galleries", "packages/knowledge/galleries"],
  ["packages/knowledge/language-pack", "packages/knowledge/language-pack"],
  ["packages/knowledge/skills", "packages/knowledge/skills"],
  ["packages/templates/astro-default", "packages/templates/astro-default"],
  ["packages/templates/next-app", "packages/templates/next-app"],
  ["packages/templates/vite-react-world", "packages/templates/vite-react-world"],
  ["packages/templates/recipes", "packages/templates/recipes"],
  ["packages/templates/shared", "packages/templates/shared"],
  ["packages/engine/templates", "packages/engine/templates"],
];

const COPY_FILES = [
  ["interview/tree.yaml", "interview/tree.yaml"],
  ["samples/towel-day.hhproject", "samples/towel-day.hhproject"],
  ["context/research/03-awwwards-anatomy.md", "context/research/03-awwwards-anatomy.md"],
  ["packages/engine/src/brand/tokens.ts", "packages/engine/src/brand/tokens.ts"],
  ["packages/engine/src/spec/design-outputs.ts", "packages/engine/src/spec/design-outputs.ts"],
];

/** Dynamic file-URL loads. esbuild writes each one to the mirrored path under dist/shipped. */
const SIDE_ENTRIES = [
  "packages/qa/src/review-project.ts",
  "packages/qa/src/elevate-loop.ts",
  "packages/qa/src/elevate-rounds.ts",
  "packages/qa/src/site-once-over.ts",
  "packages/qa/src/detail-pass.ts",
  "packages/qa/src/copy-refine.ts",
  "packages/qa/src/report.ts",
  "packages/orchestrator/src/elevate-drive.ts",
  "packages/orchestrator/src/ship-gate.ts",
  "packages/deploy/src/post-deploy-live.ts",
  "packages/deploy/src/dispatch.ts",
  "packages/deploy/src/cli-run.ts",
  "packages/app/src/server/server.ts",
  "packages/assets/src/imagine-run.ts",
  "packages/assets/src/imagine-http.ts",
  "packages/assets/src/keychain.ts",
  "packages/assets/src/slots.ts",
  "packages/assets/src/diy-pack.ts",
  "packages/assets/src/diy-import.ts",
  "packages/assets/src/section-generate.ts",
  "packages/engine/src/tools/discover.ts",
  "packages/engine/src/tools/install.ts",
  "packages/engine/src/spec/before-jump.ts",
  "packages/templates/src/section-render.ts",
  "packages/templates/shared/preloader.ts",
  "packages/templates/shared/webgl.ts",
  "packages/knowledge/src/design-library.ts",
  "packages/voice/src/whisper.ts",
  "packages/voice/src/xai-stt.ts",
];

function keepCopy(src) {
  const base = path.basename(src);
  if (SKIP_DIR.has(base)) return false;
  if (base.endsWith(".tsbuildinfo")) return false;
  return true;
}

async function copyTree(fromRel, toRel) {
  const from = path.join(repoRoot, fromRel);
  if (!existsSync(from)) return;
  const to = path.join(shippedRoot, toRel);
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to, { recursive: true, filter: keepCopy });
}

async function copyFile(fromRel, toRel) {
  const from = path.join(repoRoot, fromRel);
  if (!existsSync(from)) throw new Error(`Missing ship file: ${fromRel}`);
  const to = path.join(shippedRoot, toRel);
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to);
}

function packageNameOf(specifier) {
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return `${scope}/${name}`;
  }
  return specifier.split("/")[0] ?? specifier;
}

function hitchhikerPlugin() {
  return {
    name: "hitchhiker-packages",
    setup(build) {
      build.onResolve({ filter: /^@hitchhiker\// }, (args) => {
        const rest = args.path.slice("@hitchhiker/".length);
        const slash = rest.indexOf("/");
        if (slash !== -1) {
          return { errors: [{ text: `Deep import is not bundled: ${args.path}` }] };
        }
        const entry = path.join(repoRoot, "packages", rest, "src", "index.ts");
        if (!existsSync(entry)) {
          return { errors: [{ text: `No package entry for ${args.path}` }] };
        }
        return { path: entry };
      });
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.path.startsWith("@hitchhiker/")) return undefined;
        if (args.path.startsWith(".") || path.isAbsolute(args.path)) return undefined;
        if (args.kind === "entry-point") return undefined;
        return { path: args.path, external: true };
      });
      build.onLoad({ filter: /[\\/]packages[\\/]cli[\\/]src[\\/]main\.ts$/ }, async (args) => {
        const text = await readFile(args.path, "utf8");
        return { contents: text.replace(/^#![^\n]*\n/, ""), loader: "ts" };
      });
    },
  };
}

function externalsFrom(metafile) {
  const names = new Set();
  for (const output of Object.values(metafile.outputs)) {
    for (const item of output.imports) {
      if (item.external !== true) continue;
      if (item.path.startsWith("node:")) continue;
      names.add(packageNameOf(item.path));
    }
  }
  return names;
}

async function declaredDependencies() {
  const raw = JSON.parse(await readFile(path.join(cliRoot, "package.json"), "utf8"));
  const published = raw.publishConfig?.dependencies;
  if (typeof published !== "object" || published === null) {
    throw new Error("publishConfig.dependencies is missing");
  }
  return published;
}

async function assertDependencies(names) {
  const declared = await declaredDependencies();
  const missing = [...names].filter((name) => !(name in declared)).sort();
  if (missing.length > 0) {
    throw new Error(`publishConfig.dependencies is missing: ${missing.join(", ")}`);
  }
}

function assertNoRepoPath(label, text) {
  const forward = repoRoot.replaceAll("\\", "/");
  if (text.includes(repoRoot) || text.includes(forward)) {
    throw new Error(`${label} contains the repo path. Asset loads must use import.meta.url.`);
  }
}

async function buildBundle() {
  await rm(path.join(distDir, "main.js"), { force: true });
  await rm(shippedRoot, { recursive: true, force: true });
  await mkdir(shippedPackages, { recursive: true });

  for (const [from, to] of COPY_TREES) await copyTree(from, to);
  for (const [from, to] of COPY_FILES) await copyFile(from, to);

  const indexHtml = path.join(repoRoot, "packages", "app", "index.html");
  if (existsSync(indexHtml)) {
    await copyFile("packages/app/index.html", "packages/app/index.html");
  }

  for (const rel of SIDE_ENTRIES) {
    if (!existsSync(path.join(repoRoot, rel))) throw new Error(`Missing side entry: ${rel}`);
  }

  const plugins = [hitchhikerPlugin()];
  const shared = {
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    legalComments: "none",
    sourcemap: false,
    metafile: true,
    plugins,
    logLevel: "warning",
    loader: {
      ".css": "text",
      ".svg": "text",
      ".astro": "text",
      ".md": "text",
      ".woff": "empty",
      ".woff2": "empty",
      ".png": "empty",
      ".jpg": "empty",
      ".jpeg": "empty",
      ".webp": "empty",
      ".gif": "empty",
      ".mp4": "empty",
      ".webm": "empty",
    },
  };

  const main = await esbuild.build({
    ...shared,
    entryPoints: [path.join(cliRoot, "src", "main.ts")],
    outfile: path.join(distDir, "main.js"),
    splitting: false,
    banner: { js: "#!/usr/bin/env node" },
  });

  const side = await esbuild.build({
    ...shared,
    entryPoints: SIDE_ENTRIES.map((rel) => path.join(repoRoot, rel)),
    outdir: shippedPackages,
    outbase: path.join(repoRoot, "packages"),
    splitting: true,
    chunkNames: "chunks/[name]-[hash]",
  });

  await writeFile(
    path.join(shippedPackages, "qa", "package.json"),
    `${JSON.stringify({ name: "@hitchhiker/qa", private: true, type: "module" }, null, 2)}\n`,
  );

  const external = new Set([...externalsFrom(main.metafile), ...externalsFrom(side.metafile)]);
  await assertDependencies(external);

  const mainText = await readFile(path.join(distDir, "main.js"), "utf8");
  if (!mainText.startsWith("#!/usr/bin/env node\n")) {
    throw new Error("dist/main.js is missing the node shebang");
  }
  const firstLine = mainText.slice(0, mainText.indexOf("\n"));
  if (firstLine.includes("--experimental-strip-types")) {
    throw new Error("dist/main.js still asks Node to strip types");
  }
  assertNoRepoPath("dist/main.js", mainText);
  console.log(`bundled dist/main.js with ${external.size} external packages`);
}

await buildBundle();
