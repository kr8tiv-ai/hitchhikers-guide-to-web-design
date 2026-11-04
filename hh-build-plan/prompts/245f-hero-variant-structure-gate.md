---
id: 245f
title: Hero-variant structure gate - the built hero must match the structure of its declared variant
kind: build
effort: xhigh
model: grok-4.7-build-fast
depends_on: 245e
---

# 245f - Hero-variant structure gate (BUG-142)

## Context

245e gives every hero variant a `structure` export and records the chosen variant in `.hitchhiker/design/variants.json`; components carry `data-section` / `data-variant`. The CDP layer (245c) can read the DOM at set widths.

Confirm by reading the code; if the real code differs from this description, adapt and say so in the commit body. Prefer wiring existing code over new code.

## Deliverables

1. `checkVariantStructure(report facts, structure)` in `packages/qa/src/` (or the design-system package) and a CDP probe that, at 375 and 1440, finds the hero (`[data-section=hero]`), reads its `data-variant`, and checks it equals variants.json and satisfies the structure (slots present, order, layout facts).
2. Add it to the per-prompt close checks for the prompt that owns the home page hero, failing with one feedback rerun (244k mechanism) and a reason naming the broken fact; extend to other sections that declare a structure.
3. A hero with no `data-variant` fails, unless DESIGN.md names a signature structure for the hero (then the gate checks that DESIGN.md's described structure facts instead, if given, and logs that it ran in signature mode).

## Tests

Add `packages/engine/test/desk-run11-245f.test.ts` (and package-local tests where the code lives), failing first, then green, with short timeouts and no network, browser downloads or real grok calls (use fakes or cassettes):
- a cinematic hero whose media covers 60% at 1440 fails with the fact named; a correct one passes;
- a declared `split-editorial` hero built with equal columns fails;
- a hero whose data-variant differs from variants.json fails;
- signature mode is used only when DESIGN.md names one;
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
feat(qa): the built hero must match the structure of its declared variant (245f)
```
