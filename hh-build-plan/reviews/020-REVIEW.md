# 020 Review — prompts 017, 018, 019

Verdict: **PASS**

Reviewed: 2026-10-06. Fresh session. No fix commits. No source changes in this review.

HEAD reviewed: `4b3ab63` (`feat(engine): one pushback and a coverage report`).

This verdict is the nine must-have truths below, each with a test name or a file line, plus the verification command. It is not a general impression of the tree. Where a must_have sentence contradicts D-004, the locked decision is the truth that was checked. That conflict is written under Authority.

## History

Three build commits, in order, on top of `5d714f8`. Messages match the prompt commit lines. They are not squashed. History was not rewritten.

| Order | Commit | Message | Prompt commit line |
| --- | --- | --- | --- |
| 1 | `043c14b` | `feat(interview): finish the tree and required-field check` | same |
| 2 | `933d8f0` | `feat(engine): interview one question at a time with resume` | same |
| 3 | `4b3ab63` | `feat(engine): one pushback and a coverage report` | same |

## 017 Finish the tree, Guide Entry, and required fields

### Truths

- Every DP id in v2 section 8.3 is in one tree file. `EXPECTED_IDS` in `packages/engine/test/tree-rest.test.ts` is the v2 list from `DP-0.1` through `DP-9.5`, including `DP-0.2a`, and excluding `DP-GE`, `DP-1.7b`, and `DP-3.2a`. Test `the tree lists every v2 id from DP-0.1 through DP-9.5 once, including DP-0.2a` loads `interview/tree.yaml` and requires that array, in that order, once. The same test requires modules `pan-galactic` (`DP-6.1`–`DP-6.6`), `bistromathics` (`DP-7.1`–`DP-7.3`), `content` (`DP-8.1`–`DP-8.4`), and `limits` (`DP-9.1`–`DP-9.5`). `interview/` still contains only `tree.yaml`. The header now says modules 0 through 9 live in this file.
- Required fields cannot be empty strings. `missingRequired` in `packages/engine/src/required.ts` gates `DP-2.1`, `DP-2.6`, `DP-2.2`, `DP-5.3`, `DP-6.2`, and `DP-9.2`. `isPresent` counts `ANSWERED`, `SUGGESTED`, `IMPORTED`, `SKIPPED`, and `SOFT` only when `value.trim()` is non-empty. A missing id counts. The last record wins. `DP-7.2` is not in the list. Tests: `empty values never count, and SOFT with text does` (six empty `ANSWERED` values are all missing; an empty `IMPORTED` stays missing; a non-empty `SOFT` does not), `a skip of DP-6.2 with a blank is missing` (the value is `" "`), `a skip of DP-6.2 with the assumed sentence is not missing`, `a missing id is required, and DP-7.2 is not`.
- Appetite is stored as a weight ceiling, not as a library ban. `DP-6.2` in `interview/tree.yaml` has depth `[express, standard, deep]`, skip default `3. ASSUMED. Polished, not a spectacle.`, an ask that says 1 to 10, and the why sentence `The number caps weight and does not remove libraries from the Guide.` Test `DP-6.2 stores appetite as a weight ceiling in every depth` requires that sentence, rejects `11` as the skip default, and requires all three depths. Nothing in `required.ts` or the tree drops GSAP, Theatre, or any other library when the number is stored.

### Also checked

- Test `DP-6.1 names the eight tools and says magnetic buttons are banned` requires the suggest string to contain `CSS`, `GSAP`, `Three`, `OGL`, `Theatre`, `Motion`, `anime.js`, and `vanilla`, plus the sentence `Magnetic buttons are banned.` The why says they are banned, not offered. The same test rejects a MIT-fallback or a "instead of GSAP / Theatre" line. The ask names the families in plain words (weighted scroll, reveals, line-by-line headlines, a held page, sideways scroll, parallax, a scrubbed film, a 3D camera, page melts, menus, pointer reactions, drawn lines, shader grain, particles, a product or a world, physics, ambient video, sound that stays off). The why says those families cover research ids A1 through H3.
- Test `DP-6.3 names the film costs and DP-6.4 names every 3D source` requires build length, weight, phone fallback, and a crawlable text layer, and requires none, pre-rendered, CC0, Tripo, Meshy, upload, and human on `DP-6.4`.
- Test `DP-6.5 defaults to calm and DP-6.6 always implements reduced motion` requires skip default `Calm.` and the sentence `Reduced motion is always implemented`.
- Test `DP-7.1 points at the cost meter and does not invent a price table` requires skip default `$0 DIY. Prompts only.`, the cost-meter sentence, and no `$` amount from 1 up in the ask, why, or suggest. Test `DP-7.2 is absent from express and is not a required stand-in` requires depth `[standard, deep]` only.
- Test `DP-9.2 recommends Hostinger, names the other hosts, and skips to no idea` requires skip default `no idea`, Hostinger as the recommended word, Vercel, Netlify, and Cloudflare, and a why that says it is not a forced value.
- `renderBrief` is the Guide Entry. It is not a question id. Test `renderBrief writes the six headings, prefixes SOFT, and counts coverage` requires `# Site Brief`, then `Goal`, `Visitor`, `Action`, `Vibe`, `Motion`, `Hosting`, the prefix `SOFT:`, and one Coverage line. Test `renderBrief contains ASSUMED when the motion answer is SKIPPED` requires the assumed motion sentence under `## Motion`. The brief test rejects a book quote (`Don't Panic`, `Answer is 42`, `Hitchhiker`) and an exclamation mark.
- `missingRequired` and `renderBrief` are exported from `packages/engine/src/index.ts`. Prompt step 9 required that export. The commit names the file.

