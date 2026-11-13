---
id: 260g
title: Docs, config and the Imagine key - how the Imagine-first method works and where the key lives
kind: build
effort: xhigh
model: grok-4.7
depends_on: 260f
---

# 260g - Docs, config and the Imagine key - how the Imagine-first method works and where the key lives

Read `build-plan/IMAGINE-FIRST-SPEC.md` first. It is the contract for this chain and lists the verified xAI endpoints. Confirm every claim about existing code by reading it; if the code differs from this prompt, adapt, prefer wiring existing code over new code, and say so in the commit body.

## Goal
Make the new method understandable and safe to switch on.

## Must haves
1. README "How it works" and "Design stages" sections, `docs/desk.md`, `docs/design-library.md`: describe the Imagine-first flow (comps, pick, change, approve, motion refs, build to the comp, compare gate) in the README's existing voice, plain words, no em dashes.
2. `docs/imagine-first.md`: the full flow, the files (`.hitchhiker/comps.json`, `reference/renders/*`, `reference/comps/*`, `VISUAL-TRUTH.md`, `qa/compare/*`), config keys with defaults (`design.comps.*`, `design.motionRefs.*`, `design.compare.*`), providers in order, and costs from `prices.ts` for one typical 5-page site (state the arithmetic).
3. `docs/secrets.md` and `hh doctor`: say where the xAI key goes (env `XAI_API_KEY` or OS keychain service `hitchhikers-guide` account `xai`), that the default path uses the signed-in Grok CLI and needs no key, and how to turn the API path on in media settings. `hh doctor` reports which comp provider would be used, without printing any secret.
4. CHANGELOG entry under Unreleased.

## Files
README.md, docs/*, CHANGELOG.md, `packages/cli` doctor code + its test.

## Tests
- doctor test: env key present -> "API ready" without the key text; absent -> "Using your Grok sign-in";
- existing README/doc tests (if any assert headings) still pass.

## Verification

Run from the repository root with `HH_CASSETTE=replay`:
- `pnpm typecheck`
- `pnpm lint`
- the tests of every package you touched (docs, cli), for example `pnpm --filter @hitchhiker/engine test`
If a fixture trips a check, fix the fixture, never weaken the check. No network, no paid API call, no real Grok call, no browser download in tests (Playwright Chromium is already in `~/.cache/ms-playwright`; e2e only where stated). Never `--no-verify`, never push, never merge, never deploy, never `hh brief --approve`, never kill a process you did not start. Commit your work with the message below when the checks pass.

## Commit

```
feat: docs, config and the imagine key (260g)
```
