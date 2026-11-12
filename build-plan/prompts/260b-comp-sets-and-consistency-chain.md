---
id: 260b
title: Comp sets - desktop, long and mobile Imagine comps with candidates, approvals and a consistency chain
kind: build
effort: xhigh
model: grok-4.7
depends_on: 260a
---

# 260b - Comp sets - desktop, long and mobile Imagine comps with candidates, approvals and a consistency chain

Read `build-plan/IMAGINE-FIRST-SPEC.md` first. It is the contract for this chain and lists the verified xAI endpoints. Confirm every claim about existing code by reading it; if the code differs from this prompt, adapt, prefer wiring existing code over new code, and say so in the commit body.

## Goal
Replace the single 16:9 page render with a comp set per primary page: desktop fold (16:9), desktop long (1:2, optional by config) and mobile fold (9:19.5), K candidates each (default 3, config `design.comps.candidates`, 1 to 4), stored and approved as in the spec's data model, with the consistency chain.

## Must haves
1. New module `packages/engine/src/spec/comps.ts` (exported through the engine index) that owns `.hitchhiker/comps.json`: `draftComps(projectDir, deps)`, `listComps`, `approveComp(projectDir, route, view, candidateFile)`, `requestCompChange(projectDir, route, view, text)`, `compsWaiting(projectDir)`, `isCompApproved`, `syncCompApprovals` (sha256 like 245i; a changed or missing file drops the approval).
2. Approving copies the picked candidate to the fixed path (`reference/renders/<slug>.png`, `.mobile.png`, `.long.png`) and records `from`. The 245i `renders.json` approval stays in sync for the desktop view: `approveRender`/`isRenderApproved`/`pagesWaitingForRender` keep their signatures and meaning, and an existing `renders.json` approval is migrated as the desktop approval. `site-build.ts` now waits for desktop AND mobile approvals for every primary page (long only when enabled); the error message names page and view in plain words.
3. Comp prompt builder extends `buildRenderPrompt`: same DESIGN.md facts plus the view ("desktop browser first screen 1440 wide", "full scrolling desktop page", "phone first screen 390 wide"), section order from the sitemap, the explicit rule "No readable text. Use neutral bars where headings and copy will sit; real text is added in code.", and the owner's change notes. Saved next to each candidate as `.prompt.txt`.
4. Consistency chain exactly as the spec: references are owner photos first, then `reference/refs`, then approved home desktop comp as reference 1 once it exists, plus the page's approved desktop comp for its mobile/long views; capped at 5; sent through the provider's `editImage` when available (260a), otherwise text-only with a note in `reference/comps/README.md`.
5. Drafting is still triggered by `onDesignLocked` / the render runner, never blocks the desk event loop, never runs twice at once (reuse the inflight/again pattern), writes each file before the next request, and records provider failures as plain notes. Logo files are never used as photo references.
6. Model: `design.comps.model` (default the current `RENDER_MODEL`, allowed ids only).

## Files
`packages/engine/src/spec/comps.ts`, `page-renders.ts`, `design-stages.ts` (only if needed), `guide/site-build.ts`, `config.ts` (+ schema/defaults), `index.ts`; tests `packages/engine/test/comps-260b.test.ts`.

## Non-goals
No desk UI (260d), no motion (260c), no compare (260f).

## Tests (failing first)
- three views x 3 candidates are drafted through a fake provider with the right aspects and prompts; the prompt says no readable text and lists sections in order;
- after the home desktop approval, the next request's references start with that comp; mobile includes its desktop comp; never more than 5; logo excluded;
- approve copies to the fixed path, writes sha256; editing the file drops the approval;
- a legacy `renders.json` approval counts as the desktop approval and `pagesWaitingForRender` still works;
- site prompt generation refuses while a mobile comp is unapproved and names the page and view;
- a change request stores the words and the next draft for that view includes them;
- `design.comps.long: false` skips the long view everywhere.

## Verification

Run from the repository root with `HH_CASSETTE=replay`:
- `pnpm typecheck`
- `pnpm lint`
- the tests of every package you touched (engine, assets), for example `pnpm --filter @hitchhiker/engine test`
If a fixture trips a check, fix the fixture, never weaken the check. No network, no paid API call, no real Grok call, no browser download in tests (Playwright Chromium is already in `~/.cache/ms-playwright`; e2e only where stated). Never `--no-verify`, never push, never merge, never deploy, never `hh brief --approve`, never kill a process you did not start. Commit your work with the message below when the checks pass.

## Commit

```
feat: comp sets (260b)
```