## 018 Run the interview one question at a time

### Truths

- Only one current question is offered by the session. `next()` in `packages/engine/src/interview.ts` returns `this.#questions[this.#cursor]` or `null`. The session object exposes `next`, `command`, `coverage`, and `lastPushback`. Test `open offers one question and does not write answers yet` requires `next().id` to be `DP-0.1`, requires `next()` not to be an array, requires those four keys and no `questions` property, and requires no `interview.json` until a command. There is no method that returns the remaining asks.
- Answers and `STATE.md` update under the same lock. `persistPair` takes one `withStateLock`, writes both temp files, renames `interview.json`, then renames `STATE.md`. Test `a live lock blocks the command and writes no answer` holds `state.lock` with this process and requires `LockHeld`, no `interview.json`, an unchanged cursor, and a skipped count of 0. Test `the interview module saves under the lock and does not call the network` reads `interview.ts` and requires `withStateLock`, both temp writes, and the answers rename before the state rename. `saveState` is not called inside the lock, so the write cannot deadlock on `state.lock`. `loadState` after a command still parses the heading document, including a preserved phase, slice, blocker, and commit (`command keeps phase, slice, blockers, and commit, and stamps the clock`).
- Suggest is local text in this prompt. `recordFor` stores `question.suggest` or `No suggestion is written for this question yet.` with status `SUGGESTED`. Test `suggest stores the question text or the fallback` plants a tree whose `DP-0.7` suggest mentions Standard, and a question with no suggest, and requires both stored strings. The real-tree skip walk also suggests `DP-0.7` and requires `Standard`. The source test requires `interview.ts` to contain no `fetch(`, no `node:http`, and no `node:https`. There is no `think(` call.

### Also checked

- Test `resume continues at the third question` answers two questions, opens a new session on the same directory, and requires `next().id` to be the third deep question, `interview:<that id>` in `STATE.md`, and `interview.json` version 1 with `cursor` 2 and an empty `pushedIds`.
- Test `an empty answer throws and does not skip` requires `InterviewError` code `empty-answer` for `""` and for `"   "`, no file, and a skipped count of 0.
- Test `skip stores the DP-6.2 default and express never offers DP-0.5` walks express, requires the stored motion value to equal the tree skip default, requires `missingRequired` to be empty once the other required ids are answered, never offers `DP-0.5` or `DP-7.2`, and ends at `interview:done`. A further command throws `finished` and does not append.
- Test `corrupt interview.json throws and the file stays` writes `{` and requires `corrupt-answers` with the bytes unchanged.
- Test `express does not resume on an id outside the depth` sets `interview:DP-0.5` and requires express to start at `DP-0.1`, then, after the ids before `DP-0.5` are filled, to continue at the next express id. Test `standard resumes on DP-0.5 when that id is still unanswered` requires that id. Test `a stored id is not asked again when STATE still names it` covers the crash window where answers were renamed and state still names a filled id.
- Test `a second command on a finished session does not append` requires no `.planning/` directory and no leftover temp or lock file. Test `overlapping command calls are rejected` requires `busy` and a single stored answer. The file header says the session is single-flight.
- `openInterview` is exported from the engine barrel. Prompt step 9 required that export.

## 019 Push back on soft answers and write coverage

### Truths

