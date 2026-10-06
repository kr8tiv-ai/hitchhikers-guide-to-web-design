---
id: "061"
kind: build
phase: babel-fish
slice: Deep Why
title: "Model-authored brand modules with validators"
tier: Forty-Two
effort: xhigh
model: grok-4.7
depends_on: ["011", "045", "046", "047", "049", "050", "051", "058"]
files: ["packages/engine/src/brand/live/why-finder.ts", "packages/engine/src/brand/live/discovery.ts", "packages/engine/src/brand/live/positioning.ts", "packages/engine/src/brand/live/story.ts", "packages/engine/src/brand/live/voice-kit.ts", "packages/engine/src/brand/live/taglines.ts", "packages/engine/src/brand/live/schemas.ts", "packages/engine/src/brand/live/approve.ts", "packages/engine/test/brand-live.test.ts", "packages/engine/test/cassettes/brand/README.md", "packages/app/src/brand/approve-cards.ts"]
requirements: ["HH-BRAND-09"]
review_checkpoint_embedded: false
---

# 061. Model-authored brand modules with validators

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

Make Babel Fish live. Grok runs the Why Finder conversation (Golden Circle, 12 or more questions, one at a time), the discovery deep-dive for gaps, archetype plus positioning plus persona, the brand story at 25, 100, and 300 words, the voice kit, and 30 taglines in 6 styles cut to a top 5 with reasons (Q15). The 045 to 051 functions become validators and shapers (banned words, lintClaims, contrast, word caps). Every item gets its own approve or reject.

## Why this prompt exists

The review found Babel Fish compiled canned strings. Matt's method (Build a Brand From Scratch With AI) is a conversation with a strong model; this prompt runs it on Grok while the existing compilers keep it honest.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- context/sources/build-a-brand-from-scratch-with-ai.plain.txt (Matt's method; his prompts may be used word for word with credit, D-005)
- context/research/08-brand-intake-frameworks.md
- CONTEXT-PACKAGE.md (v1) sections 9.1 to 9.6
- context/matt-answers.md Q12 to Q15
- packages/engine/src/brand/ (045 to 051, 058)
- packages/engine/src/ai/think.ts (017)
- context/matt-answers.md and DECISIONS.md (authority; they override this prompt)

## Files to create or change

- packages/engine/src/brand/live/why-finder.ts
- packages/engine/src/brand/live/discovery.ts
- packages/engine/src/brand/live/positioning.ts
- packages/engine/src/brand/live/story.ts
- packages/engine/src/brand/live/voice-kit.ts
- packages/engine/src/brand/live/taglines.ts
- packages/engine/src/brand/live/schemas.ts
- packages/engine/src/brand/live/approve.ts
- packages/engine/test/brand-live.test.ts
- packages/engine/test/cassettes/brand/README.md
- packages/app/src/brand/approve-cards.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

Each live module calls think() with a schema and then passes the result through the matching deterministic shaper: why-finder.ts runs a Golden Circle dialogue (why, how, what) of at least 12 questions through the desk, then compiles via 045; discovery.ts asks only about fields still ASSUMED or SOFT; positioning.ts drafts archetype (12-archetype set), positioning statement, and one primary persona, shaped by 046 and checked against competitor cards (047); story.ts writes 25, 100, and 300-word versions within ±10% word counts; voice-kit.ts drafts traits, vocabulary, banned words, and microcopy, shaped by 051; taglines.ts asks for exactly 30 taglines across 6 named styles (5 each), then a second call ranks and cuts to 5 with a reason each, validated by 051's rules. Every output passes lintClaims (058): no invented testimonials, awards, metrics, or client names. approve.ts stores per-item status (pending, approved, rejected with note) in .hitchhiker/brand/approvals.json; a rejection with a note triggers a targeted re-draft of that item only. Where Matt's prompt wording is used, add a credit comment naming the AntiHero guide.

## Interfaces and data shapes

```ts
export function runWhyFinder(s: GuideSession, deps: { think: typeof think; ask: (q: string) => Promise<string> }): Promise<{ why: string; how: string; what: string; transcript: string[] }>;
export function draftTaglines(brand: BrandFacts, deps: { think: typeof think }): Promise<{ all: Array<{ style: string; text: string }>; top5: Array<{ text: string; reason: string }> }>;
export function draftStory(brand: BrandFacts, deps: { think: typeof think }): Promise<{ s25: string; s100: string; s300: string }>;
export function setApproval(projectDir: string, itemId: string, status: "approved" | "rejected", note?: string): Promise<void>;
```

## Steps

1. Write schemas.ts for every brand task.

2. Write each live module with its shaper and lintClaims pass.

3. Write approve.ts and the per-item approve cards in the app.

4. Record or hand-write cassettes for the Towel & Tea fixture.

5. Test: the Why Finder asks at least 12 questions one at a time; taglines return 30 across 6 styles and a top 5 with reasons; story lengths are within ±10%; zero lintClaims hits.

6. Test that rejecting one tagline re-drafts only that item.

## Edge cases

- Grok returns 29 taglines: one repair turn, then fail with a clear error.
- A tagline repeats a competitor's slogan from the crawl: validator rejects it.
- The user has no story yet: story.ts asks two origin questions first.

## Acceptance criteria

- [ ] Cassette e2e on Towel & Tea passes.
- [ ] 30 taglines cut to 5 with reasons.
- [ ] Zero lintClaims hits in every output.
- [ ] Every item has its own approve or reject.

## must_haves

truths:

- Babel Fish runs on Grok, not canned strings.
- The deterministic compilers validate everything the model writes.
- Nothing leaves draft without a per-item approval.

artifacts:

- packages/engine/src/brand/live/why-finder.ts
- packages/engine/src/brand/live/taglines.ts
- packages/engine/src/brand/live/approve.ts

key_links:

- Each live module calls the matching 045 to 051 shaper.
- approvals.json is read by 059 and 065.

prohibitions:

- Do not invent testimonials, awards, metrics, or client names.
- Do not skip the per-item approval.
- Do not bypass the shapers' word caps.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
pnpm --filter @hitchhiker/app test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/061.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(brand): run Babel Fish live on Grok with validators and approvals
```
