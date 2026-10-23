/**
 * Build design-library/award-candidates.json from award showcases. Manual command, never CI.
 * Usage: pnpm --filter @hitchhiker/knowledge run library:discover -- [--since 2022-01-01]
 *
 * Sources and why:
 * - The FWA award listing (FOTD, FOTM, FOTY): robots.txt allows it; read at one page per 5 s.
 * - The curated gallery (galleries/curated.json): Awwwards SOTD, SOTY and Honorable Mention rows and GSAP
 *   showcase rows a person already verified. Awwwards itself is not crawled (239b policy and its terms).
 * Not read: Webby winners (robots.txt disallows the /api/ its pages load from), CSS Design Awards
 * (a bot challenge answers robots.txt; not bypassed), godly.website (now recent.design, not a site gallery).
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { curatedCandidates, discoverFwa, mergeCandidates, type GalleryRow } from "../src/award-discovery.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "design-library");
const argv = process.argv.slice(2);
const sinceIndex = argv.indexOf("--since");
const since = sinceIndex === -1 ? "2022-01-01" : (argv[sinceIndex + 1] ?? "2022-01-01");

const clock = {
  now: () => Date.now(),
  wait: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

async function main(): Promise<void> {
  const gallery = JSON.parse(readFileSync(path.resolve(here, "..", "galleries", "curated.json"), "utf8")) as GalleryRow[];
  const curated = curatedCandidates(gallery);
  const fwa = await discoverFwa({ fetchImpl: globalThis.fetch, clock, log: (line) => console.log(line) }, since);
  const candidates = mergeCandidates(fwa.candidates, curated);
  const out = {
    generated: new Date().toISOString(),
    since,
    sources: {
      fwa: { candidates: fwa.candidates.length, pages: fwa.pages, note: fwa.note, listing: "https://thefwa.com/awards" },
      curatedGallery: { candidates: curated.length, note: "Awwwards and GSAP showcase rows a person verified in galleries/curated.json" },
      awwwards: { candidates: 0, note: "Not crawled: 239b refuses crawling Awwwards and its terms forbid reuse; only curated-gallery rows." },
      webby: { candidates: 0, note: "Not read: winners pages load from /api/, which robots.txt disallows." },
      cssda: { candidates: 0, note: "Not read: robots.txt is behind a bot challenge; not bypassed." },
      godly: { candidates: 0, note: "godly.website now redirects to recent.design, a general design feed, not a site award gallery." },
    },
    candidates,
  };
  writeFileSync(path.join(root, "award-candidates.json"), `${JSON.stringify(out, null, 2)}\n`, "utf8");
  console.log(`award candidates: ${candidates.length} (fwa ${fwa.candidates.length}, curated ${curated.length})`);
}

void main();
