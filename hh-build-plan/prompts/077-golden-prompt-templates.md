---
id: "077"
kind: build
phase: deep-thought
slice: Infinite Monkeys
title: "Add golden site prompts from Matt's method, with credit"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["076"]
files: ["packages/knowledge/golden/page.md", "packages/knowledge/golden/motion.md", "packages/knowledge/golden/qa.md", "packages/engine/test/golden.test.ts"]
requirements: ["HH-SPEC-07"]
review_checkpoint_embedded: false
---

# 077. Add golden site prompts from Matt's method, with credit

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

Write three golden templates a site prompt can be adapted from: a page with copy and no motion, a single-effect motion prompt, and a QA prompt. Matt's AntiHero prompts (context/sources/prompts.txt and the guide texts) may be used word for word with credit (D-005); where you quote him, keep his wording and add the credit line. Each template embeds the shared RULES by reference, names files, and has must_haves. 092 expands the library to about forty templates.

## Why this prompt exists

The generator needs a pattern that is specific enough to imitate. Matt's prompts are proven on real sites, and he has said they may be used verbatim with credit.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 10.5
- DECISIONS.md D-005 (Matt's AntiHero prompts may be used word for word with credit)
- packages/engine/src/spec/site-rules.ts
- context/research/09-antihero-guides-inventory.md
- context/sources/website-on-autopilot.plain.txt and context/sources/prompts.txt (Matt's method and prompts; verbatim use allowed with credit, D-005)

## Files to create or change

- packages/knowledge/golden/page.md
- packages/knowledge/golden/motion.md
- packages/knowledge/golden/qa.md
- packages/engine/test/golden.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

The page template talks about one section, real copy slots, and a ban on lorem. The motion template has a slot `{{library}}` and `{{element}}` and says to import only that library. The QA template names Lighthouse mobile 90 in all four categories on real mobile runs, zero console errors, axe, and the two viewports 375 and 1440. A test reads the files and fails on slop starters (`act as a`, `Ignore previous`) and fails if a file quotes Matt without the credit line. Also fail if the file contains an em dash or an exclamation mark. Keep each template under 900 words.

## Interfaces and data shapes

```ts
export function loadGolden(dir: string): { page: string; motion: string; qa: string };
```

## Steps

1. Write the three markdown files with headings Goal, Files, Steps, must_haves, Verify.

2. Motion file contains the literal tokens `{{library}}` and `{{element}}`.

3. QA file contains `375` and `1440` and `real mobile`.

4. Implement loadGolden and a test that all three exist and pass the denylist.

5. Do not import these into generateSitePrompts yet if that function is already long. A one-line comment in the test says the generator may quote them later.

6. No Douglas Adams book quotes. Matt's prompt wording is allowed with credit.

7. Credit line at the bottom of each file: `Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.`

8. Export nothing from knowledge if it is markdown-only. The loader can live in the engine test file as a helper, or in packages/knowledge/src/golden.ts. Prefer the knowledge package and add its test script.

## Edge cases

- Missing token in the motion file fails the test.
- A template over 900 words fails.
- RULES are referenced by the path `site-rules.ts`, not pasted in full, so they cannot drift. The test checks the reference.

## Acceptance criteria

- [ ] Three templates exist and carry the AntiHero credit line.
- [ ] Motion template has library and element slots.
- [ ] QA template names the phone gate and two widths.

## must_haves

truths:

- Golden prompts credit Matt's AntiHero guides wherever his wording is used.
- They still carry the Guide's rules by reference.

artifacts:

- packages/knowledge/golden/page.md
- packages/knowledge/golden/motion.md
- packages/knowledge/golden/qa.md

key_links:

- The motion template's library slot matches MotionLib names.

prohibitions:

- Do not use Matt's wording without the credit line.
- Do not include lorem.
- Do not add an exclamation mark.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/knowledge test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/077.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(knowledge): add original golden prompt templates
```
