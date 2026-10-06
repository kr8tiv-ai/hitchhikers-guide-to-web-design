---
id: "082"
kind: build
phase: deep-thought
slice: Reference Library
title: "Write typography, color, UX, and accessibility packs"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["076", "049"]
files: ["packages/knowledge/packs/typography/SKILL.md", "packages/knowledge/packs/color/SKILL.md", "packages/knowledge/packs/ux-conversion/SKILL.md", "packages/knowledge/packs/a11y/SKILL.md", "packages/knowledge/test/design-packs.test.ts"]
requirements: ["HH-KNOW-05"]
review_checkpoint_embedded: true
---

# 082. Write typography, color, UX, and accessibility packs

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

Write four packs that tell site prompts how to use type, color, forms, and WCAG 2.2 AA. Contrast numbers are the standard 4.5 to 1 and 3 to 1, which you may state because they are the spec, and you cite WCAG. Do not invent a conversion-rate percent. Touch targets are at least 44px. Fluid type uses clamp. Forms use inputmode and autocomplete.

## Why this prompt exists

Mostly Harmless will test these rules. If the pack and the gate disagree, builders will ship gray-on-white and call it minimal.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 9, 12, and 15.5
- packages/engine/src/brand/tokens.ts
- packages/knowledge/src/pack.ts
- context/research/08-brand-intake-frameworks.md

## Files to create or change

- packages/knowledge/packs/typography/SKILL.md
- packages/knowledge/packs/color/SKILL.md
- packages/knowledge/packs/ux-conversion/SKILL.md
- packages/knowledge/packs/a11y/SKILL.md
- packages/knowledge/test/design-packs.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

Typography: two families, the six pairings as examples not mandates, no more than two. Color: 60-30-10, contrast, do not use color as the only signal, the mixed-research caveat in one sentence so you do not claim red always means danger worldwide. UX: one primary action, no dark patterns, no fake countdowns. A11y: keyboard, focus, reduced motion, contrast, names on controls. All pass the pack linter. The only percent allowed is contrast, and it needs a Source line to the WCAG doc. No `converts at 3%` style claims.

## Interfaces and data shapes

```ts
export const DESIGN_PACKS: readonly string[];
```

## Steps

1. Write the four files with frontmatter and Source lines where a number appears.

2. Test that ux-conversion does not match `/\d+%/`.

3. Test a11y contains `44` and `prefers-reduced-motion` and `4.5`.

4. Test color contains a caveat that meaning is not universal.

5. Test typography says two families.

6. parsePack all four.

7. No exclamation marks.

8. Do not download fonts.

## Edge cases

- A pack with effort frontmatter fails.
- Citing WCAG by name without a URL is acceptable if the Source line says `WCAG 2.2`. Add a URL only if you are sure. `https://www.w3.org/TR/WCAG22/` is the spec. You may use it.

## Acceptance criteria

- [ ] Four packs parse and lint clean.
- [ ] UX pack has no conversion percent.
- [ ] A11y pack names contrast, target size, and reduced motion.

## must_haves

truths:

- Design packs do not invent marketing statistics.
- Accessibility numbers match the gates.

artifacts:

- packages/knowledge/packs/a11y/SKILL.md
- packages/knowledge/packs/color/SKILL.md

key_links:

- Contrast figures match proposePalettes and the Mostly Harmless gate.

prohibitions:

- Do not invent conversion rates.
- Do not claim one emotion per color.
- Do not add exclamation marks.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/knowledge test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/082.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(knowledge): add type, color, UX, and a11y packs
```

## REVIEW CHECKPOINT

This build closes a review group. After this commit, the driver runs the fresh-session reviewer prompt `083-review-080-082.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `080` Write motion recipes for the full toolkit (Reference Library, Forty-Two, xhigh)
- `081` Write stack usage notes for Astro, Next, and Vite (Reference Library, Gargle Blaster, high)
- `082` Write typography, color, UX, and accessibility packs (Reference Library, Gargle Blaster, high)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.
