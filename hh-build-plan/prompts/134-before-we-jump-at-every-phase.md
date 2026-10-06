---
id: "134"
kind: build
phase: mostly-harmless
slice: Before We Jump
title: "Before-we-jump at every phase start"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["132", "035", "034"]
files: ["packages/engine/src/phases/before-jump-hook.ts", "packages/engine/src/phases/write-back.ts", "packages/engine/test/before-jump-hook.test.ts", "packages/app/src/before-jump/cards.ts", "packages/app/e2e/before-jump.spec.ts"]
requirements: ["HH-INT-09"]
review_checkpoint_embedded: false
---

# 134. Before-we-jump at every phase start

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

Hook 132 into the start of Babel Fish, Deep Thought, Improbability Drive, Mostly Harmless, and So Long, using the same question-card UI. Answers write back to the right files (Q26). Express-mode ASSUMED defaults are re-asked here.

## Why this prompt exists

Matt asked for a short "anything to add before we jump?" at every phase (Q26). It catches gaps and contradictions while they are still cheap to fix, and it is how Express mode stays honest.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- context/matt-answers.md Q26
- packages/engine/src/spec/before-jump.ts (132)
- packages/engine/src/guide/live-turn.ts (047)
- packages/app/src/card.ts (031)
- context/matt-answers.md and DECISIONS.md (authority; they override this prompt)

## Files to create or change

- packages/engine/src/phases/before-jump-hook.ts
- packages/engine/src/phases/write-back.ts
- packages/engine/test/before-jump-hook.test.ts
- packages/app/src/before-jump/cards.ts
- packages/app/e2e/before-jump.spec.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

before-jump-hook.ts: onPhaseStart(phase, projectDir) builds the 132 question list (0 to 8), shows it as skippable cards through the server (046), and blocks phase start until the user answers, skips, or says "jump". write-back.ts maps each question's target (brief field, BRAND.md section, VOICE.md item, MOTION.md row, STACK-DECISION, DEPLOY settings) to the file and the engine writer that owns it, writes under the state lock, and records an ANSWERED status so the same fact is not re-asked. Zero questions shows a one-line "Nothing open. Jumping." card.

## Interfaces and data shapes

```ts
export function onPhaseStart(phase: "babel-fish" | "deep-thought" | "improbability-drive" | "mostly-harmless" | "so-long", projectDir: string, deps: { ask: (cards: BeforeJumpCard[]) => Promise<BeforeJumpAnswer[]>; think: typeof think }): Promise<{ asked: number; written: string[] }>;
export function writeBack(projectDir: string, answer: BeforeJumpAnswer): Promise<string>;
```

## Steps

1. Write onPhaseStart for all five phases with injected ask.

2. Write writeBack with one test per target file type.

3. Wire the cards into the app.

4. Write a Playwright e2e that starts Deep Thought with two open items and answers them.

5. Test that zero open items shows the single jump card and asks nothing.

## Edge cases

- The user closes the app mid-questions: answers so far are saved; the rest return on resume.
- An answer contradicts an approved section: flag it and ask whether to reopen that approval.
- More than 8 open items: the highest-impact 8 are asked; the rest are listed as ASSUMED.

## Acceptance criteria

- [ ] Each phase start shows 0 to 8 questions built from files.
- [ ] Answers land in the right files under the state lock.
- [ ] Express ASSUMED defaults are re-asked.

## must_haves

truths:

- Every phase starts with a chance to fix gaps.
- Nothing answered is asked twice.
- Answers write back to their owning files.

artifacts:

- packages/engine/src/phases/before-jump-hook.ts
- packages/engine/src/phases/write-back.ts

key_links:

- onPhaseStart uses 132's generator.
- Cards reuse the 031 card component through 046.

prohibitions:

- Do not pad with filler questions.
- Do not ask for testimonials.
- Do not overwrite an approved section without asking.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
pnpm --filter @hitchhiker/app exec playwright test e2e/before-jump.spec.ts
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/134.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(phases): before-we-jump questions at every phase start
```
