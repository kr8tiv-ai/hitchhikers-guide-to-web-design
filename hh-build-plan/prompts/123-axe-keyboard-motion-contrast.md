---
id: "123"
kind: build
phase: mostly-harmless
slice: Nutrimatic Test
title: "Check axe, keyboard, reduced motion, and contrast"
tier: Heart of Gold
effort: high
model: grok-4.7
depends_on: ["122", "049"]
files: ["packages/qa/src/a11y-gate.ts", "packages/qa/test/a11y-gate.test.ts"]
requirements: ["HH-QA-02"]
review_checkpoint_embedded: false
---

# 123. Check axe, keyboard, reduced motion, and contrast

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

Fail the gate on a serious or critical axe result, on a missing keyboard path, on a missing reduced-motion handling when motion is present, or on body text contrast under 4.5. The test feeds structured results. It does not launch a browser.

## Why this prompt exists

Lighthouse accessibility is a blunt score. These checks name the failures the Guide promised to block.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 12 and 15.5
- packages/knowledge/packs/a11y/SKILL.md
- packages/engine/src/brand/tokens.ts

## Files to create or change

- packages/qa/src/a11y-gate.ts
- packages/qa/test/a11y-gate.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

evaluateA11y({ axeViolations, hasKeyboardPath, hasReducedMotion, contrastRatio, motionUsed }) returns PASS or BLOCKER. axe violations with impact serious or critical block. minor does not, but is listed as a note. hasKeyboardPath false blocks. If motionUsed and hasReducedMotion is false, block. contrast under 4.5 blocks. Use the contrastRatio function if you import it, or pass the number in. Do not add axe-core in this prompt unless you also record its license. The gate consumes results. Collection can be a later wiring.

## Interfaces and data shapes

```ts
export function evaluateA11y(input: {
  violations: Array<{ impact: "minor" | "moderate" | "serious" | "critical"; id: string }>;
  hasKeyboardPath: boolean;
  hasReducedMotion: boolean;
  contrastRatio: number;
  motionUsed: boolean;
}): { status: "PASS" | "BLOCKER"; notes: string[] };
```

## Steps

1. Critical and serious block. Moderate blocks too. Document that moderate is included. Minor is a note.

2. Keyboard false blocks even if axe is empty.

3. motionUsed true and reduced motion false blocks.

4. motionUsed false does not require the reduced-motion flag.

5. Contrast 4.5 passes. 4.49 blocks.

6. Test each branch.

7. No browser.

8. Export the function.

## Edge cases

- Empty violations and all flags true and contrast 21 is PASS.
- Unknown impact throws.

## Acceptance criteria

- [ ] Serious axe hits block.
- [ ] Reduced motion is required only when motion is used.
- [ ] Contrast uses 4.5.

## must_haves

truths:

- The a11y gate is structured and testable without a browser.
- Keyboard access is not optional.

artifacts:

- packages/qa/src/a11y-gate.ts

key_links:

- contrastRatio matches the brand token helper's threshold.

prohibitions:

- Do not ignore serious axe violations.
- Do not require a browser for the unit test.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/qa test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/123.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(qa): gate axe, keyboard, motion, and contrast
```
