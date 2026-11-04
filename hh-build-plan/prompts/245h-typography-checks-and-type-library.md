---
id: 245h
title: Typography checks - pairing score with an overused-font ban, computed fonts match tokens, scale contrast, clamp, font loading, and a much larger TYPE_PAIRINGS
kind: build
effort: xhigh
model: grok-4.7-build-fast
depends_on: 245g
---

# 245h - Deterministic typography checks and a larger type library (BUG-144)

## Context

`TYPE_PAIRINGS` (`packages/engine/src/brand/tokens.ts`) is built from `TYPE_LIBRARY` in `type-library.ts` (112 lines, plus `DO_NOT_SHIP` trial faces). Run 11 drifted to Syne/Spline Sans because no pick existed (fixed in 245a). Nothing scores a pairing or checks font loading. `prebuild-checks.ts` has `aiLookCheck` and `fontsFromGuide`.

Confirm by reading the code; if the real code differs from this description, adapt and say so in the commit body. Prefer wiring existing code over new code.

## Deliverables

1. Expand `TYPE_LIBRARY` to at least 40 open-licence pairings (Google Fonts / Fontshare / OFL with licence noted), each tagged with classification (serif, sans grotesque, humanist, geometric, slab, mono, display), style worlds it suits, and weights available.
2. `scorePairing(display, body, world, ownerChoice?)` 0-10: rewards classification contrast and x-height/weight compatibility, penalises same classification, and applies an overused ban list (Inter, Poppins, Montserrat, Roboto, Open Sans, Lato, Raleway, Nunito, Space Grotesk and similar) unless the owner explicitly named the family in the interview. A pick below 6 is a prebuild fail with the reason.
3. Prebuild/close checks (deterministic, CDP-backed where the page is needed, via 245c computed styles): computed font-family on h1-h3 and body equals the token pair; display-to-body size ratio >= 2.5 at 1440 and >= 1.8 at 375, and weight contrast >= 200 or classification contrast; every type step uses clamp(); `font-display: swap` (or optional) on every @font-face; the display font is preloaded; self-hosted fonts are subset (woff2 and a unicode-range, or a size cap per file).
4. Wire the checks into `runPrebuildChecks` (pairing) and the per-prompt close (page facts), failing with one feedback rerun.

## Tests

Add `packages/engine/test/desk-run11-245h.test.ts` (and package-local tests where the code lives), failing first, then green, with short timeouts and no network, browser downloads or real grok calls (use fakes or cassettes):
- TYPE_LIBRARY has at least 40 tagged entries and `TYPE_PAIRINGS` still derives from it;
- Inter + Inter scores below 6 and fails prebuild; Inter is allowed when the interview named it; a serif display with a grotesque body scores higher than two geometric sans;
- facts with a 1.5x display ratio, a missing clamp(), a missing font-display, a missing preload and an unsubset 400 KB font each fail with a named reason;
- all earlier 244 and 245 tests pass unchanged.

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
feat(engine): score font pairings with an overused-font ban, check computed fonts, scale contrast and font loading, and grow the type library (245h)
```
