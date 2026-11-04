---
id: 245t
title: Proof run - build one small test site end to end with the new pipeline and report jury scores and screenshots against the pass bar
kind: build
effort: xhigh
model: grok-4.7-build-fast
depends_on: 245s
---

# 245t - Proof run of the 245 design pipeline on a small scratch site (BUG-156)

## Context

245a-245s changed the design gate, references and renders, prompt generation, the visual constitution, the design-system package and section primitives with the hero-variant gate, typography checks, the screenshot loop with reference stills, the jury and blockers, the motion rules, the rhythm detector, the coherence reviewer, elevate as a design partner and the owner look. This prompt proves them together on a fresh, small site. Do not touch C:\Users\lucid\Desktop\desk-e2e-run11 (site-c and its desk on port 4175 may still be running), its queue, its driver or any running grok process. Do not modify C:\Users\lucid\Desktop\primetime-site.

Also covered since the plan was written: 245x optical/micro-detail checks, 245u motion recipe library and style-world map, 245v signature moments, 245w motion constitution, choreography score and motion lint. REPORT.md must also list, per page: the locked signature moments and whether `checkSignature` passed, the choreography score and motion-lint findings, the optical findings, and the signature-critique answers. Defaults for this run: K=3, `design.screenshotRounds` 3, `design.keySectionRounds` 2, jury Design >= 7 and Creativity >= 6 with target 8, `design.ownerLook` on, `design.elevate.freeRounds` 1.

## Deliverables

1. Create a scratch project at `C:\Users\lucid\Desktop\desk-proof-245\site` (outside the repo): a two-page brief (home plus one inner page, for example a small bakery), two owner photos from the repo's test fixtures, two named references whose URLs are in the design library.
2. Run the pipeline through the real engine and desk on a free port (not 4175; record the port). Stages: interview answers from a fixture, direction pick, DESIGN.md, reference capture, renders through the grok-cli image provider (no paid API), site prompts, build with the 245l loop and 245m jury.
3. Owner steps are not faked by the engine. Every approval (direction pick, style guide lock, render approvals, owner-look OKs) is made through the desk's own owner actions by this proof harness, and each is recorded in `C:\Users\lucid\Desktop\desk-proof-245\APPROVALS.md` as "approved by the proof harness, not the owner". Never run `hh brief --approve`.
4. Write `C:\Users\lucid\Desktop\desk-proof-245\REPORT.md`: prompt count and average prompt size (vs run 11: 122 prompts, ~32 KB), per page the jury scores vs the bar (Design >= 7, Creativity >= 6, target 8), rounds used in the screenshot loop, faults found and fixed, which design-system variants each section used and whether the hero-variant gate passed, typography score, rhythm/uniqueness result, coherence drift reports, elevate menu picks, beauty/recipe/bench blocker results, the CDP assertion report per page (blockers and fixes at 375/768/1440, before and after the loop), the design-lab gate result, K-candidate scores for the hero and signature sections with the winner and the credit count used, skill-router rules injected per prompt, drift check result, lint result, and links to the contact sheets and final 375/768/1440 shots beside the renders. State plainly whether each page met the bar and what failed if not.
5. Fix nothing in engine code in this prompt. If the run exposes a bug, write it in REPORT.md as a numbered finding with the file and function, and stop.
6. Stop and kill every preview, desk and grok process this prompt started (only those, by PID) at the end.

## Tests

- The repo gates below pass unchanged (this prompt does not change engine code).
- REPORT.md exists with every field above; each page has a contact sheet and a jury JSON; APPROVALS.md lists every approval.

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

Commit nothing in the scratch folder. If the repo is unchanged, make no commit and say so; if you added only a fixture under `packages/*/test/fixtures/`, commit:

```
test(engine): proof-run fixture for the 245 design pipeline (245t)
```
