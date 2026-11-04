---
id: 245e
title: Design-system part 2 - Astro section primitives with variants and slots, six hero variants, and a style-world variant ranking
kind: build
effort: xhigh
model: grok-4.7-build-fast
depends_on: 245w
---

# 245e - packages/design-system part 2: section primitives, hero variants and variant ranking (BUG-141)

## Context

245d added token sets and motion recipes. Site prompts still have nothing to compose. Style world comes from `styleWorldFrom` (art-direction.ts); the picked direction is in `.hitchhiker/directions.json`; sections per page are in `.hitchhiker/sitemap.md`.

Confirm by reading the code; if the real code differs from this description, adapt and say so in the commit body. Prefer wiring existing code over new code.

## Deliverables

1. `components/`: Astro section primitives Hero, Feature, Gallery, Quote, CTA, Steps, Listing/Card grid, FAQ, Contact, Footer, Nav, each with 2-4 variants, named slots (eyebrow, title, body, media, actions), token-only styling (CSS custom properties from 245d) and an optional 245d recipe. Each root element carries `data-section` and `data-variant` attributes.
2. Hero variants: `cinematic` (full-viewport media), `split-editorial` (split/asymmetric), `statement` (centred statement with progressive reveal), `marquee` (horizontal/marquee), `monument` (extreme type), `object` (product/3D object, static image fallback when no WebGL is approved); `layered-depth` is optional. Each variant documents its required structure in a `structure` export (for 245f): required slots, element order, and layout facts (for example cinematic: media covers >= 90% of the viewport at 1440; split-editorial: two columns with unequal widths at >= 1024).
3. `rankVariants(world, direction, sectionKind, brief)` returns ranked variant ids with one-line reasons; the style-world step writes `.hitchhiker/design/variants.json` (`{ page, section, variant, alternatives }`) after the direction is picked, and the desk shows it beside the direction.
4. Scaffolding copies the package components into the generated site (or adds the dependency) through the existing scaffold (`packages/engine/src/spec/scaffold.ts`).

## Tests

Add `packages/engine/test/desk-run11-245e.test.ts` (and package-local tests where the code lives), failing first, then green, with short timeouts and no network, browser downloads or real grok calls (use fakes or cassettes):
- every component renders in an Astro container test (or the package's render harness) with each variant and only slot content, and contains no hard-coded colour or font;
- all six hero variants exist with a `structure` export;
- `rankVariants` puts `statement` or `split-editorial` first for an editorial world and `object` or `cinematic` first for 3d-world; variants.json is written after a pick;
- scaffold output contains the components;
- all earlier 244 and 245 tests pass unchanged.

## Verification Gates

Run from the repository root (the driver's gate script runs these as TC / LINT / TEST1 / CLI / ORCH / ENGINE):
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm --filter hitchhikers-guide test`
- `pnpm --filter @hitchhiker/orchestrator test`
- `pnpm --filter @hitchhiker/engine test`
- `pnpm --filter @hitchhiker/design-system test`
If a fixture trips a check, fix the fixture, never weaken the check. Never use `--no-verify`, never run `hh brief --approve`, never push, and do not delete code that other prompts or tests use (replace and migrate callers instead).

## Commit

```
feat(design-system): section primitives with variants and slots, six hero variants and a variant ranking (245e)
```
