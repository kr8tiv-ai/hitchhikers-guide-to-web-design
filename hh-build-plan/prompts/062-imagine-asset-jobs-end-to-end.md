---
id: "062"
kind: build
phase: babel-fish
slice: Hyperspace Bypass
title: "Imagine asset jobs end to end"
tier: Heart of Gold
effort: xhigh
model: grok-4.7
depends_on: ["053", "050", "011"]
files: ["packages/assets/src/imagine-run.ts", "packages/assets/src/imagine-http.ts", "packages/assets/src/diy-pack.ts", "packages/assets/src/diy-import.ts", "packages/assets/src/slots.ts", "packages/assets/src/keychain.ts", "packages/assets/test/imagine-run.test.ts", "packages/assets/test/diy.test.ts", "packages/assets/test/imagine-live.test.ts", "packages/cli/src/commands/assets.ts"]
requirements: ["HH-ASSET-05"]
review_checkpoint_embedded: false
---

# 062. Imagine asset jobs end to end

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

Run real Imagine image and video jobs: POST /v1/images/generations, and async /v1/videos/generations with polling, on the user's own xAI API key, under the dollar cap from 053, with a per-batch confirm and a running total. Offer a DIY pack instead (one prompt per slot with aspect, light, and the suffix "no text, no letters, no logos, no watermarks, no faces") and a drag-back import. Slot results into ASSETS.md. Propose replacements for weak images, but never real people without a yes (Q14, Q20).

## Why this prompt exists

053 priced jobs but never ran one. Users need real hero images and loops, with costs they approved before the money is spent, and a no-API path for those who prefer their own tools.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- context/sources/xai/model-capabilities_images_generation.md, model-capabilities_video_generation.md, model-capabilities_video_image-to-video.md, models_grok-imagine-image-2.0.md, models_grok-imagine-video-1.5.md (request shapes, polling, model ids)
- packages/assets/src/imagine.ts and packages/assets/src/prices.ts (053)
- packages/engine/src/brand/imagery.ts or the 050 imagery module
- context/matt-answers.md Q14, Q19, Q20
- hh-build-plan/CONTEXT-PACKAGE.v2.md section 9 and 20
- context/matt-answers.md and DECISIONS.md (authority; they override this prompt)

## Files to create or change

- packages/assets/src/imagine-run.ts
- packages/assets/src/imagine-http.ts
- packages/assets/src/diy-pack.ts
- packages/assets/src/diy-import.ts
- packages/assets/src/slots.ts
- packages/assets/src/keychain.ts
- packages/assets/test/imagine-run.test.ts
- packages/assets/test/diy.test.ts
- packages/assets/test/imagine-live.test.ts
- packages/cli/src/commands/assets.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

imagine-http.ts is a thin client with an injected fetch: base https://api.x.ai, bearer key from keychain.ts (OS keychain via keytar-like optional dependency, or XAI_API_KEY env; never from a file in the repo). generateImage({ model, prompt, aspect, n }) and startVideo({ model, prompt, image?, seconds, resolution }) then pollVideo(id) with backoff (2 s doubling to 30 s, 10-minute cap). Use the exact model ids and parameters in the xai docs; if a doc and this prompt disagree, follow the doc and record it. imagine-run.ts: planBatch(slots) quotes each job with 053's prices, refuses any batch that would pass the cap, asks confirm(batchQuote) once per batch, runs jobs sequentially, updates a running total in .hitchhiker/assets/spend.json, and writes files under .hitchhiker/assets/generated/. diy-pack.ts writes .hitchhiker/assets/diy/PROMPTS.md with one block per slot; diy-import.ts maps dropped files back to slots by name or by order. slots.ts updates ASSETS.md rows (slot, source: imagine | diy | upload, file, cost, approved). Replacement proposals come from 057's grade; a slot whose subjectIsReal is true is never auto-replaced. hh assets in the CLI runs plan, confirm, and run.

## Interfaces and data shapes

```ts
export function generateImage(req: { model: string; prompt: string; aspect: string; n: number }, deps: { fetchImpl: typeof fetch; key: string }): Promise<Array<{ url?: string; b64?: string }>>;
export function startVideo(req: { model: string; prompt: string; image?: string; seconds: number; resolution: "480p" | "720p" | "1080p" }, deps: { fetchImpl: typeof fetch; key: string }): Promise<{ id: string }>;
export function pollVideo(id: string, deps: { fetchImpl: typeof fetch; key: string; sleep: (ms: number) => Promise<void> }): Promise<{ url: string }>;
export function runBatch(slots: AssetSlot[], deps: { confirm: (q: BatchQuote) => Promise<boolean>; cap: number; spent: number; client: ImagineClient }): Promise<{ done: AssetSlot[]; spent: number }>;
export function writeDiyPack(projectDir: string, slots: AssetSlot[]): Promise<string>;
```

## Steps

1. Write keychain.ts (env first, optional OS keychain) with a test that a missing key gives a clear message.

2. Write imagine-http.ts against the doc request shapes with injected fetch tests for image, video start, and polling backoff.

3. Write runBatch with cap refusal, per-batch confirm, running total, and spend.json; test a batch that would exceed the cap is refused before any fetch.

4. Write the DIY pack writer and importer with tests.

5. Write slots.ts ASSETS.md updates and the real-person guard test.

6. Add hh assets plan|run|diy|import to the CLI.

7. Write imagine-live.test.ts, skipped unless HH_LIVE=1 and XAI_API_KEY are set, that generates one low-cost still under a $0.10 cap and asserts a file is written.

## Edge cases

- HTTP 429 or 5xx: retry twice with backoff, then stop the batch and keep completed results.
- Video polling times out: mark the slot failed with the job id so it can resume.
- The user declines the confirm: nothing is spent and ASSETS.md is unchanged.

## Acceptance criteria

- [ ] Injected-fetch tests cover image, video, polling, cap refusal, and confirm.
- [ ] DIY pack and import round-trip.
- [ ] Real people are never replaced without yes.
- [ ] The live smoke is opt-in and capped.

## must_haves

truths:

- Imagine jobs run for real, on the user's key, within an approved cap.
- A no-API DIY path exists.
- Spending is visible as a running total.

artifacts:

- packages/assets/src/imagine-http.ts
- packages/assets/src/imagine-run.ts
- packages/assets/src/diy-pack.ts

key_links:

- runBatch quotes with 053's prices.
- slots.ts writes ASSETS.md rows that 065 and the site prompts read.

prohibitions:

- Do not store the API key in the repo or logs.
- Do not spend past the cap or without a batch confirm.
- Do not replace real people without a recorded yes.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/assets test
pnpm --filter @hitchhiker/cli test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/062.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(assets): run Imagine image and video jobs under the cap, plus DIY packs
```
