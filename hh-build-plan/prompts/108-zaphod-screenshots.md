---
id: "108"
kind: build
phase: improbability-drive
slice: Zaphod
title: "Capture reviewer screenshots at four widths with same-environment baselines"
tier: Heart of Gold
effort: high
model: grok-4.7
depends_on: ["026"]
files: ["packages/qa/src/screenshots.ts", "packages/qa/test/screenshots.test.ts", "packages/qa/src/visual-policy.ts", "packages/qa/test/visual-policy.test.ts"]
requirements: ["HH-REVIEW-01", "HH-QA-04"]
review_checkpoint_embedded: false
---

# 108. Capture reviewer screenshots at four widths with same-environment baselines

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

## Goal

Take screenshots at 375, 768, 1440, and 1920 through an injected page opener. The reviewer uses these. Tests do not download a browser. Missing shots for a required width fail the result.
Each width captures full page and above the fold, plus a short scroll strip (frames) for sections MOTION.md marks as motion-led. The real Playwright opener is wired in 126; this prompt owns the contract.

Merged scope (formerly a separate prompt, "Accept visual baselines only from the same environment"): Decide whether a screenshot may be compared to a baseline. The baseline must record OS, screen scale, and the width. A mismatch is SKIP, not FAIL. A missing baseline is SKIP with `no baseline`. Pixel diffs are not implemented. The policy stops false failures from a Windows machine comparing a macOS baseline.

## Why this prompt exists

A review that only looks at the desktop layout will bless a broken phone page. The widths are the contract.

Cross-OS screenshot diffs fail for font rendering and waste the review. The spec already says same-environment only.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 11.3 and 12
- packages/crawler/src/crawl.ts
- hh-build-plan/CONTEXT-PACKAGE.v2.md section 12
- packages/qa/src/screenshots.ts

## Files to create or change

- packages/qa/src/screenshots.ts
- packages/qa/test/screenshots.test.ts
- packages/qa/src/visual-policy.ts
- packages/qa/test/visual-policy.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

WIDTHS is the four numbers. captureAll(openPage) calls openPage once per width and returns buffers keyed by width. If a buffer is empty, throw. The opener is injected. Also return the width list so the report can name gaps. Do not assert visual diffs here. That is a later policy.

Merged scope, "Accept visual baselines only from the same environment": BaselineMeta is `{ os, scale, width }`. decideVisual(current, baseline) returns compare, skip-mismatch, or skip-missing. os comes from an argument, not from a live os.platform() inside the pure function, so the test can pass `win32` and `darwin`. scale is a number. width must be one of the review widths.

## Interfaces and data shapes

```ts
export const REVIEW_WIDTHS: readonly [375, 768, 1440, 1920];
export function captureAll(openPage: (width: number) => Promise<Buffer>): Promise<Record<number, Buffer>>;
```

```ts
export interface BaselineMeta { os: string; scale: number; width: number; }
export function decideVisual(current: BaselineMeta, baseline: BaselineMeta | null): { action: "compare" | "skip-mismatch" | "skip-missing"; reason: string };
```

## Steps

1. Call the opener with each width in order.

2. Reject an empty buffer.

3. The test opener records widths and returns Buffer.from('png').

4. A test opener that returns an empty buffer on 375 expects a throw naming 375.

5. Do not import playwright in the unit test path.

6. Export REVIEW_WIDTHS and captureAll.

7. Add the qa package test script.

8. No network.

9. Null baseline returns skip-missing.

10. Different os returns skip-mismatch and names both.

11. Same os and different scale skips.

12. Same meta returns compare.

13. Width not in REVIEW_WIDTHS throws.

14. Do not read image bytes.

15. Export the function.

16. No snapshot files are committed.

## Edge cases

- If the opener throws, the error includes the width.
- Do not catch and continue after a failed width.
- Scale 1 and 1.0 match.
- OS compare is case-sensitive. Document that callers pass node os.platform() values.

## Acceptance criteria

- [ ] All four widths are requested.
- [ ] An empty shot fails.
- [ ] The test has no browser dependency.
- [ ] Cross-OS pairs skip.
- [ ] Same environment compares.
- [ ] Missing baselines do not fail the build.

## must_haves

truths:

- Review screenshots include a phone width and a wide width.
- Capture is injectable.
- Visual regression does not cross operating systems.
- This prompt does not invent a pixel diff.

artifacts:

- packages/qa/src/screenshots.ts
- packages/qa/src/visual-policy.ts

key_links:

- Widths match the Mostly Harmless and Zaphod sections of v2.
- Widths reuse REVIEW_WIDTHS.

prohibitions:

- Do not skip 375.
- Do not require a browser install for the unit test.
- Do not fail a build because the baseline was made on another OS.
- Do not commit binary snapshots.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/qa test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/108.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(qa): capture review screenshots at four widths
```

