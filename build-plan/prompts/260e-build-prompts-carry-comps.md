---
id: 260e
title: Build prompts carry the approved comps as visual truth
kind: build
effort: xhigh
model: grok-4.7
depends_on: 260b
---

# 260e - Build prompts carry the approved comps as visual truth

Read `build-plan/IMAGINE-FIRST-SPEC.md` first. It is the contract for this chain and lists the verified xAI endpoints. Confirm every claim about existing code by reading it; if the code differs from this prompt, adapt, prefer wiring existing code over new code, and say so in the commit body.

## Goal
Every page/section prompt the site build generates names the approved comps (desktop, phone, long band, motion clip) as the visual target, the way the Tina VISUAL-TRUTH.md did, so Grok builds to the sketch instead of inventing.

## Must haves
1. The project gets a generated `VISUAL-TRUTH.md` at the root when comps are approved: hierarchy (1. approved comps and motion clips, 2. DESIGN.md tokens/type, 3. brief copy), file paths per page and view, and the rules: words are live HTML from the brief/copy, never baked into images; a comp is never used as a page image; owner photos fill photo areas; the build must match composition, spacing, scale, palette and photo treatment.
2. The site prompt generator (`packages/engine/src/spec/site-prompts.ts` and whatever builds page prompt bodies) adds, for each prompt that owns a page or section: the comp paths for that page (desktop + phone, section band when known, approved motion clip when any), a one-line instruction to open them before coding, and a "match this" truth line that the close checks can read. Keep the existing design-context size budget (trim other context before dropping comp lines).
3. Prompts that own no page (setup, tokens, SEO, deploy) get no comp lines.
4. Regenerating prompts after a comp re-approval updates the paths and hashes.

## Files
`site-prompts.ts`, the prompt body builder, a small `visual-truth.ts` writer in engine spec, knowledge golden files only if a golden prompt snapshot must change (update the snapshot honestly), tests `packages/engine/test/prompts-carry-comps-260e.test.ts`.

## Tests (failing first)
- a home page prompt lists `reference/renders/home.png` and `home.mobile.png` and the motion clip only when approved;
- a setup prompt lists none;
- VISUAL-TRUTH.md is written with the hierarchy and the live-text rule;
- size budget holds with comp lines present.

## Verification

Run from the repository root with `HH_CASSETTE=replay`:
- `pnpm typecheck`
- `pnpm lint`
- the tests of every package you touched (engine, knowledge), for example `pnpm --filter @hitchhiker/engine test`
If a fixture trips a check, fix the fixture, never weaken the check. No network, no paid API call, no real Grok call, no browser download in tests (Playwright Chromium is already in `~/.cache/ms-playwright`; e2e only where stated). Never `--no-verify`, never push, never merge, never deploy, never `hh brief --approve`, never kill a process you did not start. Commit your work with the message below when the checks pass.

## Commit

```
feat: build prompts carry the approved comps as visual truth (260e)
```
