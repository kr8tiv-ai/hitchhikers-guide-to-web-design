---
id: 245c
title: CDP assertion layer - computed-style, bounding-box, interaction and axe checks at 375/768/1440 with a CdpAssertionReport and summaryForModel
kind: build
effort: xhigh
model: grok-4.7-build-fast
depends_on: 245b
---

# 245c - CDP/Playwright assertion layer: packages/qa/src/cdp-assertions.ts and cdp-runner.ts (BUG-139)

## Context

Checks in run 11 passed on rules, not on the rendered page. The repo already has the pieces: headless Chromium through `withChromium` / `withProjectBrowser` / `captureDeviceShot` in `packages/qa/src/playwright-opener.ts`, axe through `runAxe` (`packages/qa/src/axe-run.ts`) and `evaluateA11y` (`a11y-gate.ts`), tokens from DESIGN.md through `designTokenTree` (`packages/engine/src/spec/design-md-lint.ts`) and `writeDesignExports` (`design-export.ts`), and section specs in `.hitchhiker/sitemap.md` / `wireframe.md`.

Confirm by reading the code; if the real code differs from this description, adapt and say so in the commit body. Prefer wiring existing code over new code.

## Deliverables

1. `packages/qa/src/cdp-assertions.ts`: pure functions that turn DESIGN.md tokens and a page's section specs into assertions, and evaluate collected facts into a `CdpAssertionReport { url, width, blockers: Finding[], fixes: Finding[], passed, summaryForModel }`, where `Finding { kind, selector, actual, expected, detail }`. Kinds:
   - computed style: font-family of headings/body matches the token pair, font-size of h1/h2/body within the DESIGN.md type scale (+-1px), spacing values on section padding from the spacing scale, text and background colours from the colour roles;
   - bounding boxes: horizontal overflow of the document, overlapping interactive elements (collisions), text clipped by its container (scrollWidth > clientWidth with overflow hidden), tap targets under 44x44 at 375;
   - interaction probes derived from section specs: nav toggle click opens the menu, accordion/tab click changes visibility, form fill + submit shows a state, hover on cards changes a transform/opacity, scroll reveals a section (each expects a DOM mutation or a visibility change within 1.5 s);
   - axe: structured violations (id, impact, selector) from `runAxe`; serious/critical are blockers.
2. `packages/qa/src/cdp-runner.ts`: `runCdpAssertions({ baseUrl, pages, widths = [375, 768, 1440], scope })` using the existing Playwright helpers and a CDP session (`page.context().newCDPSession(page)`) where it helps (for example `CSS.getComputedStyleForNode` or `DOM` snapshots). `scope` starts with the hero and key interactive elements (`"hero"`), and `"page"` expands to every section. Never on the desk port; timeouts on every navigation.
3. `summaryForModel`: plain text, BLOCKERS first then FIXES, one line each with selector, actual and expected ("h1.hero__title font-family: actual Syne, expected General Sans"), capped at about 2 KB with a count of omitted lines.
4. Export from `packages/qa/src/index.ts`. Consumers (loop, reviewers, elevate, design lab, K-sampling) are wired in later prompts; this prompt adds a `hh qa cdp <url>` style entry only if the CLI already has a qa command group to hang it on.

## Tests

Add `packages/engine/test/desk-run11-245c.test.ts` (and package-local tests where the code lives), failing first, then green, with short timeouts and no network, browser downloads or real grok calls (use fakes or cassettes):
- `packages/qa/test/245c-cdp-assertions.test.ts`: fixtures of collected facts produce the expected blockers for a wrong font, an off-scale h1, a 30px button at 375, document overflow, two overlapping links, a clipped heading, a nav toggle that changes nothing, and an axe critical violation; a clean fixture passes;
- `summaryForModel` lists blockers before fixes with selector/actual/expected and stays under the cap;
- the runner calls the browser layer at exactly 375, 768 and 1440 and respects `scope` (fake browser);
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
feat(qa): CDP assertion layer with computed-style, box, interaction and axe checks and a model summary (245c)
```
