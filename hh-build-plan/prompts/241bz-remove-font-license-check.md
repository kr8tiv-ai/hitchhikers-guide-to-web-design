---
id: "241bz"
kind: build
phase: improbability-drive
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: ["241b"]
title: "241z: remove font license verification (Matt's decision); keep the font library"
---

# 241z (file 241bz). Remove font license verification; keep the curated font library

## WHY (read this first)

The desk exists to make Grok's sites orders of magnitude more beautiful than plain Grok. 241a added a font license-check gate (commit `a022f8b0`, `packages/qa/src/licenses.ts` font logic, `packages/qa/test/font-licenses.test.ts`) and license verification in the font pipeline. Matt has decided the desk does not verify font licenses. A gate that can fail a beautiful site over a license lookup works against the goal. Remove it cleanly. Keep the curated pairing library, the overused-defaults policy, the type gate, the type scale and the mood-word pick exactly as they are.

## RULES

Same RULES block as 220-241b, with one explicit exception decided by Matt: the tests that exist only to check font license verification (`packages/qa/test/font-licenses.test.ts` and any font-license assertions elsewhere) are removed together with the feature they test. Do not weaken or remove any other test. No new dependencies. Tests never spawn a real Grok session or make a live call. Do not touch Paradise Found or a desk on port 4175.

## Items

- [ ] Remove the font license-check gate from `packages/qa/src/licenses.ts` (keep code-dependency license checks that existed before 241a) and every runner call to it.
- [ ] Remove license verification from the font pipeline: no gate, warning or test fails or blocks on a font's license, OFL.txt presence, Fontshare FFL vendoring or Pangram status. Library entries may keep their descriptive `license` / `source` fields as information only; nothing checks them.
- [ ] Remove the 241a tests that only verify font licenses, and any test assertion that the shipped library has license-verified entries. Keep every other 241a test green.
- [ ] Update `docs/` and `packages/knowledge/packs/typography/SKILL.md` so they no longer promise a font license check.

## Verification
`pnpm -r test`, lint and typecheck green; `git grep -i "font.*licen"` in `packages/qa/src` shows no gate.

## Commit
```
refactor(qa): remove font license verification per Matt, keep the curated font library (241z)
```