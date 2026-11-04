---
id: 245v
title: Signature Moment Engine - after the brand idea locks, invent and lock 1-2 signature moments into DESIGN.md as an immutable contract built from a matching recipe; gate checks presence and that nothing competes
kind: build
effort: xhigh
model: grok-4.7-build-fast
depends_on: 245u
---

# 245v - Signature Moment Engine: 1-2 locked signature moments per site, an immutable DESIGN.md contract, and a gate

## Context

245a added `## Brand idea` and the DESIGN.md lock (`.hitchhiker/design-lock.json`); 245b writes VISUAL-CONSTITUTION.md from the locked DESIGN.md; 245u added the recipe library and `signatureRecipeCandidates(world, appetite)`. A site still has no single idea that it is remembered for. The difference between "nice GSAP site" and "this site has an idea" is one or two signature moments, invented once and protected.

Confirm by reading the code; if the real code differs from this description, adapt and say so in the commit body. Prefer wiring existing code over new code.

## Deliverables

1. `inventSignatureMoments(projectDir)` in `packages/engine/src/spec/` (beside the design-stage code): runs once the Brand idea and picked direction exist and before the style-guide lock. One Grok Build CLI call (the desk's existing `think()` / grok-cli path; never the paid API) proposes 3 candidates from the Brand idea, the picked direction, the references (245i shots by path) and `signatureRecipeCandidates(world, appetite)`; the desk shows them and the owner picks 1 or 2 (proof run: the harness picks and logs it).
2. DESIGN.md `## Signature moments` section (add to `DESIGN_SECTION_ORDER` and `lintDesignMd`). Each moment is a contract block with: `id`, `name`, description (2-3 sentences tied to the Brand idea), `section` (which page/section hosts it), `recipe` (a 245u recipe name; must be in the style world's map, otherwise refused), technical approach (recipe options, assets), reduced-motion fallback (designed static or opacity-only state, described), performance budget (max JS kB for the moment, max main-thread ms per frame, LCP and CLS limits), and `echoes` (where the site may quietly echo it). The block is covered by the 245a lock hash: any later edit un-locks DESIGN.md and needs owner re-approval; generated prompts may not edit it.
3. Prompt rule `SIGNATURE_RULE` in site-rules.ts, injected into every page/section prompt by the 245k generator: "You may not invent new motion language. You may only build, support or echo the locked signature moments in DESIGN.md (ids: ...)." The hosting section's prompt gets the full contract; other prompts get the one-line ids and echoes only.
4. Gate `checkSignature(projectDir, built)` in `packages/qa/src/` run in the per-page close (245l) and the final review: (a) each locked moment is present (its `data-signature="<id>"` hook exists on the hosting section, uses the named recipe import, and runs in the browser: the CDP layer sees its trigger/progress change on scroll or interaction), (b) its reduced-motion fallback renders designed (reuse 245x `optical.reducedMotion`), (c) its budget holds, (d) nothing competes: no other section uses a hero-scale recipe from the same family (pinned/camera/frame-sequence/horizontal) or a second full-viewport motion, unless listed in `echoes`. Failures name the competing file and line.
5. VISUAL-CONSTITUTION.md (245b) shows the moments at the top; the desk's style-guide page lists them.

## Tests

Add `packages/engine/test/desk-run11-245v.test.ts` and `packages/qa/test/245v-signature-gate.test.ts`, failing first, then green, with short timeouts and no network, browser downloads or real grok calls (use fakes or cassettes):
- with a fake grok, invention yields 3 candidates and refuses a recipe outside the style world's map;
- DESIGN.md lint fails a moment missing a fallback or budget; editing the block after lock un-locks DESIGN.md;
- every generated page prompt contains the SIGNATURE_RULE; only the hosting prompt carries the full contract;
- gate: missing `data-signature` hook fails; a second pinned hero-scale timeline in another section fails as competing; a listed echo passes; a fallback left hidden fails;
- all earlier 244 and 245 tests pass unchanged.

## Verification Gates

Run from the repository root (the driver's gate script runs these as TC / LINT / TEST1 / CLI / ORCH / ENGINE):
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm --filter hitchhikers-guide test`
- `pnpm --filter @hitchhiker/orchestrator test`
- `pnpm --filter @hitchhiker/engine test`
- `pnpm --filter @hitchhiker/qa test`
If a fixture trips a check, fix the fixture, never weaken the check. Never use `--no-verify`, never run `hh brief --approve`, never push, and do not delete code that other prompts or tests use (replace and migrate callers instead).

## Commit

```
feat(engine): invent and lock 1-2 signature moments as a DESIGN.md contract, and gate presence and competition (245v)
```
