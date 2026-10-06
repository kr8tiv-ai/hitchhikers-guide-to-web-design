---
id: "031"
kind: build
phase: dont-panic
slice: Don't Panic Desk
title: "Render one question card with Answer, Suggest, and Skip"
tier: Heart of Gold
effort: xhigh
model: grok-4.7
depends_on: ["018", "030", "010"]
files: ["packages/app/src/card.ts", "packages/app/src/card.css", "packages/app/test/card.test.ts"]
requirements: ["HH-APP-02"]
review_checkpoint_embedded: true
---

# 031. Render one question card with Answer, Suggest, and Skip

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

Render the current question as a card with the ask, the why, a text field, and three actions: Answer, Suggest for me, and Skip. Wire it to InterviewSession through an injected session so the test does not touch the filesystem. One card, never a list of upcoming questions.

## Why this prompt exists

The engine can already ask. The user needs to see one question and the three legal moves, with the same words the persona uses.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 6 and 8.2
- packages/engine/src/interview.ts
- packages/app/src/shell.ts

## Files to create or change

- packages/app/src/card.ts
- packages/app/src/card.css
- packages/app/test/card.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

renderCard(question, pushback) returns HTML. The ask is in an h2. The why is a paragraph. If pushback is non-null, it appears in `data-pushback` and the text field stays empty. Buttons have type=button and data-action answer|suggest|skip. The answer button is disabled in the HTML until the field has text. Do that with a function bindCard(root, session) that expects a minimal DOM. In tests, use a tiny fake if no DOM library exists: test the HTML string for attributes, and unit-test a pure reducer `reduceCard(state, event)` that the DOM binder also calls. Events: type, suggest, skip, submit. type updates draft. submit with empty draft returns an error `Write an answer or skip.` and does not call session.command. submit with text calls command answer. suggest and skip call the matching command. State includes the question id. A successful command replaces state.question with session.next(). If next() is null, state.done is true and the card copy is `Guide Entry is next.` without claiming the brief is approved. No exclamation marks. Labels are exactly `Answer`, `Suggest for me`, and `Skip`.

## Interfaces and data shapes

```ts
export interface CardState {
  question: Question | null;
  draft: string;
  pushback: string | null;
  error: string | null;
  done: boolean;
}

export type CardEvent =
  | { type: "type"; text: string }
  | { type: "submit" }
  | { type: "suggest" }
  | { type: "skip" };

export function reduceCard(state: CardState, event: CardEvent, session: Pick<InterviewSession, "command" | "next">): Promise<CardState>;

export function renderCard(state: CardState): string;
```

## Steps

1. Implement renderCard. Include the question id in a data-question-id attribute. Escape text with a function escapeHtml that replaces &, <, and >. Test it with an ask that contains `<script>`.

2. Implement reduceCard as specified. Session methods are async in the engine. Await them.

3. Empty submit sets error and does not call command. The test uses a session whose command throws if called.

4. Suggest calls command and then next(). Pushback from the session is read if you add getPushback to the pick type: include `lastPushback` by widening the pick to `{ command, next, lastPushback }` matching the engine session.

5. The card CSS makes the three buttons at least 44px tall, stacked on narrow widths via a simple block layout. Do not use a purple focus ring. Focus outline is 2px solid var(--rule).

6. card.test.ts covers escape, empty submit, skip, and done. It does not open a browser.

7. Do not render the coverage report on the card. Status stays in the shell.

8. Do not prefetch the next ask into the HTML.

9. Export renderCard and reduceCard from the app index.

## Edge cases

- A question why that contains HTML is escaped.
- Double submit: if you cannot lock, ignore a submit while a promise is in flight using state.pending. Add pending to CardState. A second submit while pending returns the same state.
- Done state renders no buttons.

## Acceptance criteria

- [ ] The three action labels are exact.
- [ ] Empty answers do not reach the session.
- [ ] Script in the ask is escaped.
- [ ] Upcoming questions are not in the HTML.

## must_haves

truths:

- The card talks to the interview session instead of inventing a second state machine for answers.
- One question is visible.
- User text cannot break out of the card as HTML.

artifacts:

- packages/app/src/card.ts
- packages/app/src/card.css

key_links:

- reduceCard calls InterviewSession.command with answer, suggest, or skip.
- renderCard mounts conceptually inside data-region=question.

prohibitions:

- Do not list the rest of the tree in the card.
- Do not add a magnetic pointer.
- The card never calls a model itself. Suggest goes through the server endpoint (034) to the live Guide (035).

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/app test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/031.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(app): add the question card
```
## REVIEW CHECKPOINT

This build closes a review group. After this commit, the driver runs the fresh-session reviewer prompt `032-review-029-031.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `029` Ship a curated gallery pack and a polite refresh hook (Vogon Neighbors, Gargle Blaster, high)
- `030` Build the local chat shell without a default theme (Don't Panic Desk, Gargle Blaster, high)
- `031` Render one question card with Answer, Suggest, and Skip (Don't Panic Desk, Heart of Gold, xhigh)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.
