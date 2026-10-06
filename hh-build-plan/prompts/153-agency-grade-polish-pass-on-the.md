---
id: "153"
kind: build
phase: so-long-and-thanks-for-all-the-fish
slice: Don't Panic Release
title: "Agency-grade polish pass on the Guide app"
tier: Forty-Two
effort: xhigh
model: grok-4.7
depends_on: ["010", "030", "031", "033", "034", "037", "038", "065", "093", "116", "134", "152"]
files: ["packages/app/src/", "packages/app/e2e/polish.spec.ts", "packages/app/POLISH.md", "packages/app/src/design/"]
requirements: ["HH-DS-02"]
review_checkpoint_embedded: false
---

# 153. Agency-grade polish pass on the Guide app

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

Screenshot every app screen at 375, 768, and 1440, critique them with Grok vision against the 015 design system and the anti-slop rulebook, apply the fix list (motion, type, spacing, empty and error states, focus states), and reach Lighthouse 90 or more on the app itself with axe clean. No screen may look default (Q34).

## Why this prompt exists

Screens were built across many prompts. A single, demanding pass at the end makes the whole app feel designed by one agency, which is the promise Matt made to users.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- packages/app/src/design/README.md and comps (015)
- context/matt-answers.md Q33 and Q34
- CONTEXT-PACKAGE.md (v1) section 14 (anti-slop rulebook)
- packages/qa/src/zaphod-vision.ts (142) and packages/qa/src/antislop.ts (112)
- context/matt-answers.md and DECISIONS.md (authority; they override this prompt)

## Files to create or change

- packages/app/src/
- packages/app/e2e/polish.spec.ts
- packages/app/POLISH.md
- packages/app/src/design/

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

polish.spec.ts visits every route (desk, gallery, motion, brand kit, approvals, dashboard, before-jump, error and empty states via fixtures) at three widths in light and dark, saving screenshots under packages/app/e2e/screens/polish/ (gitignored). Grok vision (think with images, xhigh) critiques each screen against the 015 comps and rulebook with schema { screen, issues: [{ severity, area, fix }] }. Apply fixes in the app source and design system only (no new features). Re-shoot and compare. Run Lighthouse (desktop and mobile) on the served app and axe on every route. POLISH.md records before and after per screen, the issues fixed, and the final scores.

## Interfaces and data shapes

```ts
export function listAppRoutes(): Array<{ path: string; states: string[] }>;
```

## Steps

1. Write listAppRoutes and polish.spec.ts.

2. Shoot every screen before changes.

3. Run the vision critique and write the fix list to POLISH.md.

4. Apply the fixes; keep each fix small and within the design system.

5. Re-shoot, re-critique, and iterate until no high-severity issues remain.

6. Run Lighthouse on the app (all four categories at 90 or more on mobile) and axe on every route; fix until clean.

7. Write POLISH.md with before and after notes and scores.

## Edge cases

- A fix needs a new component: add it to the design system with tokens, not inline styles.
- Dark mode issues count the same as light mode issues.
- Vision critique asks for a new feature: record it as out of scope.

## Acceptance criteria

- [ ] Before and after screenshots described in the summary for every screen.
- [ ] No screen looks default.
- [ ] App Lighthouse mobile at least 90 in all four categories; axe clean.

## must_haves

truths:

- Every app screen matches the 015 design system.
- The app itself meets the same phone gate as generated sites.
- No default-looking screen ships.

artifacts:

- packages/app/e2e/polish.spec.ts
- packages/app/POLISH.md

key_links:

- Critique uses Grok vision through 017.
- Fixes land in packages/app/src/design/ tokens and components.

prohibitions:

- Do not add features in this pass.
- Do not introduce raw colours outside the tokens.
- Do not weaken tests or gates to pass.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/app test
pnpm --filter @hitchhiker/app exec playwright test e2e/polish.spec.ts
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/153.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
style(app): agency-grade polish pass across every screen
```
