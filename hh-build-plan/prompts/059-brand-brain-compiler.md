---
id: "059"
kind: build
phase: babel-fish
slice: The Brand Brain
title: "Compile BRAND.md under 1,500 words"
tier: Forty-Two
effort: xhigh
model: grok-4.7
depends_on: ["045", "046", "047", "049", "050", "051", "058"]
files: ["packages/engine/src/brand/brain.ts", "packages/engine/test/brain.test.ts"]
requirements: ["HH-BRAND-08"]
review_checkpoint_embedded: true
---

# 059. Compile BRAND.md under 1,500 words

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

Assemble BRAND.md from the compilers you have. The file is at most 1,500 words, starts with purpose, and includes positioning, archetype marked assumed until approved, voice summary, tokens, imagery rules, and teardown. lintClaims must return ok or compileBrand throws.

## Why this prompt exists

Deep Thought will paste anchors from this file into every site prompt. A 20-page brain will blow the context cap. A short brain that still invented a review is worse.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 9
- packages/engine/src/brand/why.ts
- packages/engine/src/brand/story.ts
- packages/engine/src/brand/tokens.ts
- packages/engine/src/brand/voice.ts
- packages/engine/src/brand/truth.ts
- packages/engine/src/brand/imagery.ts
- packages/engine/src/brand/teardown.ts

## Files to create or change

- packages/engine/src/brand/brain.ts
- packages/engine/test/brain.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

compileBrand(parts) joins sections in a fixed order and counts words. If the draft is over 1,500, cut the teardown quotes first, then the 300-word story, keeping the 25 and 100. If it is still over, throw rather than cutting the voice bans. Front matter is markdown headings, not YAML, so the word count includes headings. Include a line `Status: draft` until the approval prompt changes it. Do not include raw interview json. Do not include API keys. The tea-shop fixture from the tests of the earlier modules should compile. Export the function.

## Interfaces and data shapes

```ts
export interface BrandParts {
  why: WhyDraft;
  story: StoryPack;
  teardownMarkdown: string;
  voiceMarkdown: string;
  cssVars: string;
  imageryMarkdown: string;
  evidence: Evidence;
}

export function compileBrand(parts: BrandParts): { markdown: string; words: number };
```

## Steps

1. Assemble in the order: purpose, positioning, story, voice, tokens, imagery, neighbors.

2. Run lintClaims before returning. On hits, throw BrandTruthError with the hit list. Do not write a file.

3. Word count uses whitespace split. Test a fixture under the cap.

4. Force a long teardown in a test and assert the 300-word story was dropped before the voice section lost the word Banned.

5. Assert `Status: draft` is present.

6. Assert the markdown does not contain `sk-` or `xai-` as if they were keys. A test passes a voice markdown that accidentally includes `xai-secret` and expects a throw from a secret scan. Add scanSecrets(markdown) that throws on `xai-` and `Bearer `.

7. css vars are in a fenced code block.

8. Archetype line includes the word assumed.

9. Export compileBrand.

## Edge cases

- Empty teardown still compiles.
- Word count of exactly 1500 passes. 1501 takes the cut path or throws if cuts are exhausted.
- CRLF input is normalized.

## Acceptance criteria

- [ ] Output is at most 1,500 words.
- [ ] A fake testimonial in a part throws.
- [ ] A secret-shaped token throws.
- [ ] Status is draft.

## must_haves

truths:

- BRAND.md is a compilation, not a new invention.
- The truth gate runs before the file would be saved.
- The voice bans survive length cutting.

artifacts:

- packages/engine/src/brand/brain.ts

key_links:

- compileBrand calls lintClaims and uses every prior brand part.

prohibitions:

- Do not hand-roll a model call in this module. The live Grok call goes through the 011 adapter and is wired in 061; this module stays the deterministic validator and shaper underneath it, tested with fixtures and recorded cassettes.
- Do not emit more than 1,500 words.
- Do not drop the banned-word list to save space.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/059.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(brand): compile BRAND.md under 1500 words
```

## REVIEW CHECKPOINT

This build closes a review group. After this commit, the driver runs the fresh-session reviewer prompt `060-review-057-059.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `057` Grade uploads and upscale with Real-ESRGAN, weights fetched on first use (Hyperspace Bypass, Heart of Gold, high)
- `058` Block invented testimonials, awards, and metrics (Hyperspace Bypass, Gargle Blaster, high)
- `059` Compile BRAND.md under 1,500 words (The Brand Brain, Forty-Two, xhigh)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.
