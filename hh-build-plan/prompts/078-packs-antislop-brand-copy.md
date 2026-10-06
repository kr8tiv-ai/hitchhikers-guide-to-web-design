---
id: "078"
kind: build
phase: deep-thought
slice: Infinite Monkeys
title: "Write the anti-slop, brand, and copy packs"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["076"]
files: ["packages/knowledge/packs/anti-slop/SKILL.md", "packages/knowledge/packs/brand-frameworks/SKILL.md", "packages/knowledge/packs/copywriting/SKILL.md", "packages/knowledge/test/core-packs.test.ts"]
requirements: ["HH-KNOW-02"]
review_checkpoint_embedded: true
---

# 078. Write the anti-slop, brand, and copy packs

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

Author three packs the site prompts can load. Anti-slop lists the banned patterns and the Elevate exception: the word may appear as a product or command name, not as site copy. Brand and copy packs use Matt's method, quoting his AntiHero wording with credit where it helps (D-005), and point at BRAND.md and VOICE.md rather than inlining a client's brand.

## Why this prompt exists

The linter and the writer need the same ban list. If they diverge, the reviewer and the generator will fight.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 14
- packages/knowledge/src/pack.ts
- hh-build-plan/CRITIQUE.md Q-A
- CONTEXT-PACKAGE.md (v1) section 14 (full rulebook)
- context/research/03-awwwards-anatomy.md

## Files to create or change

- packages/knowledge/packs/anti-slop/SKILL.md
- packages/knowledge/packs/brand-frameworks/SKILL.md
- packages/knowledge/packs/copywriting/SKILL.md
- packages/knowledge/test/core-packs.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

Anti-slop bans: purple-to-blue gradients, magnetic buttons, three identical icon cards, lorem, invented testimonials, default Tailwind indigo look, em dashes and exclamation marks in site copy, and the hype words already in the voice compiler. Say that Elevate is allowed in `/hh-elevate` and as a product name in the Guide's own docs, and banned in generated site body copy. Brand pack: purpose, positioning, proof, voice, and a warning not to invent awards. Copy pack: one idea per section, buttons are verbs, 404 is calm, no exclamation marks. All three pass parsePack. No percent claims. No book quotes. Each under 700 words.

## Interfaces and data shapes

```ts
export const CORE_PACKS: readonly ["anti-slop", "brand-frameworks", "copywriting"];
```

## Steps

1. Write the three SKILL.md files with valid frontmatter and paths pointing at themselves.

2. The test loads each with parsePack and lintPackClaims and expects no claim errors.

3. The anti-slop test asserts the file contains `magnetic` and `Elevate` and `/hh-elevate`.

4. Assert none of the files contain `You are an award-winning`.

5. Assert no exclamation marks in the three files.

6. Do not include a client's private brand.

7. Keep original wording.

8. Export nothing if the test reads files directly.

## Edge cases

- A pack that sets effort fails the test.
- Word count over 700 fails.
- The Elevate sentence must not read as permission to use the word in a hero.

## Acceptance criteria

- [ ] Three packs parse.
- [ ] Anti-slop names the banned patterns and the Elevate exception.
- [ ] Any verbatim AntiHero wording carries the credit line.

## must_haves

truths:

- The ban list is data the linter can share later.
- Brand advice does not invent proof.

artifacts:

- packages/knowledge/packs/anti-slop/SKILL.md
- packages/knowledge/packs/copywriting/SKILL.md

key_links:

- parsePack validates each file.

prohibitions:

- Do not permit magnetic buttons.
- Do not copy Matt's sentences.
- Do not add unsourced statistics.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/knowledge test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/078.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(knowledge): add anti-slop, brand, and copy packs
```

## REVIEW CHECKPOINT

This build closes a review group. After this commit, the driver runs the fresh-session reviewer prompt `079-review-076-078.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `076` Define the knowledge pack format (Infinite Monkeys, Cup of Tea, medium)
- `077` Add golden site prompts from Matt's method, with credit (Infinite Monkeys, Gargle Blaster, high)
- `078` Write the anti-slop, brand, and copy packs (Infinite Monkeys, Gargle Blaster, high)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.