- Pushback holds on one question, twice, then stores. D-004, v1 §6, v2 §6, the 019 goal, and step 8 say the Guide holds the line twice and marks the third soft answer `SOFT`. `PUSH_LIMIT` in `interview.ts` is `2`. A soft answer while the count is under 2 sets `lastPushback`, appends nothing, and leaves the cursor on that id. The next soft answer stores one `SOFT` record and advances. Test `two soft answers push back and the third stores SOFT` sends `It's fine` three times, requires two messages and one stored record with status `SOFT` and a non-empty value, then requires `pushedIds` `[{ id: "DP-5.3", count: 2 }]`. A fourth answer on the finished session throws `finished` and does not add a second `SOFT` row. The literal must_have sentence "once" and the prohibition "Do not add a second push" contradict that locked decision. The code follows D-004. See Authority. It was not "fixed" down to one push.
- `SOFT` is a real status, not a deleted answer. The third soft answer is appended as `{ status: "SOFT", value }` and counted by `coverage().soft`. Test `coverageReport names SOFT ids and counts statuses` feeds a `SOFT` `DP-5.3` with value `it's fine` and requires that id and that value in the markdown, plus the five counts. `renderBrief` prefixes the same status with `SOFT:`. An empty or whitespace answer throws `empty-answer` before any store (test `an empty answer is not stored as SOFT`). Suggest and Skip during a hold store immediately and clear `lastPushback` (test `skip and suggest during a hold store immediately`). A concrete answer after a hold stores `ANSWERED` (test `a concrete answer stores ANSWERED and clears lastPushback`).
- The matcher cannot be ReDoS'd by the user text. `matchedSlice` in `packages/engine/src/pushback.ts` uses `String.indexOf` on the lowercased first 500 characters. It does not build a `RegExp` from the user text. Test `pushbackFor only inspects the first 500 characters and does not use a regexp` requires a phrase past character 500 to miss, a phrase inside the first 500 of a 4,000-character answer to hit, an 80-group catastrophic-looking string to return in under 200ms, and the source to contain no `RegExp`, no `.match(`, no `think(`, and no `fetch(`. Test `pushbackFor quotes the phrase and ignores a shorter word` requires `fine` alone, `pop` alone, and `I don't know` to miss, and requires `it's fine`, `make it pop`, `idk`, `whatever`, `you decide`, and `something modern` to hit. A question `pushback_if` of `clean` matches `Clean and airy` and does not match a concrete sentence. The returned line quotes their words, asks for one concrete detail, and has no exclamation mark.

### Also checked

- Test `resume keeps the push count for an id` pushes once, opens a new session, pushes again, opens a third session, and requires the third answer to store `SOFT`. `lastPushback` is null on the fresh process until the next answer. The count is what resume keeps. Test `the interview calls pushbackFor before it stores an answer` requires the `pushbackFor(` call to appear before the append. Test `a long answer is stored whole and a late soft phrase is not a push` requires the stored `SOFT` value to keep all 4,000-plus characters.
- Test `a bare answer array still loads and an IMPORTED id is not pushed` writes a pre-019 array, skips the filled `IMPORTED` id, and leaves that record's status untouched. There is no import command. `interview.json` version 1 is `{ version, answers, cursor, pushedIds }` with a count per id, not a boolean.
- `pushbackFor` and `coverageReport` are exported from the engine barrel. Prompt step 9 required that export. `packages/engine/test/interview.test.ts` was updated so the resume fixture reads the versioned file. Step 2 of 019 says to update that test when it wrote a bare array. That edit is in scope. It is not a new feature.
- `command` resolves to `null` while an answer is held, and to an `AnswerRecord` when it stores. The 018 interface block says `Promise<AnswerRecord>`. 019 says the held answer is not stored and the string lives on `lastPushback`. The tests assert `null` for a hold. The commit records that assumption.

## File list

`git diff --name-only 5d714f8..HEAD`:

- `interview/tree.yaml`
- `packages/engine/src/required.ts`
- `packages/engine/test/tree-rest.test.ts`
- `packages/engine/test/required.test.ts`
- `packages/engine/src/interview.ts`
- `packages/engine/test/interview.test.ts`
- `packages/engine/src/pushback.ts`
- `packages/engine/test/pushback.test.ts`
- `packages/engine/src/index.ts` (the barrel exports required by 017 step 9, 018 step 9, and 019 step 9)

No extra feature. Nothing to revert. No client site, no new remote, no `@theatre/studio`, no second tree file, no price table in the yaml, no model call in the interview or pushback modules.

## UI

