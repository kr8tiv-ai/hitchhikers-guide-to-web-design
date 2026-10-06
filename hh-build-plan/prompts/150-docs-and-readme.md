---
id: "150"
kind: build
phase: so-long-and-thanks-for-all-the-fish
slice: NOTICE Board
title: "Write the README in the Guide's voice"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["021", "138", "148", "149"]
files: ["README.md", "docs/dont-panic.md", "packages/engine/test/readme.test.ts"]
requirements: ["HH-SHIP-08"]
review_checkpoint_embedded: true
---

# 150. Write the README in the Guide's voice

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

Write a README that tells a new contributor what the Guide is, how to run tests, and which commands exist. The voice is precise and calm. No book quotes, no exclamation marks, no claim that SuperGrok pays Imagine. Credit the method's human influences without pasting their prompts. The Motion section lists the full toolkit (GSAP with ScrollTrigger and SplitText as the base, Three.js, raw WebGL/GLSL via OGL or WebGL2, Motion, anime.js, Theatre.js core, Lenis, CSS scroll-driven animations, vanilla JS) and says the picker chooses per effect. The section is about craft and choice per effect.

## Why this prompt exists

The repo will be public and MIT. The README is the contract a stranger sees. A jokey README that quotes the novel creates a trademark problem the critique already flagged.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 1, 2, and 18
- packages/grok-plugin/skills/guide-persona/SKILL.md
- DECISIONS.md

## Files to create or change

- README.md
- docs/dont-panic.md
- packages/engine/test/readme.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

README sections: Don't Panic (what this is, in the Guide's voice), Quick start (npx hitchhikers-guide, hh install, /hh-new, /hh-dont-panic), What this is not, The six phases, Commands (generated from the real command list in packages/grok-plugin), Motion, Develop, Credits (Matt Haynes's AntiHero guides at antihero.community, open-gsd/gsd-core, every third-party licence in NOTICE), License (MIT). Links point to https://github.com/kr8tiv-ai/hitchhikers-guide-to-web-design. What this is not includes: not a hosted builder, not a drag-and-drop editor, not a template store, not a paid SaaS. Motion section names the toolkit in one paragraph and says generated sites import only what they use. Develop says Node 22, pnpm, and `pnpm -w test` or the per-package tests if the workspace script is not wired yet. If it is not wired, add a root test script that runs the package tests you know exist. The test reads README.md and fails on `!`, on `Don't Panic!`, and on the words autistic and autism. `Don't Panic` with a period is allowed once.

## Interfaces and data shapes

```ts
export function assertReadme(markdown: string): void;
```

## Steps

1. Write README.md and a shorter docs/dont-panic.md that points at hh doctor and the interview.

2. Implement assertReadme in the test file or in the engine. It throws on the banned strings.

3. Mention MIT and NOTICE.

4. Mention vendor gsd-core as templates, not a runtime dependency.

5. Do not include a personal email or a token.

6. Commands table lists hh doctor, hh mostly-harmless, and hh elevate with the yes rule.

7. Keep the README under 900 words.

8. Mention that hh install copies skills into a project's .grok directory, and that the install prompt is the one that implements the copy. Do not implement the copy in this prompt.

## Edge cases

- The word spectrum must not appear, matching the persona rule.
- An em dash fails assertReadme.

## Acceptance criteria

- [ ] README explains the product and the motion decision.
- [ ] Banned persona words and exclamation marks are absent.
- [ ] The test reads the file from disk.

## must_haves

truths:

- The public introduction matches the locked decisions.
- It does not quote the novel.

artifacts:

- README.md
- docs/dont-panic.md

key_links:

- assertReadme reads README.md.

prohibitions:

- Do not quote the book.
- Do not claim Imagine is free with SuperGrok.
- Do not add a GSAP fallback.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/150.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
docs: add the Guide README
```
## REVIEW CHECKPOINT

This build closes a review group. After this commit, the driver runs the fresh-session reviewer prompt `151-review-148-150.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `148` Package the CLI so npx and hh install work (NOTICE Board, Heart of Gold, high)
- `149` Grok Build plugin command set (NOTICE Board, Heart of Gold, high)
- `150` Write the README in the Guide's voice (NOTICE Board, Gargle Blaster, high)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.
