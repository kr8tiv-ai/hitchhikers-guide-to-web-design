---
id: 260c
title: Motion references - optional Imagine clips from approved comps for motion-led sections
kind: build
effort: xhigh
model: grok-4.7
depends_on: 260b
---

# 260c - Motion references - optional Imagine clips from approved comps for motion-led sections

Read `build-plan/IMAGINE-FIRST-SPEC.md` first. It is the contract for this chain and lists the verified xAI endpoints. Confirm every claim about existing code by reading it; if the code differs from this prompt, adapt, prefer wiring existing code over new code, and say so in the commit body.

## Goal
For sections DESIGN.md / MOTION.md marks as motion-led or hosting a signature moment (245v), make a short motion reference clip from the approved comp, so the build has a choreography target like the Tina clips.

## Must haves
1. `draftMotionRefs(projectDir, deps)` in the comps module: one clip per motion-led section of an approved page, via reference-to-video (`referenceImages: [approved desktop comp]`) on the API path or the grok-cli provider's video path with the reference path in its instruction. Defaults: `grok-imagine-video-1.5-lite`, 6 seconds, 480p, 16:9, `generateAudio: false`; config `design.motionRefs` `{ enabled (default true), model, seconds, resolution, max (default 3 per site) }`. Quoted through the budget on the API path.
2. The video prompt describes camera/scroll choreography only (direction, pin, parallax, reveal order, easing feel), says no readable text, and is saved as `.prompt.txt`.
3. Section crops: for each sitemap section of an approved desktop long comp, record an approximate vertical band in comps.json (`crop` file written by slicing the long comp evenly by section count with Playwright/Chromium canvas or plain PNG handling already available, no new native dependency). If unsure, keep the band list and mark it approximate.
4. Clips and crops are optional: their absence never blocks the build; failures are notes. Approval of a clip is a separate `approveMotionRef` (sha256) and only approved clips are passed to the build.

## Files
comps module, config, tests `packages/engine/test/motion-refs-260c.test.ts` (and assets tests if the provider changes).

## Tests (failing first)
- only motion-led sections get clips, capped at `max`;
- the request carries the approved comp as the reference, audio off, allowed model, correct duration/resolution;
- disabled config drafts nothing; a provider failure writes a note and nothing blocks;
- unapproved clips are not returned by the build-facing accessor.

## Verification

Run from the repository root with `HH_CASSETTE=replay`:
- `pnpm typecheck`
- `pnpm lint`
- the tests of every package you touched (engine, assets), for example `pnpm --filter @hitchhiker/engine test`
If a fixture trips a check, fix the fixture, never weaken the check. No network, no paid API call, no real Grok call, no browser download in tests (Playwright Chromium is already in `~/.cache/ms-playwright`; e2e only where stated). Never `--no-verify`, never push, never merge, never deploy, never `hh brief --approve`, never kill a process you did not start. Commit your work with the message below when the checks pass.

## Commit

```
feat: motion references (260c)
```
