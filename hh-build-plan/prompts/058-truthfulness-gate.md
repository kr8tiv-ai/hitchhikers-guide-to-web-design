---
id: "058"
kind: build
phase: babel-fish
slice: Hyperspace Bypass
title: "Block invented testimonials, awards, and metrics"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["046", "047"]
files: ["packages/engine/src/brand/truth.ts", "packages/engine/test/truth.test.ts"]
requirements: ["HH-BRAND-07"]
review_checkpoint_embedded: false
---

# 058. Block invented testimonials, awards, and metrics

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

Scan brand markdown for claims that were not in the answer file: star ratings, customer names used as quotes, award names, and percent improvements. A hit is a blocker with the line number. The story pack you already generate must pass.

## Why this prompt exists

The fastest way to ruin a local business is a fake review. The gate has to run before BRAND.md is written, not after the site is up.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 8.3 module 8 and 14
- packages/engine/src/brand/story.ts

## Files to create or change

- packages/engine/src/brand/truth.ts
- packages/engine/test/truth.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

lintClaims(markdown, evidence) returns `{ ok, hits }`. evidence is `{ quotes: string[], awards: string[], numbers: string[] }` taken from IMPORTED or ANSWERED values only. A pattern `\b\d(\.\d)? stars?\b` hits unless that exact phrase is in evidence.quotes. A pattern `\b\d+%\b` hits unless the digits are in evidence.numbers. Award words `award-winning` hit unless evidence.awards is non-empty. Do not try to be a general fact checker. These patterns only. The test builds a story via buildStory from clean answers and expects ok true. A second markdown `Loved by 5 stars` without evidence expects ok false.

## Interfaces and data shapes

```ts
export interface Evidence {
  quotes: string[];
  awards: string[];
  numbers: string[];
}

export function lintClaims(markdown: string, evidence: Evidence): { ok: boolean; hits: { line: number; pattern: string }[] };
export function evidenceFromAnswers(answers: AnswerRecord[]): Evidence;
```

## Steps

1. Implement the three patterns. Record the pattern name in the hit.

2. evidenceFromAnswers collects values whose status is ANSWERED or IMPORTED. SKIPPED and SOFT do not become evidence. A skipped `5 stars` must not license the phrase.

3. Test that SOFT does not count.

4. Test line numbers are 1-based.

5. Run lintClaims on buildStory output for the tea fixture and expect ok.

6. Do not auto-rewrite the markdown in this function. The caller decides. Return hits only.

7. No network.

8. Export both functions.

9. Ban the word testimonial as a generated heading in a small extra check: a line `## Testimonials` hits unless evidence.quotes.length > 0.

## Edge cases

- Percent in a CSS note is still a hit. Callers should not pass CSS to this linter. Document that.
- Empty markdown is ok.
- Case insensitive award-winning.

## Acceptance criteria

- [ ] Fake star ratings fail.
- [ ] SOFT answers do not count as evidence.
- [ ] A clean story pack passes.

## must_haves

truths:

- Invented social proof is a blocker at the brand layer.
- Only answered or imported text can support a number.

artifacts:

- packages/engine/src/brand/truth.ts

key_links:

- lintClaims is meant to run on story and voice markdown before they are saved.

prohibitions:

- Do not silently delete the offending line inside the linter.
- Do not treat SOFT as proof.
- Do not add a network fact-check.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/058.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(brand): block invented proof in brand copy
```
