---
id: 245a
title: Design gate - no approval without a picked direction, a reference folder and a locked DESIGN.md, and a drift check on fonts and tokens
kind: build
effort: xhigh
model: grok-4.7-build-fast
depends_on: 245i
---

# 245a - Design gate: no approval without a picked direction, a reference folder and a locked DESIGN.md; fonts and tokens cannot drift (BUG-137)

## Context

Desk run 11 (project Run Eleven C "Paradise Found", folder C:\Users\lucid\Desktop\desk-e2e-run11\site-c), on main c9225b7c (244k). The finished site looked poor. The diagnosis found the design was never actually chosen:

- `.hitchhiker/design-stages.json` records sitemap, wireframe, styleGuide, direction and prebuild all "Approved.", but `.hitchhiker/directions.json` has `pickedId: null` (three directions dealt, none picked).
- `.hitchhiker/brand/BRAND.md` says "Picked families: General Sans." while `DESIGN.md` and `.hitchhiker/design/tokens.json` use Syne / Spline Sans.
- The project has no `reference/` folder at all.

What the code does today (read it and confirm):
1. `advanceDesignStages` in `packages/engine/src/spec/design-stages.ts` only checks `directionPicked()` at the moment the direction approval is recorded. `designReadyForBuild` checks that `state.direction` is a string; it never re-reads `pickedId`. Any later path that re-saves the deal (`saveDirectionDeal` in `packages/engine/src/brand/directions.ts`, called from `writeBrandKit` in `packages/engine/src/brand/kit-from-interview.ts`, `presentDesignStage` in `packages/app/src/server/design-stage-desk.ts`, and `passStages` in `packages/orchestrator/src/golden-path.ts`) can leave an approved direction stage with no pick.
2. `fontsFor` in design-stages.ts returns null when `pickedId` is null, so `writeDesignMd` (`packages/engine/src/spec/design-outputs.ts`) falls back to default families. That is where Syne / Spline Sans came from. `writeDesignExports` (`packages/engine/src/spec/design-export.ts`) then writes `tokens.json` from that DESIGN.md, so tokens follow DESIGN.md but DESIGN.md does not follow the brand.
3. `runPrebuildChecks` (`packages/engine/src/spec/prebuild-checks.ts`) has no reference-folder check and no font/token drift check. `lintDesignMd` (`design-md-lint.ts`, `DESIGN_SECTION_ORDER`) has no "brand idea" or "image direction" section.

Find out exactly how site-c reached "direction approved, pickedId null" (which call cleared or never set the pick) and fix that path too. Say what you found in the commit body.

## Deliverables

1. `designReadyForBuild` and the approval path in `advanceDesignStages` refuse the direction, style-guide and prebuild approvals, and refuse the build, while any of these is true. Each gives a plain owner-facing reason:
   - `directions.json` `pickedId` is null or names a direction that is not in the deal ("Pick a design direction before the build.");
   - the project `reference/` folder holds fewer than `design.minReferenceImages` images (.png/.jpg/.jpeg/.webp, recursive; default 6, read from `.hitchhiker/config.json` through the existing config loader); auto-captured references from 245i (`reference/refs/*.png`, listed in `reference/refs/README.md`) count toward the minimum exactly like owner uploads, so a project whose references were all captured automatically can pass;
   - `DESIGN.md` is missing, fails `lintDesignMd`, or is not locked.
   An approval that was recorded while a condition held is not trusted: re-check at build time, and if the pick was lost, clear the direction, styleGuide and prebuild approvals (keep sitemap and wireframe) and log one line to `.hitchhiker/decisions.jsonl`.
2. DESIGN.md is the single source of truth. Extend the generated DESIGN.md and `DESIGN_SECTION_ORDER` with two sections the interview already feeds: `## Brand idea` (one central idea or metaphor, one or two sentences, from the interview answers and the picked direction) and `## Image direction` (owner photos first, what generated stills may and may not show, crop and grade). Keep the existing sections (one font pair under Typography, colour tokens, spacing scale, `## Motion principles`, one entry under `## Signature techniques`). Lint fails when Brand idea or Image direction is empty, when Typography names more than one display and one body family, or when Signature techniques lists more than one signature effect.
3. Lock: when the owner approves the style guide on the desk, write `.hitchhiker/design-lock.json` with the sha256 of DESIGN.md, the picked direction id and an ISO time. "Locked" means the file exists and the hash matches. Any later DESIGN.md write (for example `onDirectionPicked` rewriting the guide) removes the lock and the styleGuide approval so the owner re-approves. Only an owner approval through the desk route or `approveDesignStage` writes the lock; no engine path writes it on its own.
4. Fonts come from the pick: when a direction is picked, DESIGN.md typography uses the picked pair (`fontsFor`), and BRAND.md "Picked families" is written from the same pair (`syncResolvedFamilies`). No default family may be written while a pick exists.
5. Tokens are generated from DESIGN.md only (`writeDesignExports`). Add a prebuild check `design-drift` (status fail) that compares the font families and colour hex values in DESIGN.md with `.hitchhiker/design/tokens.json`, `src/styles` theme CSS written by `DESIGN_THEME_CSS`, and BRAND.md picked families, and names each mismatch (file, token, expected, found). Run the same check in the per-prompt close checks (`surfaceCloseReason` in `packages/engine/src/guide/site-build.ts`) so a site prompt that edits tokens away from DESIGN.md fails close with one feedback rerun (reuse the 244k mechanism).
6. Generic: no site-c names. Do not edit site-c or any generated site. Desk UI changes are limited to showing the new reasons where the existing stage panel already shows reasons (`renderDesignStagePanel`).

## Tests

Add `packages/engine/test/desk-run11-245a.test.ts` (failing first, then green; short vitest timeouts):
- direction approval with `pickedId: null` is not recorded, and `designReadyForBuild` returns ok false with the pick reason;
- a project whose design-stages.json says everything is approved but whose directions.json has `pickedId: null` (the site-c shape) is not ready, and the direction/styleGuide/prebuild approvals are cleared while sitemap/wireframe stay;
- five images in `reference/` fail, six pass; the config value overrides the default; six auto-captured `reference/refs/*.png` shots (245i) pass with no owner uploads;
- missing DESIGN.md, DESIGN.md without Brand idea, and an edited DESIGN.md whose hash no longer matches the lock each block the build;
- with a picked direction "General Sans / X", DESIGN.md, tokens.json and BRAND.md all name the pair; changing tokens.json to Syne makes `design-drift` fail and name the file and the token;
- `writeDesignMd` never writes a default family when a pick exists;
- all earlier 244 and 245 tests pass unchanged.
Update any existing fixture that relied on approving without a pick by giving it a pick and references, never by loosening the gate. Note each updated fixture in the commit body.

## Verification Gates

Run from the repository root (the driver's gate script runs these as TC / LINT / TEST1 / CLI / ORCH / ENGINE):
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm --filter hitchhikers-guide test`
- `pnpm --filter @hitchhiker/orchestrator test`
- `pnpm --filter @hitchhiker/engine test`
If a fixture trips a check, fix the fixture, never weaken the check. Never use `--no-verify`, never run `hh brief --approve`, never push, and do not delete code that other prompts or tests use (replace and migrate callers instead).

## Commit

```
fix(engine): design stages cannot approve without a picked direction, references and a locked DESIGN.md, and font/token drift fails (245a)
```
