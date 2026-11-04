---
id: 245g
title: Design lab gate - a /design-lab route that renders tokens, states and every chosen variant, checked by CDP and vision before page prompts run
kind: build
effort: xhigh
model: grok-4.7-build-fast
depends_on: 245f
---

# 245g - Mandatory design-lab gate before page prompts (BUG-143)

## Context

PrimeTime fixed the look before building pages; run 11 never did. 245d-245f provide tokens, recipes, primitives, variants and the hero gate; 245c provides CDP assertions; `think()` (`packages/engine/src/ai/think.ts`, the logged-in Grok CLI) and `zaphodReview` (`packages/qa/src/zaphod-vision.ts`) give a vision check.

Confirm by reading the code; if the real code differs from this description, adapt and say so in the commit body. Prefer wiring existing code over new code.

## Deliverables

1. The scaffold adds `src/pages/design-lab.astro` (excluded from the sitemap, `noindex`, removed or blocked at deploy by the existing deploy checks): type scale specimen, colour tokens, button/input/card/link states (default, hover, focus, disabled, error), nav (desktop and open mobile menu), and each section variant chosen in variants.json rendered in isolation with placeholder slot content that is clearly marked as sample.
2. A design-lab prompt is generated first in the site queue (after setup/tokens), owning only that page and the token/theme files.
3. Its close runs `runCdpAssertions` with scope `page` on /design-lab at 375/768/1440, the 245f structure gate on each variant, and one vision review against VISUAL-CONSTITUTION.md and the renders (faults list, same format as 245l). Any blocker or fault fails it with one feedback rerun, then the queue pauses for the owner.
4. Page prompts cannot start until the design-lab prompt is done: enforce through `depends_on` in the generated queue and a guard in `continueSiteBuild` that names the reason.

## Tests

Add `packages/engine/test/desk-run11-245g.test.ts` (and package-local tests where the code lives), failing first, then green, with short timeouts and no network, browser downloads or real grok calls (use fakes or cassettes):
- the scaffold writes design-lab.astro with every listed block and it is excluded from the sitemap and deploy;
- the generated queue puts the design-lab prompt before every page prompt, and `continueSiteBuild` refuses a page prompt while it is not done;
- a CDP blocker on the lab (wrong body font) fails its close with the blocker in the reason;
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
feat(engine): a design-lab page must pass CDP, structure and vision checks before page prompts run (245g)
```
