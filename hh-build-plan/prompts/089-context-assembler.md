---
id: "089"
kind: build
phase: deep-thought
slice: Earth Mk II Blueprints
title: "Assemble CONTEXT.md with anchors under the token budget"
tier: Heart of Gold
effort: high
model: grok-4.7
depends_on: ["069", "073", "088"]
files: ["packages/engine/src/spec/context-doc.ts", "packages/engine/test/context-doc.test.ts"]
requirements: ["HH-SPEC-05"]
review_checkpoint_embedded: false
---

# 089. Assemble CONTEXT.md with anchors under the token budget

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

Build CONTEXT.md for site-build agents. It points at BRAND.md, VOICE.md, MOTION.md, STACK-DECISION.md, and SECTION-PLAN.md with anchors instead of pasting them. The whole file stays at or under 30,000 tokens by a rough word-times-1.3 estimate. If the inputs are already short, still use anchors.

## Why this prompt exists

Pasting the brand brain into every prompt blows the 200k request budget. Anchors are how fresh sessions stay cheap and specific.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 10.3
- packages/engine/templates/gsd/context.md

## Files to create or change

- packages/engine/src/spec/context-doc.ts
- packages/engine/test/context-doc.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

assembleContext(parts) returns markdown with headings Identity, Brand, Voice, Motion, Stack, Sections, Rules. Each of brand, voice, motion, stack, and sections is a line `@.hitchhiker/<file>#<anchor>` plus at most a 40-word gloss. Rules include the anti-slop bans in one short list and the coexistence rules in one short list. Token estimate function is `Math.ceil(words * 1.3)`. Throw if the estimate exceeds 30000. The test uses small strings and expects the anchor syntax. Do not inline the 300-word story.

## Interfaces and data shapes

```ts
export function estimateTokens(markdown: string): number;
export function assembleContext(input: {
  name: string;
  siteWhy: string;
  gloss: { brand: string; voice: string; motion: string; stack: string; sections: string };
}): { markdown: string; tokens: number };
```

## Steps

1. Render the anchor lines exactly as `@.hitchhiker/BRAND.md#purpose` and the siblings you define. Document the anchor ids in a const.

2. Gloss longer than 40 words throws. Do not silently trim. The caller should cut.

3. estimateTokens on a known 10-word string returns 13.

4. Rules include `no exclamation marks` and `one scroll owner`.

5. The file does not contain the phrase `$10-20`.

6. Test that a 40-word gloss is accepted and 41 throws.

7. Export the functions.

8. Do not read the whole brand file from disk inside assembleContext. The caller passes glosses.

## Edge cases

- Empty gloss throws.
- Name with a newline throws.
- Token estimate of empty string is 0.

## Acceptance criteria

- [ ] Anchors are used instead of pasted specs.
- [ ] Over-long glosses throw.
- [ ] The token helper matches the 1.3 rule.

## must_haves

truths:

- CONTEXT.md stays a map, not a dump.
- Motion coexistence is mentioned once in Rules.

artifacts:

- packages/engine/src/spec/context-doc.ts

key_links:

- Anchors match the files compileBrand, planMotion, and decideStack write.

prohibitions:

- Do not paste full BRAND.md.
- Do not exceed the token ceiling.
- Do not include a price slogan for Grok runs.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/089.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(spec): assemble CONTEXT.md as anchors
```
