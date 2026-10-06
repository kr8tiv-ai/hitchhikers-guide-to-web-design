---
id: "080"
kind: build
phase: deep-thought
slice: Reference Library
title: "Write motion recipes for the full toolkit"
tier: Forty-Two
effort: xhigh
model: grok-4.7
depends_on: ["074", "076"]
files: ["packages/knowledge/packs/motion/SKILL.md", "packages/knowledge/packs/motion/recipes.md", "packages/knowledge/test/motion-pack.test.ts"]
requirements: ["HH-KNOW-03"]
review_checkpoint_embedded: false
---

# 080. Write motion recipes for the full toolkit

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

Write the motion pack so a site prompt can copy one recipe. Required recipes: GSAP plus Lenis on gsap.ticker, SplitText, CSS scroll-driven with @supports and no Lenis, Motion in a React island, a scoped anime.js stagger, an OGL or WebGL2 shader when Three is absent, a lazy Three hero, Theatre core on the ticker, and a vanilla IntersectionObserver fade. The pack says the Guide ships all of these and the page imports one.

## Why this prompt exists

D-001 is not real until a builder can find a working pattern for each tool. A GSAP-only pack would quietly undo the decision.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- DECISIONS.md
- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 15.1 and 15.2
- packages/templates/src/motion-contract.ts
- packages/knowledge/src/pack.ts
- context/research/04-motion-taxonomy.md
- context/research/06-library-stack.md

## Files to create or change

- packages/knowledge/packs/motion/SKILL.md
- packages/knowledge/packs/motion/recipes.md
- packages/knowledge/test/motion-pack.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

SKILL.md frontmatter follows the pack rules. recipes.md holds the snippets. Each snippet is under 40 lines and names its library in a heading. The CSS recipe includes `@supports (animation-timeline: view())` and a note that this recipe is for a native scroller. The Theatre snippet imports `@theatre/core` and the test fails if the file contains `@theatre/studio`. The Three snippet uses dynamic import. The Lenis snippet mentions ScrollTrigger and gsap.ticker. A recipe for reduced motion is a short section, not a library. No price claims. No `GSAP fallback`. Pin comment for Theatre: `0.7.2`.

## Interfaces and data shapes

```ts
export const REQUIRED_RECIPES: readonly string[];
```

## Steps

1. Write both files. REQUIRED_RECIPES in the test lists the nine headings you actually used. Assert each appears.

2. Assert `@theatre/studio` is absent and `@theatre/core` is present.

3. Assert `gsap fallback` is absent and `gsap.ticker` is present.

4. Assert `animation-timeline` and `lenis` are not in the same recipe. You can split recipes.md by `## ` and check each part.

5. Assert OGL or WebGL2 appears, and Three appears in a different section.

6. Assert anime.js and Motion both appear.

7. parsePack on SKILL.md succeeds and effort is absent.

8. Keep claims source-free of fake numbers. If you mention a version, the source line points at the addendum.

9. Do not add npm dependencies in this prompt.

## Edge cases

- A recipe that imports both lenis and animation-timeline fails the split test.
- vanilla recipe must not import gsap.
- SplitText is named as a GSAP plugin, not a separate page-wide library.

## Acceptance criteria

- [ ] All nine recipes exist.
- [ ] Studio and GSAP fallback are absent.
- [ ] Lenis and CSS timelines live in different recipes.

## must_haves

truths:

- The pack covers the full D-001 toolkit.
- Each recipe is scoped to one owner.
- Theatre is pinned and studio is excluded.

artifacts:

- packages/knowledge/packs/motion/recipes.md

key_links:

- Recipes match the libraries planMotion can assign.

prohibitions:

- Do not document a GSAP replacement.
- Do not import @theatre/studio.
- Do not tell the reader to load every library on one page.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/knowledge test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/080.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(knowledge): add recipes for the full motion toolkit
```
