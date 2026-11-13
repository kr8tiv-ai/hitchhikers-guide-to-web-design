---
id: 260f
title: Compare gate - built page vs approved comp, side by side, metrics and vision faults, before a section is done
kind: build
effort: xhigh
model: grok-4.7
depends_on: 260e
---

# 260f - Compare gate - built page vs approved comp, side by side, metrics and vision faults, before a section is done

Read `build-plan/IMAGINE-FIRST-SPEC.md` first. It is the contract for this chain and lists the verified xAI endpoints. Confirm every claim about existing code by reading it; if the code differs from this prompt, adapt, prefer wiring existing code over new code, and say so in the commit body.

## Goal
A page/section is not done until its built screenshots match the approved comps. This is the Tina `compare-visual.py` pattern made deterministic and part of the per-prompt close.

## Must haves
1. `packages/qa/src/comp-compare.ts` (exported): `compareToComp({ shot, comp, view, out })` using the existing Playwright Chromium (no new native deps): writes a labelled side-by-side composite (`COMP` left, `BUILD <width>` right, same height) as JPEG, and computes metrics in canvas: luminance layout similarity on a 32x18 grid (0-1), dominant palette distance (mean CIEDE2000 between 5-colour palettes), and per-band edge-density difference. Text-free comps vs live text are expected: ignore fine detail, compare structure.
2. `runCompGate(projectDir, promptId, page, deps)`: builds/previews the site on a free port (never a desk port; reuse the existing preview helper), shoots the page at each approved view's viewport (fold) or full page (long), runs `compareToComp`, then one `think()` vision review with both images per view returning JSON (validate with `validateJson`): `faults: [{ view, area, fault, expected, fix, blocking }]`, concrete and visual. Writes `qa/compare/<promptId>/<view>.jpg`, `metrics.json`, `faults.md`.
3. Clean = no blocking faults AND metrics above `design.compare` floors (config with conservative defaults, e.g. layout >= 0.55, palette ΔE <= 18; document them). Not clean: the faults go back as a fix turn through the existing feedback-rerun / recovery path, then reshoot, up to `design.compare.rounds` (default 2). Out of rounds: the queue pauses for the owner (reuse `queue.pause`, reason `comp-mismatch`) with the composites; never a silent pass. Prompts that own no page skip with a logged reason (not a pass).
4. Wire it into the per-prompt close for page/section prompts. If 245l's loop exists in the code when you run, make it use the comp gate result instead of adding a second loop; if it does not exist, add the gate as its own close step.
5. Preview processes are always killed, with timeouts; the gate never blocks the desk event loop.
6. Optional motion compare: when an approved motion clip exists, record the section with Playwright `recordVideo` at 1280x720 scrolling as the clip does, extract 12 frames from both with `ffmpeg` when it is on PATH (skip with a logged reason otherwise), write a contact sheet `qa/compare/<promptId>/motion.jpg` and a choreography review via `think()`. Advisory unless `design.compare.motionBlocking` is true.

## Files
`packages/qa/src/comp-compare.ts`, the close-step wiring in engine/orchestrator, config, tests `packages/qa/test/comp-compare-260f.test.ts` (metrics on generated fixture PNGs: identical images score 1, a mirrored layout scores low, a recoloured palette raises ΔE) and `packages/engine/test/comp-gate-260f.test.ts` (fake shooter, fake think, fake rerun). Browser-based metric tests may use the cached Chromium; keep them short and skip with a reason only if Chromium is genuinely missing.

## Tests (failing first)
- identical comp/shot passes, mirrored layout fails the layout floor, recoloured fails palette;
- a blocking vision fault triggers exactly one fix turn carrying the fault text and the comp path, then a reshoot;
- out of rounds pauses with reason comp-mismatch and the composite paths;
- a setup prompt skips with a logged reason;
- the composite file exists with both labels (check dimensions).

## Verification

Run from the repository root with `HH_CASSETTE=replay`:
- `pnpm typecheck`
- `pnpm lint`
- the tests of every package you touched (qa, engine), for example `pnpm --filter @hitchhiker/engine test`
If a fixture trips a check, fix the fixture, never weaken the check. No network, no paid API call, no real Grok call, no browser download in tests (Playwright Chromium is already in `~/.cache/ms-playwright`; e2e only where stated). Never `--no-verify`, never push, never merge, never deploy, never `hh brief --approve`, never kill a process you did not start. Commit your work with the message below when the checks pass.

## Commit

```
feat: compare gate (260f)
```
