---
id: "076"
kind: build
phase: deep-thought
slice: Infinite Monkeys
title: "Define the knowledge pack format"
tier: Cup of Tea
effort: medium
model: grok-4.7
depends_on: ["003"]
files: ["packages/knowledge/src/pack.ts", "packages/knowledge/test/pack.test.ts"]
requirements: ["HH-KNOW-01"]
review_checkpoint_embedded: false
---

# 076. Define the knowledge pack format

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

Validate a knowledge pack as a folder with SKILL.md frontmatter. Required keys are description, when-to-use, and paths. An `effort` key is a validation error, because Grok will not apply it from frontmatter. Every non-obvious claim in the body must be followed by a source line or the linter warns. This prompt only builds the checker and one fixture pack.

## Why this prompt exists

Packs that hide their sources become folklore. Packs that set effort in frontmatter pretend to control the model. The format stops both.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 17
- hh-build-plan/RESEARCH-ADDENDUM.md note that skill frontmatter effort is not applied by Grok

## Files to create or change

- packages/knowledge/src/pack.ts
- packages/knowledge/test/pack.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

parsePack(markdown) reads YAML frontmatter between --- lines. Throw on effort. paths is a list of strings. The fixture pack is packages/knowledge/packs/example/SKILL.md and it describes the checker itself, which needs no external claim. A second fixture in the test string has a percent claim without a source and must fail a function lintPackClaims. A source line is one that starts with `Source:`.

## Interfaces and data shapes

```ts
export interface PackMeta {
  description: string;
  whenToUse: string;
  paths: string[];
}

export function parsePack(markdown: string): PackMeta;
export function lintPackClaims(body: string): string[];
```

## Steps

1. Implement a small frontmatter parser for the keys you need. Do not add a yaml dependency if the subset is enough.

2. Reject the key effort with a message that says to set effort on the prompt, not the skill.

3. lintPackClaims flags lines containing `%` or a four-digit year used as a statistic when the next non-empty line does not start with Source. Keep the rule simple and test it.

4. The example pack passes lint and parse.

5. Missing description throws.

6. Export the functions and add the knowledge test script.

7. Do not write the real motion pack in this prompt.

8. No network.

## Edge cases

- Frontmatter without a closing --- throws.
- paths as a single string throws. It must be a list.
- An empty body passes the claim linter.

## Acceptance criteria

- [ ] effort in frontmatter throws.
- [ ] A percent without Source fails.
- [ ] The example pack loads.

## must_haves

truths:

- Pack format matches v2 section 17.
- Effort is not a skill frontmatter field.

artifacts:

- packages/knowledge/src/pack.ts
- packages/knowledge/packs/example/SKILL.md

key_links:

- Later packs must pass parsePack and lintPackClaims.

prohibitions:

- Do not set effort in SKILL.md.
- Do not add unsourced statistics in the example.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/knowledge test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/076.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(knowledge): validate pack frontmatter and sources
```
