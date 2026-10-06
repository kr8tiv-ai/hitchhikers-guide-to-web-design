---
id: "019"
kind: build
phase: dont-panic
slice: The Guide
title: "Push back on soft answers and write coverage"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["018"]
files: ["packages/engine/src/pushback.ts", "packages/engine/src/interview.ts", "packages/engine/test/pushback.test.ts"]
requirements: ["HH-INT-05"]
review_checkpoint_embedded: true
---

# 019. Push back on soft answers and write coverage

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

Detect soft answers such as `it's fine` and push back, quoting their words and offering a sharper choice. Hold the line twice (v1 §6). If the third answer is still soft, store status SOFT and continue. Write a coverage report the brief can show. Do not loop forever and do not insult the user.

## Why this prompt exists

A brief full of `whatever` becomes a generic site. One push is the Guide being precise. A second push is nagging. SOFT keeps the honesty visible in Deep Thought.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 6 and 8.2
- packages/engine/src/interview.ts
- interview/tree.yaml

## Files to create or change

- packages/engine/src/pushback.ts
- packages/engine/src/interview.ts
- packages/engine/test/pushback.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

pushbackFor(question, text) returns a string when the trimmed lowercase text matches a pushback_if phrase, or when the text is in a global soft list: it's fine, whatever, you decide, idk, something modern, make it pop. The match is includes, not a regex the user can ReDoS. interview command, on answer, if pushbackFor returns a string and this question has been pushed fewer than two times, does not store yet. It sets a pending flag and the string is returned on the session as lastPushback. The next answer on the same id stores. If the second text still matches, status is SOFT. If it does not, status is ANSWERED. Suggest and Skip clear the pending flag and store immediately. coverageReport(answers) returns markdown with counts and a SOFT list of ids plus values. No exclamation marks. Persona stays in the next prompt. This layer is mechanical.

## Interfaces and data shapes

```ts
export function pushbackFor(question: Question, text: string): string | null;

export function coverageReport(answers: AnswerRecord[]): string;

export interface InterviewSession {
  lastPushback: string | null;
}
```

## Steps

1. Implement pushbackFor with the global list and the question's pushback_if array. Comparison is lowercase includes. Return a calm question that quotes the phrase and asks for one concrete detail. No exclamation mark.

2. Add lastPushback to the session. Persist a pushedIds array inside interview.json so a resume does not push the same id twice. Bump the json to `{ version: 1, answers, cursor, pushedIds }`. Load old arrays as answers if you detect a bare array, so the previous prompt's fixtures still load. Update the previous resume test if it wrote a bare array.

3. First soft answer does not append an AnswerRecord. Second answer does, with SOFT or ANSWERED as specified.

4. Skip on a pending push stores SKIPPED and clears pending.

5. coverageReport lists SOFT ids. The test feeds a SOFT DP-5.3 and expects the id in the markdown.

6. A non-soft answer stores ANSWERED and lastPushback is null.

7. Pushback test uses an in-memory question, not a live model.

8. Cap pushes at two per id. A test answers soft, soft, soft and expects two pushbacks, then one stored record with status SOFT. A fourth push fails the test. pushedIds stores a count per id, not a boolean, so resume keeps the count.

9. Export pushbackFor and coverageReport.

## Edge cases

- Phrase `fine` alone should not match `it's fine` via a too-short needle. Match the list phrases only.
- A 4,000 character answer is stored but pushback only inspects the first 500 characters.
- IMPORTED answers are never pushed. The command type answer is the only path. Import lands later as a direct write. Do not add an import command here.

## Acceptance criteria

- [ ] The first soft answer does not advance the cursor.
- [ ] The second soft answer stores SOFT and advances.
- [ ] coverageReport names SOFT ids.
- [ ] Resume remembers that an id was already pushed.

## must_haves

truths:

- Pushback happens once per question.
- SOFT is a real status, not a deleted answer.
- The matcher cannot be ReDoS'd by the user text.

artifacts:

- packages/engine/src/pushback.ts
- packages/engine/src/interview.ts

key_links:

- Interview command calls pushbackFor before storing an answer.
- coverageReport reads AnswerRecord statuses.

prohibitions:

- Do not add a second push.
- The phrase list here is the floor. Do not hand-roll a model call in this module. The live Grok call goes through the 011 adapter and is wired in 035 (the model judges vagueness, at most two pushes); this module stays the deterministic validator and shaper underneath it, tested with fixtures and recorded cassettes.
- Do not store empty SOFT values.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/019.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(engine): one pushback and a coverage report
```
## REVIEW CHECKPOINT

This build closes a review group. After this commit, the driver runs the fresh-session reviewer prompt `020-review-017-019.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `017` Finish the tree, Guide Entry, and required fields (The Guide, Gargle Blaster, high)
- `018` Run the interview one question at a time (The Guide, Heart of Gold, xhigh)
- `019` Push back on soft answers and write coverage (The Guide, Gargle Blaster, high)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.
