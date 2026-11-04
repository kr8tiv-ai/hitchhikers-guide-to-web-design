---
id: 245i
title: References and renders - collect reference screenshots into reference/ and get one approved key-page render per main page before site prompts
kind: build
effort: xhigh
model: grok-4.7-build-fast
depends_on: 245h
---

# 245i - References and renders: screenshots for every named reference, and one approved render per main page before site prompts (BUG-145)

## Context

In desk run 11 (site-c, Paradise Found) the brief's References line was names only ("Patagonia: love. Big quiet photography and plain type. Aesop: love. Restraint ..."). Nothing was ever captured, so no prompt had a picture of the target, and there was no mock of any page. PrimeTime (C:\Users\lucid\Desktop\primetime-site, reference only, do not modify) shows the working pattern: a `reference/` folder with one approved render per section (`reference/01-what-we-raise.jpg` and so on) that every build prompt names and is compared with.

Tooling the desk already has (read it and use it; no new paid APIs):
- Page screenshots: `crawl` / `createBrowser` in `packages/crawler/src/crawl.ts` (headless Chromium, already used for studied pages) and `withChromium` / `captureDeviceShot` in `packages/qa/src/playwright-opener.ts`.
- Named references: `loadDesignReferences`, `namedReferencePages`, `customerReferencePages` in `packages/engine/src/brand/directions.ts` (StudiedPage carries a url and studied shots).
- Image generation: `resolveDeskProvider` in `packages/assets/src/section-generate.ts`. Its default order is `grok-cli` (the `grokCliProvider`, which asks the logged-in `grok` CLI to use features.image_gen, "No API key is attached"), then the opt-in browser Imagine. The `api` provider (paid xAI API) is off by default and must stay unused here.
- Section stills hook: `packages/app/src/server/section-stills-hook.ts`.

## Deliverables

1. Reference capture. A new engine step (for example `collectReferenceShots(projectDir)` in `packages/engine/src/spec/` or `packages/crawler/src/`, whichever fits the existing package boundaries) that, for every reference named in SITE-BRIEF.md References and every customer reference URL, resolves a URL (from the design library's named reference pages or a URL the owner gave; never guess a URL, never call a search API), captures the home page and up to two inner pages at 1440 wide (above the fold and full page), and writes them to `reference/refs/<slug>-<n>.png` with `reference/refs/README.md` listing source URL, capture time and what the owner said they love. A reference with no resolvable URL is listed in `reference/README.md` as "needs a URL or screenshot from the owner" and the desk asks for it (upload goes into `reference/refs/`).
2. Key-page renders. Before `prepareSiteBuild` (`packages/engine/src/guide/site-build.ts`) generates site prompts, each primary page in `.hitchhiker/sitemap.md` (group primary) needs one render or mock at `reference/renders/<route-slug>.png` (home is `home.png`). The desk produces a draft through `resolveDeskProvider` (grok-cli first; browser only if the owner turned it on; never `api`), with a prompt built from DESIGN.md (Brand idea, type pair, colour tokens, Image direction, signature effect), the sitemap sections for that page, and the reference shots as style references. It writes a text-free render (no baked-in copy). The owner may upload their own mock instead. Each render is approved on the desk individually; approvals live in `.hitchhiker/renders.json` (`{ route, file, sha256, approvedAt }`).
3. Gate. `prepareSiteBuild` refuses to generate site prompts while a primary page has no approved render, with a reason naming the pages still waiting. The 245a reference-count check counts `reference/refs` and `reference/renders` together.
4. Owner photos first. The render prompt and `reference/README.md` list the owner's uploaded photos (`ownerPictures` in section-generate.ts reads them from ASSETS.md) and tell the image step to compose with them; a render may not use the logo file as a photo.
5. Generic, no site-c names. Capture runs with timeouts and never blocks the desk event loop (spawned or awaited off the request path, like the stills hook). No network calls in tests.

## Tests

Add `packages/engine/test/desk-run11-245i.test.ts` and, if the capture lives in crawler, `packages/crawler/test/245i-reference-shots.test.ts` (failing first, then green; fake browser and fake provider; short timeouts):
- two named references with known URLs produce four files under reference/refs and a README with both URLs; a name with no URL is listed as needing the owner;
- `resolveDeskProvider` is called with the default settings and the fake `api` provider is never called even when a key is present in env;
- `prepareSiteBuild` refuses while one of three primary pages lacks an approved render, and proceeds once all three are approved;
- an uploaded owner mock counts as a render once approved; editing the file after approval (hash change) un-approves it;
- the render prompt text names DESIGN.md's type pair, two colour tokens, the Brand idea and the owner photo files, and contains no copy text;
- all earlier 244 and 245 tests pass unchanged.

## Verification Gates

Run from the repository root (the driver's gate script runs these as TC / LINT / TEST1 / CLI / ORCH / ENGINE):
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm --filter hitchhikers-guide test`
- `pnpm --filter @hitchhiker/orchestrator test`
- `pnpm --filter @hitchhiker/engine test`
- `pnpm --filter @hitchhiker/crawler test` and `pnpm --filter @hitchhiker/assets test` if you touched those packages.
If a fixture trips a check, fix the fixture, never weaken the check. Never use `--no-verify`, never run `hh brief --approve`, never push, and do not delete code that other prompts or tests use (replace and migrate callers instead).

## Commit

```
feat(engine): collect reference screenshots and require one approved render per primary page before site prompts (245i)
```