No file under `packages/app/` changed in `5d714f8..HEAD`. This group has no screen to open. There is no 375 or 1440 capture for these prompts, and no visual pass is claimed.

A scan of `interview/tree.yaml` finds no exclamation mark, no em dash, and none of the Guide voice bans (`elevate`, `seamless`, `unlock`, `delve`, `lorem`). The pushback line and `coverageReport` are checked for an exclamation mark by the tests named above. `renderBrief` is checked the same way.

## Live Grok

017, 018, and 019 do not call a model. 018 and 019 both say the live call goes through the 011 adapter and is wired in 035. Suggest stores the question's suggest string, or `No suggestion is written for this question yet.` Pushback is `indexOf` against a fixed phrase list. D-003's live interview belongs to that later prompt. Nothing here left a scripted answer in place of a call these prompts asked to make. The engine suite still skips `live smoke returns a two-field object` unless `HH_LIVE=1`, which is the 011 rule. This run skipped it.

## Authority

D-004 says the Guide pushes back twice on a vague answer, then records the assumption. v1 §6 and v2 §6 say the same thing, and they mark the answer `SOFT`. Prompt 019's goal and step 8 require two pushbacks and a stored `SOFT` on the third soft answer. The same prompt's must_have says "Pushback happens once per question," the prohibition says "Do not add a second push," step 3 says the second answer stores, and one acceptance line says the second soft answer stores `SOFT`. Those four lines disagree with D-004. `DECISIONS.md` overrides the prompt. The implementation and the test `two soft answers push back and the third stores SOFT` follow D-004. This review does not reduce the cap to one.

v1 and v2 print an Imagine price table on `DP-7.1`. Prompt 017 forbids a price inside the yaml and sets the skip default to `$0 DIY. Prompts only.` The why points at the cost meter and says not to promise 1080p inside a small cap. That follows the prompt. The dollar examples stay in the context package for the later cost meter.

v1's Guide Entry lists offer, references, what exists, what is protected, and limits, then a "what did I get wrong?" loop. Prompt 017 step 6 and the `renderBrief` contract name six headings: Goal, Visitor, Action, Vibe, Motion, Hosting, plus a Coverage line, and no book quote. The function follows step 6. The longer brief and the approval loop are later prompts (035 names the brief loop). v1's `DP-9.5` aside, "The Answer is 42," is not in the question. The brief test rejects that line. v2 says wording may be rewritten, and step 6 bars a book quote from the brief.

D-001 includes Lenis in the toolkit. Prompt 017's closed suggest list is the eight names above and does not include Lenis. The question names those eight. It does not delete Lenis from the product. The picker is a later prompt.

v2 says Express writes an ASSUMED default for every id the user does not see. Prompt 017 says `DP-7.2` is absent from express and is not required. Prompt 018 says express never returns `DP-0.5` and must not resume on an id outside the depth. The session does not invent `SKIPPED` rows for ids the depth filter removed. The 018 commit records that assumption. `DP-0.7`'s why, from prompt 014, still says Express writes those defaults. Materializing them was not a step in 017, 018, or 019.

## Notes for later prompts

These are not failed truths.

- `command` returns `null` while a push is held. Callers in 034 and 035 have to treat that as "still on this id," and read `lastPushback`.
- `interview.json` stores `cursor`, and the loader rejects a bad cursor, but placement uses `STATE.md` `promptId` and then the first unanswered id. That matches 018. The numeric cursor is a record of the last save, not a second resume source.
- `lastPushback` is memory on the live session. A new process restores the count, not the previous sentence.
- `renderState` in `interview.ts` duplicates `state.ts` so the interview can write `STATE.md` inside the lock it already holds. The round-trip tests load that file through `loadState`.
- Express does not pre-write ASSUMED rows for hidden ids. See Authority.
- The engine live-smoke test stays skipped unless `HH_LIVE=1`.

## Verification

Run from the repo root on 2026-10-06.

| Command | Result |
| --- | --- |
| `Test-Path hh-build-plan/reviews/020-REVIEW.md` | True after this file is written. |
| `pnpm --filter @hitchhiker/engine test` | 141 passed, 0 failed, 1 skipped (`live smoke returns a two-field object`). Exit 0. |

Node printed `NO_COLOR` / `FORCE_COLOR` warnings. They did not fail the run.

The engine count is the previous suite plus the 017, 018, and 019 tests. Earlier cassette, config, lock, state, template, boundary, workspace, and module 0–5 tests still pass. No test was weakened.

## Scope

No new feature. No fix commit. Prompt 021 was not started. Nothing was pushed, deployed, or published.
