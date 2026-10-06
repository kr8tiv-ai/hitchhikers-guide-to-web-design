---
id: "045"
kind: build
phase: babel-fish
slice: Deep Why
title: "Compile a one-sentence why and a longer finder"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["043"]
files: ["packages/engine/src/brand/why.ts", "packages/engine/test/why.test.ts"]
requirements: ["HH-BRAND-01"]
review_checkpoint_embedded: false
---

# 045. Compile a one-sentence why and a longer finder

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

Turn interview answers into two texts: a one-sentence site why that already exists, and a brand why of 25 words that the user can accept. If the brand why was deferred, derive a draft from the site why, the offer, and the visitor, and mark it ASSUMED until they approve.

## Why this prompt exists

Babel Fish starts from purpose. A logo chosen before the why is decoration. This compiler is the deterministic shaper so the test can lock the words; the live Why Finder conversation runs on Grok through 011 in 061 and feeds this compiler.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 8.4 and 9
- context/research/08-brand-intake-frameworks.md (method only, do not copy prompts)
- packages/engine/src/required.ts
- CONTEXT-PACKAGE.md (v1) sections 9.1–9.6
- context/sources/build-a-brand-from-scratch-with-ai.plain.txt (Matt's method; verbatim prompts allowed with credit, D-005)

## Files to create or change

- packages/engine/src/brand/why.ts
- packages/engine/test/why.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

compileWhy(answers) reads DP-2.1, DP-2.6, DP-2.7, and DP-1.7. Site sentence is the DP-2.1 value, trimmed. If it is longer than 240 characters, truncate on a word boundary and set siteTruncated true. Brand draft: if DP-1.7 status is ANSWERED or IMPORTED and the value has at least 8 words, use it and status ANSWERED. Otherwise build `${visitor} comes for ${offer} because ${siteWhy}` using the answer values, status ASSUMED, and do not add adjectives they did not say. Refuse to insert words from a banned list: innovative, elevate, seamless, cutting-edge, passionate. If an input contains one, strip that word and add a warning. No exclamation marks in the output. No book quote. This is not the model prompt. A later session may rewrite, but the stored draft starts here.

## Interfaces and data shapes

```ts
export interface WhyDraft {
  siteWhy: string;
  brandWhy: string;
  status: "ANSWERED" | "ASSUMED" | "IMPORTED";
  warnings: string[];
  siteTruncated: boolean;
}

export function compileWhy(answers: AnswerRecord[]): WhyDraft;
```

## Steps

1. Implement compileWhy. Missing DP-2.1 throws WhyError. The interview gate should have caught this. Still throw.

2. Strip the banned words case-insensitively as whole words. `innovation` may remain. `innovative` may not.

3. The template uses the visitor and offer values raw after trim. If offer is missing, brand why status is ASSUMED and the sentence is the site why only.

4. Test the truncation at 240 characters with a long fixture.

5. Test that an IMPORTED DP-1.7 of sufficient length is kept and not rewritten.

6. Test a banned word in the offer is removed and named in warnings.

7. Reject output that still contains `!`. If the user wrote one, strip it and warn.

8. Export from the engine index via the brand barrel packages/engine/src/brand/index.ts.

9. Do not hand-roll a model call in this module. The live Grok call goes through the 011 adapter and is wired in 061; this module stays the deterministic validator and shaper underneath it, tested with fixtures and recorded cassettes.

## Edge cases

- Answers with status SKIPPED and a non-empty assumed site why are allowed. Brand status stays ASSUMED.
- HTML in an answer is stored as text, not interpreted. The function does not return HTML.
- Empty visitor with a present offer still produces a sentence.

## Acceptance criteria

- [ ] A deferred brand why is ASSUMED and contains no banned word.
- [ ] A real DP-1.7 is preserved.
- [ ] Site why longer than 240 characters is truncated on a word.
- [ ] No network call.

## must_haves

truths:

- The site why cannot be blank at the end of this function.
- Assumed brand copy is labeled.
- Banned hype words are stripped.

artifacts:

- packages/engine/src/brand/why.ts

key_links:

- compileWhy reads AnswerRecord ids DP-2.1, DP-2.6, DP-2.7, and DP-1.7.

prohibitions:

- Do not paste Matt's Why Finder prompt.
- Do not add innovative, elevate, seamless, or cutting-edge.
- Do not call Imagine or Grok.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/045.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(brand): compile the site why and the brand why
```
