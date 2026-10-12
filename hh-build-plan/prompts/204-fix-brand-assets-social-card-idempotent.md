---
id: "204"
kind: checkpoint
phase: so-long-and-thanks-for-all-the-fish
slice: Forty-Two
title: "Fix brand-assets rewrite so social-card.png stays byte-stable on Linux and macOS CI"
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
depends_on: ["203"]
files: ["packages/app/scripts/build-brand-assets.ts", "packages/app/test/brand-assets.test.ts", "packages/app/public/social-card.png", "packages/app/public/", "docs/assets/"]
review_checkpoint_embedded: false
---

# 204. Fix brand-assets rewrite so social-card.png stays byte-stable on Linux and macOS CI
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

Additional rules for this session only:

- Fix root causes. Never weaken, skip, delete, or loosen a test or an assertion to get green. A test may change only when it asserts something the product intentionally changed, and then the new assertion must be at least as strict and the summary must say why.
- The driver pushes after checkpoints. You do not push, and you do not run `gh` against the network except read-only `gh run list` and `gh run view --log-failed` if `gh` is already authenticated. If it is not, work from the failure list below.

## Goal

Main went red in the CI workflow on prompt 201 (commit 468a3157, "desk identity"). The app unit test `packages/app/test/brand-assets.test.ts` suite "desk identity", subtest "brand-assets rewrites the rasters with the same bytes" fails on ubuntu-latest and macos-latest every run. Windows-latest is green. Find the real cause and fix it so a second run of `packages/app/scripts/build-brand-assets.ts` leaves every watched identity file unchanged on Windows, macOS, and Linux, with every assertion intact (or replaced by a stricter visual/content check that still fails if the image changes).

## Known failures

1. 2026-10-12, CI run 38224093878 on 468a3157: ubuntu-latest and macos-latest fail `not ok 3 - brand-assets rewrites the rasters with the same bytes` at brand-assets.test.ts:617 with `packages/app/public/social-card.png bytes changed` (expected sha256 `c79189d5603699b1fc4dba0ad84dda73a922523b3cf24ee8c917b14e6407c841`, actual `bfccba8ddb8a510d06f63f91ce4ecf28a12d04f18562dbe74a819090c3f1c099`). windows-latest CI job passed. E2E and Audit were green on the same commit.
2. Prior commit c1ff6b82 (prompt 200) had CI/E2E/Audit green on all runners, so this is new with the desk-identity / brand-assets work from 201.

Leading suspect, to confirm or reject by evidence: `shoot()` takes a Playwright Chromium `page.screenshot({ type: "png" })` and only runs `stabilizePng` (strip ancillary text chunks). Chromium's PNG encoder and/or font/rasterization for the 1200x630 Literata social card is not byte-identical across OS, so a rewrite on Linux/macOS changes `social-card.png` (and likely `docs/assets/social-card.png`) even when the SVG input is unchanged. Icon rasters may look stable by luck or smaller solid shapes. The idempotency guarantee the test encodes is a product requirement (committed brand assets must not churn on every CI run).

## Read first

- `packages/app/scripts/build-brand-assets.ts` (`shoot`, `stabilizePng`, social-card write paths)
- `packages/app/test/brand-assets.test.ts` (desk identity suite, especially the rewrite subtest around line 591)
- Committed `packages/app/public/brand/social-card.svg` and `packages/app/public/social-card.png`
- Prompt 201 summary under `.hitchhiker-dev/summaries/` if present
- `.hh-driver/FLAKES.md` if present
- `gh run view 38224093878 --log-failed` if `gh` is authenticated (read-only)

## Steps

1. Verify first. On this Windows host run `pnpm --filter @hitchhiker/app test` (or the brand-assets test file) and confirm the rewrite subtest passes. If a later commit on main already turned CI green for this test, prove it with the run id, change nothing else, and finish.
2. Reproduce the drift. Run `node --experimental-strip-types packages/app/scripts/build-brand-assets.ts` once, note which watched files change (sha256 before/after), restore from git, and record whether only screenshot-derived PNGs drift. If WSL is available, run the same script there against a clean tree and compare hashes to the committed files.
3. Fix the root cause in the product path so a no-op rewrite is stable on every CI runner. Prefer making the written PNG deterministic across platforms (for example: decode the screenshot to raw RGBA, refuse to write when pixels and dimensions match the existing file, and/or re-encode with a pinned deterministic PNG writer). If Playwright screenshots cannot be made byte-stable, it is acceptable to tighten the test to compare decoded pixels (and dimensions) for raster outputs while still asserting exact bytes for SVG and ICO outputs, but only if pixel comparison is at least as strict about visual content and the summary says why. Do not delete the idempotency check.
4. Re-commit or regenerate any drifted `social-card.png` (public and docs) from the fixed pipeline so HEAD matches what the script writes on this host, and prove a second run changes zero watched files.
5. Run `pnpm --filter @hitchhiker/app test` twice and the brand-assets rewrite subtest at least 5 times in a row with 0 failures. Run `pnpm -r test` once before you finish.
6. As a checkpoint prompt, finish by reviewing your own work as Zaphod would: re-read each truth below against the code, run the suite, and fix at most one defect in a `fix(review):` commit. Do not add features during the review.

## Non-goals

- Do not skip, delete, loosen, or platform-gate the rewrite assertions (no `test.skip`, no `todo`, no `if (process.platform !== "win32")`).
- Do not remove Literata, layout, contrast, maskable, or size checks from the desk identity suite.
- No new dependencies unless an MIT-compatible deterministic PNG encode is truly required and recorded in NOTICE.
- No change to run-build.ps1, the queue runner, or the CI workflow files.
- Do not restyle the mark. Do not start the next prompt.

## Acceptance criteria

- [ ] The root cause is named with evidence from step 2 (which files drift, on which OS, and why `stabilizePng` was not enough).
- [ ] `brand-assets rewrites the rasters with the same bytes` (or its tightened pixel-stable successor) passes on Windows and, by evidence, on Linux and macOS CI.
- [ ] A second local run of `build-brand-assets.ts` changes zero watched identity files.
- [ ] `pnpm -r test` is green. Summary names the CI run that went red and what changed.
