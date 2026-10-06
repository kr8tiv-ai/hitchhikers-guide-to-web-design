---
id: "159"
kind: once-over
phase: so-long-and-thanks-for-all-the-fish
slice: Forty-Two
title: "Once-over: the Guide against the v2 spec"
tier: Forty-Two
effort: xhigh
model: grok-4.7
depends_on: ["158"]
review_checkpoint_embedded: false
---

# 159. Once-over: the Guide against the v2 spec

## RULES

You are Grok 4.7 in Grok Build, building The Hitchhiker's Guide to Web Design. This prompt builds the Guide app itself, not a client's website.

- TypeScript strict. No `any` unless a line in this prompt names the exception and the reason.
- Tests ship with the behavior. Run the verification commands before you finish.
- No secrets in source, fixtures, logs, or commits. Keys come from the environment or the OS keychain.
- MIT-compatible dependencies only. Before adding a package, check the registry: exact name, license field, repository URL, and that the repo is the project you meant. Record the result in NOTICE. GPL and AGPL are out. Apache-2.0, BSD, ISC, MIT, Unlicense, Zlib, and MPL-2.0 (file-level, noted in NOTICE) are allowed. Font files may be SIL OFL-1.1. Media assets (models, HDRIs, textures, images) may be CC0 or CC-BY-4.0 with a CREDITS.json entry.
- Do not bundle `@theatre/studio` (AGPL-3.0). Theatre runtime means `@theatre/core` only, pinned, never `@latest`.
- Motion toolkit (D-001): GSAP is the base engine (ScrollTrigger, SplitText, and the other free plugins), and Three.js, raw WebGL/GLSL (OGL or WebGL2), Motion, anime.js, Theatre.js core, Lenis, CSS scroll-driven animations, and vanilla JS all ship. The picker chooses per effect. No replacement or fallback paths.
- One job. Do not implement the next prompt.
- The app UI obeys the anti-slop rulebook: no purple-to-blue gradients, no magnetic buttons, no default Tailwind indigo look, no lorem, no banned words in user-facing copy, no exclamation marks. App screens use the Guide design system in packages/app/src/design/ (tokens, type, motion, components). Never ship an unstyled or default-looking screen. The app must look agency-grade with Don't Panic energy.
- Windows, macOS, and Linux. Use `node:path` and `node:os`. No hardcoded POSIX paths. No required `pdftotext`, Homebrew, or apt.
- If a doc in the repo disagrees with this prompt, stop and write the conflict in the summary. Do not invent an API.
- Authority: context/matt-answers.md (Matt's 40 answers) and DECISIONS.md override everything, including this prompt and CONTEXT-PACKAGE.v2.md. CONTEXT-PACKAGE.md (v1) holds full detail where v2 says "as in v1". If this prompt contradicts Matt, follow Matt and record the conflict.
- Commit when the checks pass. Do not push. Do not create a GitHub repo. Do not deploy.

This session is the finishing pass. Effort is xhigh. You are not shipping a new phase. You are looking for drift.

## Goal

Read the v2 spec and the reviews, then walk the repo. Write a fix list of real misses: a requirement with no code, two scroll owners, a GSAP fallback that D-001 forbids, a secret in the tree, a GPL dependency, a UI that fails the anti-slop rulebook, a gate that cannot run, a deploy path that fires without a yes. Turn each miss into a self-contained fix prompt under `hh-build-plan/once-over/` and apply only the fixes that are local and obvious. Architectural holes are listed, not improvised.

## Read first

- hh-build-plan/CONTEXT-PACKAGE.v2.md
- DECISIONS.md at the repo root (D-001 to D-008)
- hh-build-plan/ROADMAP.md
- hh-build-plan/prompts/INDEX.md
- hh-build-plan/reviews/*.md
- hh-build-plan/CRITIQUE.md section 9, so you do not 'fix' an open question Matt still owns
- context/matt-answers.md (all 40 answers; these win)
- context/miro/*.png and CONTEXT-PACKAGE.md (v1) §8.1 (Miro transcription)
- hh-build-plan-review/REVIEW.md §3–§4 coverage tables if present, otherwise hh-build-plan/CRITIQUE.md

## Files to create or change

- `hh-build-plan/once-over/REPORT.md`
- `hh-build-plan/once-over/NNN-fix.md` for each applied or proposed fix
- Source files only for a local miss you can prove with a test in the same commit

## Steps

1. Build a checklist from v2 sections 4, 8.4, 11, 12, 14, 15, 18, and 19. For each normative sentence, mark PRESENT, PARTIAL, or MISSING with a path. Also mark every Matt answer Q1–Q40 and every Miro box PRESENT, PARTIAL, or MISSING with a path. Check the app at 375 and 1440 against the 010 design system: a generic or default-looking screen is a MISSING row for Q34.

2. Confirm the motion toolkit. Search the repo for a MIT-fallback switch, an 'avoid Theatre' comment that deletes the integration, and any import of `@theatre/studio`. GSAP must be the default engine. Lenis, Three, OGL or raw WebGL2, Motion, anime.js, `@theatre/core`, CSS scroll-driven animations, and a vanilla path must all be reachable from the knowledge pack or templates. Generated-site examples must not import every library on every page.

3. Confirm coexistence helpers exist: one ticker, one scroll owner decision, one WebGL context factory, reduced motion, calm phone notes in the motion spec generator.

4. Confirm `.hitchhiker` state, the lock, the home index, and that `.planning/` is not the Guide's state directory.

5. Confirm interview tree ids DP-0.1 through DP-9.5 exist in `interview/tree.yaml`, including depth tags.

6. Confirm `/hh-doctor` probes session-id shape and does not assume a slug is a legal `--session-id`.

7. Confirm deploy adapters refuse to run without an approval flag. Search for a default `yes`.

8. Run the test suite and the license audit script. Record failures as misses, not as vibes.

9. Open the companion app if it builds. Check the chat and the dashboard at 375 and 1440. Hunt anti-slop.

10. Write REPORT.md with the checklist, the misses, and what you fixed. Do not claim the product is done if a MISSING row remains.

## Acceptance criteria

- [ ] `hh-build-plan/once-over/REPORT.md` has a row for each normative area above.
- [ ] D-001 violations are either absent or listed as MISSING with a file path.
- [ ] No new product surface is invented in this pass.
- [ ] Screenshots or an explicit 'UI did not build' note exist for the app shell.
- [ ] The test command's exit code is in the report.

## must_haves

truths:

- The report distinguishes missing work from work that is present.
- A GSAP fallback project is not introduced here.
- Fixes that land have tests.

artifacts:

- hh-build-plan/once-over/REPORT.md

key_links:

- REPORT.md links each MISSING row to a v2 section number.

prohibitions:

- Do not push, deploy, or create the GitHub repo.
- Do not delete reviews to hide a failure.
- Do not relax Lighthouse or axe gates to make a dogfood run pass.

## Verification

```powershell
Test-Path hh-build-plan/once-over/REPORT.md
pnpm -w test
pnpm -w exec hh doctor
```

If `pnpm -w test` is not wired yet, that fact is a MISSING row, and you run the per-package tests that do exist.

## Commit

```
docs(once-over): v2 spec sweep and local fixes
```
