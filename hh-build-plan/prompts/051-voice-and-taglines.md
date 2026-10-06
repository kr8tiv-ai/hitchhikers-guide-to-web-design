---
id: "051"
kind: build
phase: babel-fish
slice: Babel Voice
title: "Compile VOICE.md and cut thirty taglines to five"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["045", "049"]
files: ["packages/engine/src/brand/voice.ts", "packages/engine/test/voice.test.ts"]
requirements: ["HH-BRAND-06"]
review_checkpoint_embedded: true
---

# 051. Compile VOICE.md and cut thirty taglines to five

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

Write the voice document: this-not-that traits, vocabulary, banned words, punctuation, tone by situation, and microcopy for buttons, errors, empty states, and the 404. Generate tagline candidates from the positioning line and keep five. Reject candidates that use banned words or an exclamation mark.

## Why this prompt exists

Every later page prompt will imitate this file. If the voice file is a vibe paragraph, the site will drift back to generic startup copy.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 9 (voice file contents) and section 14
- packages/engine/src/brand/why.ts
- context/research/08-brand-intake-frameworks.md
- CONTEXT-PACKAGE.md (v1) sections 9.1–9.6
- context/sources/build-a-brand-from-scratch-with-ai.plain.txt (Matt's method; verbatim prompts allowed with credit, D-005)

## Files to create or change

- packages/engine/src/brand/voice.ts
- packages/engine/test/voice.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

renderVoice(input) returns markdown with the headings in the v2 sentence: traits, vocabulary, banned, punctuation, tone, how we talk about product, customer, competitor, price, ourselves, five rewrites, microcopy. Traits are pairs. If the user gave three vibe words and three never-words in DP-5.3, map them. Otherwise use the never-words from the anti-slop list and mark the traits ASSUMED. Banned words include the v2 list you were given in section 14: at least elevate, seamless, innovative, cutting-edge, and the em dash as a punctuation ban. Taglines: buildTaglines(positioning) returns exactly five strings, each under 8 words, no exclamation mark, no banned word. You may start from templates that rearrange the offer and the visitor. If you cannot make five without repeating, repeat is worse: return fewer and set shortfall true. The test can require five for a normal tea-shop positioning. Microcopy 404 is a sentence with a period. No jokes about the end of the universe.

## Interfaces and data shapes

```ts
export interface VoiceDoc {
  markdown: string;
  taglines: string[];
  shortfall: boolean;
  assumed: boolean;
}

export function renderVoice(input: { vibe: string; antiVibe: string; positioning: string; offer: string }): VoiceDoc;
```

## Steps

1. Parse vibe and anti-vibe into word lists on commas. Build this-not-that lines.

2. Always include the banned word list even if the user wrote none.

3. Punctuation section says no exclamation marks and no em dashes in site copy.

4. build the five taglines as pure rearrangements. Test they do not contain elevate or `!`.

5. Microcopy keys: button, error, empty, notFound. The 404 does not say `Oops`.

6. Five rewrites section: take the sentence `We are passionate about innovative solutions` and rewrite it using the offer. The rewrite must not contain passionate or innovative. Include that pair as an example in the doc.

7. If antiVibe is empty, assumed is true.

8. Export renderVoice.

9. Keep the markdown under 1,200 words. Assert in the test.

## Edge cases

- A tagline longer than 8 words is discarded, not shipped.
- Duplicate taglines are dropped.
- Competitor talk says we do not insult named businesses. Use the user's boredom note only if passed. This function does not take it. Say `We do not name competitors in headlines.`

## Acceptance criteria

- [ ] Five taglines for the fixture, all short, none banned.
- [ ] 404 copy has no exclamation mark and does not say Oops.
- [ ] The passionate example is rewritten without that word.

## must_haves

truths:

- VOICE.md structure matches the v2 list.
- Taglines are filtered, not merely generated.
- Anti-slop words are banned in the voice file itself.

artifacts:

- packages/engine/src/brand/voice.ts

key_links:

- renderVoice uses the positioning line from buildStory.

prohibitions:

- Do not leave an exclamation mark in microcopy.
- Do not hand-roll a model call in this module. The live Grok call goes through the 011 adapter and is wired in 061 (Grok writes the 30 taglines; this module validates and cuts to 5); this module stays the deterministic validator and shaper underneath it, tested with fixtures and recorded cassettes.
- Do not quote the novel.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/051.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(brand): compile VOICE.md and five taglines
```

## REVIEW CHECKPOINT

This build closes a review group. After this commit, the driver runs the fresh-session reviewer prompt `052-review-049-051.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `049` Build palettes, type pairs, and contrast tokens (Sens-O-Matic, Gargle Blaster, high)
- `050` Write imagery rules and Imagine prompt stubs (Sens-O-Matic, Cup of Tea, medium)
- `051` Compile VOICE.md and cut thirty taglines to five (Babel Voice, Gargle Blaster, high)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.
