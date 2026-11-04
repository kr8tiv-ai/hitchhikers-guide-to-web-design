---
id: 245x
title: Optical and micro-detail checks on the CDP layer - optical centring, baseline rhythm, display tracking, asymmetric breathing room, designed hover/focus, designed reduced-motion
kind: build
effort: xhigh
model: grok-4.7-build-fast
depends_on: 245c
---

# 245x - Optical and micro-detail checks: the details designers notice, as CDP findings with precise fix instructions for Elevate

## Context

245c added `runCdpAssertions` and `CdpAssertionReport` (`packages/qa/src/cdp-assertions.ts`, `cdp-runner.ts`) for token fidelity, boxes, interactions and axe. They catch broken pages, not undesigned ones. This prompt adds the micro-detail layer on the same Playwright + CDP surface. Run order: this runs after 245c and before 245d so the design-system primitives (245d/245e) and the design lab (245g) are built against these checks.

Confirm by reading the code; if the real code differs from this description, adapt and say so in the commit body. Prefer wiring existing code over new code.

## Deliverables

1. `packages/qa/src/optical-checks.ts`: pure evaluators over collected facts, each returning `Finding`s (245c shape, new kinds prefixed `optical.`) with selector, actual, expected and a one-line fix instruction:
   - `optical.centring`: for centred display headlines (text-align center or a centred box), compare the box centre with the ink centre (measured from a canvas render of the text or `Range.getBoundingClientRect` per glyph run; trailing punctuation, quotes and leading caps with large side-bearings shift the ink). Flag mathematical centring when the ink offset is above 1.5% of the line width, with the suggested nudge in px (or `text-indent` / hanging punctuation).
   - `optical.baseline`: body text line boxes in a section must step on a consistent baseline (line-height multiple of the DESIGN.md baseline unit, default 4px; tolerance 1px). Sections DESIGN.md marks `breaks-grid` are skipped.
   - `optical.tracking`: display text (computed font-size >= 40px at 1440) with `letter-spacing: normal` is a fix ("set tracking from the type scale, e.g. -0.02em"); all-caps small text with `normal` tracking likewise (expected positive tracking).
   - `optical.symmetry`: a section whose content container is centred with equal left/right margins, centred text and no offset element at 1440 is flagged as "purely centred, no asymmetric breathing room" unless DESIGN.md marks the section `centred: intentional`. More than two consecutive such sections is a blocker.
   - `optical.states`: every visible `a`, `button`, `[role=button]`, input: hover and `:focus-visible` (forced through CDP `CSS.forcePseudoState`) must change at least one designed property beyond the UA default (outline-only browser default focus ring = fix; no change on hover = fix; missing visible focus = blocker).
   - `optical.reducedMotion`: emulate `prefers-reduced-motion: reduce` (`Emulation.setEmulatedMedia`), then for each element that animates in normal mode, the reduced state must be fully visible (opacity 1, not off-canvas), keep its layout, and differ from a blank/unstyled state (a reduced fallback that just deletes the element or leaves it at opacity 0 is a blocker).
2. Extend `runCdpAssertions` with `checks: ["base", "optical"]` (default both for `scope: "hero"` and `"page"`), merging findings into the same report. `summaryForModel` gets an `OPTICAL` block after FIXES, each line an exact instruction ("h1.hero__title is mathematically centred; ink sits 9px left of centre because of the opening quote; shift with text-indent: -0.12em or hanging-punctuation: first").
3. Elevate and the screenshot loop consume these: export `opticalFixInstructions(report)` so 245l and 245r can put them into fix turns unchanged.
4. Config `design.optical` in `.hitchhiker/config.json` (through the existing loader): `{ enabled: true, baselineUnit: 4, centringTolerance: 0.015 }`.

## Tests

Add `packages/qa/test/245x-optical-checks.test.ts`, failing first, then green, with short timeouts and no network, browser downloads or real grok calls (use fakes or cassettes):
- a headline with a leading quote flagged for optical centring with a nudge; a balanced headline passes;
- body lines off the 4px baseline flagged; a `breaks-grid` section skipped;
- 64px display text at default tracking is a fix; -0.02em passes;
- three consecutive purely centred sections is a blocker; an offset media column passes; `centred: intentional` passes;
- a button with only the UA focus ring is a fix; a link with no visible focus is a blocker; designed hover passes;
- reduced-motion: an element left at opacity 0 is a blocker; a static designed fallback passes;
- the summary lists OPTICAL lines after FIXES and stays under the 245c cap;
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
feat(qa): optical and micro-detail CDP checks with exact fix instructions for elevate and the screenshot loop (245x)
```
