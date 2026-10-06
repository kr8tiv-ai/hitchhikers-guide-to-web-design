---
id: "043"
kind: build
phase: dont-panic
slice: Don't Panic Desk
title: "Prove the interview saves and resumes end to end"
tier: Heart of Gold
effort: xhigh
model: grok-4.7
depends_on: ["018", "019", "031", "033", "035"]
files: ["packages/engine/test/interview-e2e.test.ts", "packages/app/test/desk-e2e.test.ts"]
requirements: ["HH-INT-06"]
review_checkpoint_embedded: true
---

# 043. Prove the interview saves and resumes end to end

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

Add one integration test that opens an Express interview in a temp project, answers the required fields, skips the rest, kills the session object, opens a new one, and finds the cursor where it left off. A second test renders the card and the map from that saved state. This is the phase's walking skeleton. Do not start Babel Fish.

## Why this prompt exists

Unit tests can pass while the lock, the tree, and the card disagree. The phase gate needs one path a reviewer can run.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 8.4 and 10.1
- hh-build-plan/ROADMAP.md success criteria for Don't Panic
- packages/engine/src/interview.ts
- packages/app/src/card.ts
- packages/app/src/map.ts

## Files to create or change

- packages/engine/test/interview-e2e.test.ts
- packages/app/test/desk-e2e.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

Use the real tree file and the real openInterview. Express depth. Drive commands until the five required ids other than motion have values, and skip motion so the assumed level is stored. You may skip every non-required question. Then dispose the session by dropping the reference, call openInterview again, and continue to done. Assert interview.json statuses and that missingRequired returns []. Assert STATE.md prompt id ends at interview:done. renderMap on the loaded state shows Don't Panic as current if that is the phase you saved. The desk test builds a CardState from the first express question and checks the three buttons, then applies a skip event through reduceCard against the real session on a temp dir. Clean up temp dirs in finally. No network, no grok binary, no browser. This prompt may only add tests and a tiny export if one is missing. If a truth is already false because an earlier prompt drifted, fix it inside the files those prompts owned and name the fix in the summary. Prefer a test-only fix.

## Interfaces and data shapes

```ts
export function requiredIds(): readonly string[];
```

## Steps

1. Add requiredIds() in required.ts if it is not exported, returning DP-2.1, DP-2.6, DP-2.2, DP-5.3, DP-6.2, DP-9.2. This is the one production change allowed. Update the engine index.

2. Write interview-e2e.test.ts that walks Express to completion using skip except for the required ids, which get one-sentence answers: a tea shop site, a visitor who wants a tin, the action buy, vibe earthy, anti-vibe neon, hosting no idea. Motion is skipped.

3. Re-open halfway by answering three questions, constructing a second session, and asserting the id.

4. Assert no answer value is an empty string.

5. desk-e2e renders the map HTML and asserts data-current on Don't Panic, and renders the card for the resumed question id.

6. Assert the home index was not required for this test. Do not write into os.homedir(). Use a temp project only.

7. Confirm `.planning` is never created. The test asserts that path does not exist under the temp project.

8. Leave a comment at the top of the e2e file listing the Don't Panic success criteria it covers: lock, resume, tree ids, card regions.

9. Run engine and app tests. Do not add a new package.

## Edge cases

- If Express does not include a required id, the test fails with the id name. Fix the tree depth tags so required ids are in all depths. That edit is allowed in interview/tree.yaml.
- SOFT is not required for this happy path.
- Temp directories must be removed even on failure.

## Acceptance criteria

- [ ] A second session resumes mid-interview.
- [ ] A finished express run has no missing required fields.
- [ ] The card and the map render from saved state.
- [ ] No `.planning` directory is created.

## must_haves

truths:

- Save and resume work on the real tree, not a one-question stub.
- Required fields are non-empty at the end of the fixture.
- The desk can show the phase and the question without a live model.

artifacts:

- packages/engine/test/interview-e2e.test.ts
- packages/app/test/desk-e2e.test.ts

key_links:

- The e2e test calls openInterview, missingRequired, loadState, renderCard, and renderMap.
- requiredIds matches v2 section 8.4.

prohibitions:

- Do not call Grok or Imagine.
- Do not begin Babel Fish modules.
- Do not weaken missingRequired to make the test pass.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
pnpm --filter @hitchhiker/app test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/043.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
test: prove interview save and resume end to end
```

## REVIEW CHECKPOINT

This build closes a review group and the Don't Panic phase. After this commit, the driver runs the fresh-session reviewer prompt `044-review-041-043.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `041` Wire push-to-talk to the local transcriber (Don't Panic Desk, Heart of Gold, high)
- `042` Scaffold read-only X OAuth without posting (Don't Panic Desk, Gargle Blaster, high)
- `043` Prove the interview saves and resumes end to end (Don't Panic Desk, Heart of Gold, xhigh)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.
