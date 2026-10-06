---
id: "029"
kind: build
phase: dont-panic
slice: Vogon Neighbors
title: "Ship a curated gallery pack and a polite refresh hook"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["026"]
files: ["packages/knowledge/galleries/curated.json", "packages/crawler/src/galleries.ts", "packages/crawler/test/galleries.test.ts", "NOTICE"]
requirements: ["HH-CRAWL-03"]
review_checkpoint_embedded: false
---

# 029. Ship a curated gallery pack and a polite refresh hook

## RULES

You are Grok 4.7 in Grok Build, building The Hitchhiker's Guide to Web Design. This prompt builds the Guide app itself, not a client's website.

- TypeScript strict. No `any` unless a line in this prompt names the exception and the reason.
- Tests ship with the behavior. Run the verification commands before you finish.
- No secrets in source, fixtures, logs, or commits. Keys come from the environment or the OS keychain.
- MIT-compatible dependencies only. Before adding a package, check the registry: exact name, license field, repository URL, and that the repo is the project you meant. Record the result in NOTICE. GPL and AGPL are out. Apache-2.0, BSD, ISC, MIT, Unlicense, Zlib, and MPL-2.0 (file-level, noted in NOTICE) are allowed. Font files may be SIL OFL-1.1. Media assets (models, HDRIs, textures, images) may be CC0 or CC-BY-4.0 with a CREDITS.json entry.
- Do not bundle `@theatre/studio` (AGPL-3.0). Theatre runtime means `@theatre/core` only, pinned, never `@latest`.
- Motion toolkit (D-001): GSAP is the base engine (ScrollTrigger, SplitText, and the other free plugins), and Three.js, raw WebGL/GLSL (OGL or WebGL2), Motion, anime.js, Theatre.js core, Lenis, CSS scroll-driven animations, and vanilla JS all ship. The picker chooses per effect. No replacement or fallback paths.
- One job. Do not implement the next prompt.
- The app UI obeys the anti-slop rulebook: no purple-to-blue gradients, no magnetic buttons, no default Tailwind indigo look, no lorem, no banned words in user-facing copy, no exclamation marks. App screens use the Guide design system in packages/app/src/design/ (tokens, type, motion, components). Never ship an unstyled or default-looking screen. The app must look agency-grade with Don't Panic energy.
- Windows, macOS, and Linux. Use `node:path` and `node:os`. No hardcoded POSIX paths. No required `pdftotext`, Homebrew, or apt.
- If a doc in the repo disagrees with this prompt, stop and write the conflict in the summary. Do not invent an API.
- Authority: context/matt-answers.md (Matt's 40 answers) and DECISIONS.md override everything, including this prompt and CONTEXT-PACKAGE.v2.md. CONTEXT-PACKAGE.md (v1) holds full detail where v2 says "as in v1". If this prompt contradicts Matt, follow Matt and record the conflict.
- Commit when the checks pass. Do not push. Do not create a GitHub repo. Do not deploy.

## Goal

Ship an offline shortlist the Suggest path can offer. Optional refresh is a function that returns `unavailable` unless a caller passes a fetcher, and it caches to disk with a 7-day max age. Do not assume a Godly API. Do not present Site of the Day as Site of the Year.

## Why this prompt exists

Taste suggestions need real sites. Live scraping as the default will break, violate a terms page we have not fully re-read, and go stale in a test suite.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/RESEARCH-ADDENDUM.md gallery section (SOTY 2025, CoMinVi, no Godly API)
- hh-build-plan/CONTEXT-PACKAGE.v2.md section 21 item on gallery crawling
- context/research/03-awwwards-anatomy.md
- context/research/05-inspiration-galleries.md
- CONTEXT-PACKAGE.md (v1) section 8.3 DP-5.2 (source pages incl. aura.build)

## Files to create or change

- packages/knowledge/galleries/curated.json
- packages/crawler/src/galleries.ts
- packages/crawler/test/galleries.test.ts
- NOTICE

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

curated.json is an array of 60 to 120 objects: name, url, source (`awwwards` or `godly` or `aura` or `other`), industry (restaurant-hotel, real-estate, e-commerce, portfolio, agency, saas, health, fashion, food-drink, nonprofit, events, personal, other), style_world (editorial, 3d-world, scroll-film, brutalist, minimal-luxury, playful), motion_level (1–10 estimate), year or date, award (the words `SOTY 2025` only for Lando Norris, `SOTD` for CoMinVi with date 2026-09-30, and a handful of evergreen craft examples you mark `editorial` rather than inventing awards). Include Lando Norris / OFF+BRAND as SOTY 2025 and CoMinVi by Holographik as SOTD 2026-09-30, because the addendum records those. Other rows must set award to `none` unless you are looking at a source in the repo. Do not invent a SOTY 2026 winner. suggestReferences({ industry, styleWorld, exclude, limit }) returns up to 4 entries: 2 Godly and 2 Awwwards for that industry or style world when they exist, never repeating an excluded url, so a gallery walk can keep going until the user has 10 likes. Entries come only from research/03 and research/05 and the addendum gallery section, and from aura.build, Godly, and Awwwards pages listed there. Every entry has a one-line "look at…" note about the thinking, not the look. It does not claim they are fresh today. refreshGalleries({ fetchImpl, cachePath, now }) if fetchImpl is omitted returns `{ status: 'skipped', reason: 'no fetcher' }`. If provided, it may fetch only URLs listed in an allow array that this prompt sets empty by default. An empty allow list returns skipped `allow list empty`. That is the point. A test proves the default path makes zero fetches.

## Interfaces and data shapes

```ts
export interface GalleryEntry {
  industry: string;
  styleWorld: "editorial" | "3d-world" | "scroll-film" | "brutalist" | "minimal-luxury" | "playful";
  motionLevel: number;
  name: string;
  url: string;
  source: "awwwards" | "godly" | "other";
  award: string;
  noted: string;
}

export function loadCurated(file: string): GalleryEntry[];
export function suggestReferences(entries: GalleryEntry[], q: { industry?: string; styleWorld?: string; exclude?: string[]; limit: number }): GalleryEntry[];
export function refreshGalleries(opts: { fetchImpl?: typeof fetch; allow: string[] }): Promise<{ status: "skipped" | "ok"; reason?: string }>;
```

## Steps

1. Write curated.json with Lando Norris and CoMinVi using the facts in the context. Add up to ten more rows with award `none` and source `other` only if you can cite a URL already in context/sources or the addendum. If you cannot, ship the two verified rows plus a comment in the test that the pack is intentionally short. An honest short pack beats invented awards.

2. The loader rejects an award of `SOTY 2026`. The test includes a temp file that should throw.

3. suggestReferences returns at most `limit` and never mutates the array.

4. refreshGalleries with no fetchImpl does not throw and returns skipped. With a fetchImpl and allow [], it does not call fetch. Pass a fetch that throws if called.

5. Cache format, when allow is non-empty, writes `{ fetchedAt, entries }` and refuses to use a cache older than 7 days. Unit-test the age helper with an injected now. You may leave the network branch unimplemented beyond the skip if allow is empty. If you implement the fetch branch, only GET the allow-listed URL and timeout at 10 seconds.

6. NOTICE says gallery names are facts about public awards, not a copy of gallery copy, and the pack is offline.

7. No playwright import in galleries.ts.

8. Export the functions from the crawler index.

9. Do not add a scheduler or a background crawl.

## Edge cases

- limit 0 returns an empty array.
- Duplicate urls in the json throw at load.
- A SOTD row must not use the award string SOTY.

## Acceptance criteria

- [ ] SOTY 2026 is rejected by the loader.
- [ ] Default refresh performs zero fetches.
- [ ] Lando Norris is SOTY 2025 and CoMinVi is SOTD, in the pack.
- [ ] suggestReferences respects the limit.

## must_haves

truths:

- The curated pack is the default Suggest source.
- There is no assumed Godly API.
- Site of the Day is not labeled Site of the Year.

artifacts:

- packages/knowledge/galleries/curated.json
- packages/crawler/src/galleries.ts

key_links:

- suggestReferences reads GalleryEntry objects from the curated file.
- refreshGalleries is unreachable from import side effects.

prohibitions:

- Do not invent a SOTY 2026 winner.
- Do not crawl Godly or Awwwards by default.
- Do not copy long case-study text into the json.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/crawler test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/029.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(knowledge): add the offline gallery shortlist
```

