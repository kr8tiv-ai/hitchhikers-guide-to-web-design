---
id: 245p
title: Section rhythm and uniqueness detector, plus empty-space and asymmetry checks
kind: build
effort: xhigh
model: grok-4.7-build-fast
depends_on: 245o
---

# 245p - Section rhythm, uniqueness and breathing room (BUG-152)

## Context

Run 11 pages repeated one card-grid shape section after section. `isTemplateClone` and `deskPagesDiffer` in `packages/qa/src/visual-bench.ts` and `pattern-score.ts` already compare structure; the 245c CDP layer can collect DOM and boxes.

Confirm by reading the code; if the real code differs from this description, adapt and say so in the commit body. Prefer wiring existing code over new code.

## Deliverables

1. `sectionRhythm(facts)` in packages/qa: per page, a structure hash per section (tag/role tree to depth 3, normalised, plus layout class: grid columns, media side, alignment) and, where shots exist, a downscaled screenshot similarity. Two adjacent sections with the same hash or similarity > 0.9 fail; more than 40% of sections on a page sharing one hash fails. Reuse `isTemplateClone` / `pattern-score.ts` code where it fits.
2. Breathing room: each page needs at least one section with large empty space (content box covering < 55% of the section at 1440) or an asymmetric layout (main column offset or unequal columns). Report as a fix, a blocker when no section qualifies.
3. Run in the 245l loop and the reviewers, as faults with the section ids.

## Tests

Add `packages/engine/test/desk-run11-245p.test.ts` (and package-local tests where the code lives), failing first, then green, with short timeouts and no network, browser downloads or real grok calls (use fakes or cassettes):
- three adjacent identical card grids fail with their ids; alternating layouts pass;
- a page with no empty-space or asymmetric section is a blocker; one qualifying section clears it;
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
feat(qa): detect repeated section structure and missing breathing room (245p)
```
