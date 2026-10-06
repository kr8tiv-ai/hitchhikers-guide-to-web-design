---
id: "053"
kind: build
phase: babel-fish
slice: Magrathean Logo Works
title: "Price Imagine jobs and stop at the cap"
tier: Forty-Two
effort: high
model: grok-4.7
depends_on: ["006", "050"]
files: ["packages/assets/src/imagine.ts", "packages/assets/src/prices.ts", "packages/assets/test/imagine.test.ts", "NOTICE"]
requirements: ["HH-ASSET-01"]
review_checkpoint_embedded: false
---

# 053. Price Imagine jobs and stop at the cap

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

Estimate an Imagine job from model, resolution, and seconds, and refuse to run it when the estimate crosses the remaining dollar cap. DIY mode runs zero network calls and returns prompts only. Tests inject fetch. Prices are the 2026-09-29 card, labeled as that card, not as eternal truth.

## Why this prompt exists

A flat $0.08 per second quote underprices 1080p video by a factor of three. The client is where that mistake is made impossible.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/RESEARCH-ADDENDUM.md section 4 (Imagine prices dated 2026-09-29)
- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 8.3 module 7, 16, and 20
- DECISIONS.md does not change pricing. Do not add a GSAP note here.

## Files to create or change

- packages/assets/src/imagine.ts
- packages/assets/src/prices.ts
- packages/assets/test/imagine.test.ts
- NOTICE

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

prices.ts exports a const PRICE_CARD_DATE = `2026-09-29` and functions: stillImageUsd(`grok-imagine-image`) = 0.02. image-2.0 1k low = 0.04. image-2.0 2k medium = 0.08. quality still floor = 0.05, use that when model is `grok-imagine-image-quality` if you support it, or reject unknown models. grok-imagine-video-1.5 per second: 480p 0.08, 720p 0.14, 1080p 0.25. grok-imagine-video-1.5-lite per second: 480p 0.02, 720p 0.03, 1080p 0.14. grok-imagine-video per second: 480p 0.05, 720p 0.07. Any other model/resolution pair throws. Use the full API model ids exactly as on the price card. quote(job) returns `{ usd, lines: string[] }` and each line names model, resolution, seconds or count. estimateMustFit(quote, remainingUsd) throws CapExceeded if usd > remaining + 1e-9. runJobs(jobs, deps) in DIY mode (`deps.mode === 'diy'`) returns the prompts and usd 0 and does not call fetch. In api mode it quotes the whole batch first, then calls fetch per job only if the total fits. A failed job does not retry more than once. Never log the API key. SuperGrok is not treated as a billing source. The key is deps.apiKey.

## Interfaces and data shapes

```ts
export interface StillJob {
  kind: "still";
  model: "grok-imagine-image" | "grok-imagine-image-2.0" | "grok-imagine-image-quality";
  resolution: "1k-low" | "2k-medium" | "default";
  prompt: string;
  count: number;
}

export interface VideoJob {
  kind: "video";
  model: "grok-imagine-video-1.5" | "grok-imagine-video-1.5-lite" | "grok-imagine-video";
  resolution: "480p" | "720p" | "1080p";
  seconds: number;
  prompt: string;
}

export function quoteJob(job: StillJob | VideoJob): { usd: number; line: string };
export function assertFits(totalUsd: number, remainingUsd: number): void;
```

## Steps

1. Encode the price table exactly. A test quotes 10 seconds of video-1.5 at 1080p as 2.50. A test quotes 10 seconds at 480p as 0.80. A test quotes video-1.5-lite 10 seconds 480p as 0.20.

2. grok-imagine-video at 1080p throws (no listed price). grok-imagine-video-1.5-lite at 1080p is 0.14/s; a test quotes 10 s as 1.40.

3. A batch of 12 times 10 seconds at 1080p is $30. assertFits against remaining 15 throws. The error message contains `30` and `1080p`.

4. DIY runJobs calls a fetch that throws if invoked, and returns the prompts.

5. API run uses the injected fetch. Authorization header is Bearer. The error from a 401 does not include the key. Test by returning the key in the response body and asserting it is absent from the Error message.

6. count on a still job multiplies. 10 times grok-imagine-image is 0.20.

7. Unknown model throws before fetch.

8. NOTICE records the price card date and that estimates must be recomputed if the card changes.

9. Do not read a global price from the network.

## Edge cases

- seconds 0 throws. count 0 throws.
- remaining 0 in api mode throws before fetch.
- Prompt text is not sent to logs. The line item names model and resolution only.

## Acceptance criteria

- [ ] 1080p and 480p video prices differ and match the card.
- [ ] A $15 cap rejects 12 ten-second 1080p clips.
- [ ] DIY performs zero fetches.
- [ ] The API key does not appear in errors.

## must_haves

truths:

- Every quote names model and resolution.
- The cap is enforced before the call.
- DIY is the no-key path.

artifacts:

- packages/assets/src/prices.ts
- packages/assets/src/imagine.ts

key_links:

- quoteJob is what DP-7.1 will show. The interview does not call runJobs.

prohibitions:

- Do not hardcode $0.08 per second for every video.
- Do not assume SuperGrok pays the API bill.
- Do not call the live Imagine API in tests.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/assets test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/053.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(assets): price Imagine jobs and enforce the cap
```
