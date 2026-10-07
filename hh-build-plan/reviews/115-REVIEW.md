# 115 Review — prompts 112, 113, 114

Verdict: **PASS**

Reviewed: 2026-10-07. Fresh session. No fix commit. No new feature. Prompt 116 is not started.

Every must-have truth for 112, 113, and 114 has a test name and a file line. `pnpm --filter @hitchhiker/qa test` exited 0: 83 pass, 0 fail. `pnpm --filter @hitchhiker/orchestrator test` exited 0: 211 pass, 0 fail. `pnpm exec tsc -p packages/qa --noEmit` and `pnpm exec tsc -p packages/orchestrator --noEmit` exited 0. None of these prompts call a model.

## History

Three build commits, in order, on top of `faa8499` (the 111 review). Messages match the prompt commit lines. They are separate commits. Each has one parent. History was not rewritten. This session does not push.

| Order | Commit | Parent | Message | Prompt commit line |
| --- | --- | --- | --- | --- |
| 1 | `21d7599` | `faa8499` | `feat(qa): lint slop with an Elevate exception` | same, prompt 112 |
| 2 | `af6ac05` | `21d7599` | `feat(qa): decide PASS, FIX, or ESCALATE` | same, prompt 113 |
| 3 | `9253885` | `af6ac05` | `feat(orchestrator): persist the drive queue` | same, prompt 114 |

HEAD at review start was `9253885`. The working tree was clean. No commit sits between these three.

File lists match the prompts. Nothing else is in the diffs.

- 112: `packages/qa/src/antislop.ts`, `packages/qa/test/antislop.test.ts`.
- 113: `packages/qa/src/verdict.ts`, `packages/qa/test/verdict.test.ts`.
- 114: `packages/orchestrator/src/queue-file.ts`, `packages/orchestrator/test/queue-file.test.ts`, `packages/orchestrator/src/schedule.ts`, `packages/orchestrator/test/schedule.test.ts`.

`packages/qa/src/index.ts` and `packages/orchestrator/src/index.ts` still export only `PACKAGE_NAME`. The prompts say to export the functions from their modules. The file lists do not include the barrels. Tests import the modules by relative path. No file under `packages/app/` changed.

## 112 Lint generated copy for slop and allow Elevate only as a product name

### Truths

- The linter encodes the rulebook. `lintSlop` runs the `CHECKERS` list (`packages/qa/src/antislop.ts` lines 296–311 and 327). Words and phrases come from `BANNED_WORDS` and `BANNED_PHRASES` in `@hitchhiker/engine`, which are the fences in `packages/knowledge/packs/anti-slop/SKILL.md`. `elevate` is removed from the hype list so the context rule owns that word (line 43). Test `hype words and phrases match the voice list` (`packages/qa/test/antislop.test.ts` line 121) requires a `word:<word>` hit for every banned word except `elevate`, and a `phrase:<phrase>` hit for every banned phrase, including a curly apostrophe in `in today's fast-paced world`. Test `lorem fails in both modes` (line 19). Test `an exclamation mark fails` (line 26). Test `an em dash fails and a hyphen does not` (line 100) covers the em dash character, `&mdash;`, a hyphen, an en dash, and `well-known`. Test `a purple gradient in the banned palette fails` (line 71) requires `linear-gradient(#4f46e5, #7c3aed)` in both modes, and a gradient split across lines reports line 2. Test `indigo utilities, gray-50, and the centered container fail` (line 141) requires `bg-indigo-600`, `hover:text-indigo-400`, `bg-gray-50`, and `max-w-7xl mx-auto text-center`, and requires `bg-gray-500` to stay clean. Test `magnetic and pointer in one file fail, either word alone does not` (line 154). Test `guide mode does not flag the anti-slop pack discussion` (line 166) reads the real pack file. Guide mode returns no hits. Site mode still reports `lorem`, `elevate`, and `magnetic`. Test `naming the pack does not grant an exemption` (line 175) still reports `lorem`.

- Elevate is context-sensitive. Site mode flags the whole word. Guide mode skips that hit on a line that contains `/hh-elevate` or `The Hitchhiker's Guide`, straight or typographic apostrophe (`antislop.ts` lines 37–39 and 83–90, applied in `checkElevate` lines 115–120). Other lines still flag it. `elevation` and `elevated` stay clean because the pattern is `\belevate\b`. Test `guide mode allows the command and the product title` (antislop.test.ts line 31) requires an empty list for `/hh-elevate` and for both apostrophes in the Guide title. Test `other guide lines still flag elevate` (line 40) requires a hit on `Please elevate your brand.` and on `We will Elevate the type on Tuesday.` Test `site mode flags elevate your brand and the command line` (line 49) requires hits for the verb, the command, the Guide title line, and `ELEVATE`. Test `a guide exemption does not hide lorem` (line 62) requires `lorem` on an exempt line and on the next line. Test `elevation, elevated, and a longer word do not match elevate` (line 113).

### Key link

The static fences in the pack are the checker list. The pack's word fence matches `BANNED_WORDS` (`packages/engine/src/brand/voice.ts` lines 39–56). The phrase fence matches `BANNED_PHRASES` (lines 58–62). The three CTA lines in the pack's pattern fence are `EXTRA_PHRASES` (`antislop.ts` line 45): `learn more`, `get started`, `build the future of`.

### Also checked

- Empty text returns no hits (test line 14). A normal sentence returns no hits (test line 89). Line numbers are 1-based (test line 94). An unknown mode throws (test line 181).
- A warm gradient and `linear-gradient(#2563eb, #ffffff)` stay clean (test line 84). The hue window is 230 to 295 degrees, saturation above 0.18, mid lightness (`antislop.ts` lines 198–212).
- This session also called `lintSlop` outside the suite. `TODO: the kiln photo` is `todo`. `TODO ASSETS` and `TODO STATE` are clean. Lowercase `todo:` is clean. A heading with an emoji is `emoji-heading`. The same emoji in a sentence is clean. `Learn More`, `Get Started`, and `Build the future of tea.` hit the extra phrases. `from-violet-500 to-purple-600` is `purple-gradient`. The words `rainbow gradient` are `rainbow-gradient`. A CRLF break before `Lorem` reports line 2. `rounded-xl` alone is clean. Those calls are not committed tests. The checkers are `checkUntrackedTodo` (line 149), `checkEmojiInHeadings` (line 158), `checkPhrases` (line 139), `checkPurpleGradient` (line 268), and `checkRainbowGradient` (line 280).
- No `any`. The module does not read the pack itself, spawn a process, or call a model. The pack test is the one that opens the file.

## 113 Write PASS, FIX, or ESCALATE after at most two fix rounds

### Truths

- The verdict is computed from evidence fields. `decideReview` reads `truthStatuses`, `worstPillar`, `slopHits`, `fixRound`, and `boots` and returns a verdict plus reasons (`packages/qa/src/verdict.ts` lines 82–121). PASS is an empty reason list: every truth `FOUND`, worst pillar `PASS`, `slopHits` 0, `boots` true (lines 95–116). A `MISSING` truth, a `FIX` pillar, or `slopHits` above 0 is `FIX` while `fixRound` is 0 or 1 (lines 117–118). The same failures at `fixRound` 2 are `PASS_WITH_KNOWN_ISSUES` (line 120). `BLOCKER` or `boots` false is `ESCALATE` at every round (lines 111–113). Test `a clean input passes at every allowed round` (`packages/qa/test/verdict.test.ts` line 55). Test `a MISSING truth at round 0 with boots true is FIX` (line 63). Test `a MISSING truth at round 1 is still FIX` (line 69). Test `a booting site with a MISSING truth at round 2 is a known issue` (line 75) requires the same reason string at round 0 and round 2, with verdicts `FIX` then `PASS_WITH_KNOWN_ISSUES`. Test `slopHits above 0 is FIX until the round cap, then a known issue` (line 128). Test `a FIX pillar follows the same round cap` (line 138). Test `a BLOCKER escalates at round 0 even when the site boots` (line 85). Test `a BLOCKER at round 2 stays ESCALATE` (line 91). Test `boots false escalates even when every other field passes` (line 109). Test `boots false at round 2 is ESCALATE, not a known issue` (line 115). Test `fixRound 2 never returns FIX, and earlier rounds never return a known issue` (line 167) walks the pillar, slop, boots, and truth combinations. Test `evidence from checkTruths, summarizePillars, and lintSlop decides the verdict` (line 268) builds the fields by calling those three functions. A short note stays `MISSING`, a copy `FIX` stays `FIX`, and `Lorem ipsum sits in the hero.` produces hits. Round 0 is `FIX`. Round 2 is `PASS_WITH_KNOWN_ISSUES`. A real note, eight passing pillars, and a clean sentence produce `PASS`.

- The function does not edit source. `decideReview` has no file, process, or network import. It returns a new object. Test `decideReview does not mutate its input` (verdict.test.ts line 261). Test `the verdict source does not edit files or apply a fix` (line 304) reads `verdict.ts` and requires `export function decideReview`, requires the names `checkTruths`, `summarizePillars`, and `lintSlop` to appear only as comments, and requires `node:fs`, `node:child_process`, `writeFile`, `appendFile`, `createWriteStream`, and `fetch(` to be absent. The calls live in the test, which is the caller.

### Key link

Inputs are the statuses, the worst pillar, and the hit count. The integration test above is that link. `decideReview` does not call `checkTruths`, `summarizePillars`, or `lintSlop`.

### Also checked

- An empty truth list throws, and the message names `must_haves` (verdict.ts lines 41–43). Test `an empty truth list throws` (verdict.test.ts line 205).
- `fixRound` other than 0, 1, or 2 throws, and the message says the caller should have stopped (verdict.ts lines 68–72). Test `fixRound 3 throws because the caller should have stopped` (verdict.test.ts line 232) covers `-1`, `1.5`, `3`, and `4`.
- Reasons name the failing field and contain no exclamation mark. Test `several failures are all named, and round 0 still asks for a fix` (line 146) requires both missing indexes, the pillar, and the hit count.
- A clean review at round 2 is `PASS`. Known issues are the failures that reached the cap.
- No `any`. The function does not write a fix.

## 114 Read the drive queue from disk and schedule its reviews

### Truths

- The dashboard can read status from disk. `loadQueue` reads `.hitchhiker/queue.json` through `path.join` and returns the parsed items (`packages/orchestrator/src/queue-file.ts` lines 44–46 and 160–173). A missing file returns null. Status values are `queued`, `running`, `passed`, `fixing`, `escalated`, and `paused` (lines 17–23). `saveQueue` takes `withStateLock` and writes with `replaceViaTemp` (lines 151–156). That helper writes a temp file in the same directory and renames it over the target (`packages/engine/src/lock.ts` lines 187–206). Test `a two-item queue round-trips under the state lock` (`packages/orchestrator/test/queue-file.test.ts` line 37) requires a missing file to load as null, then requires the loaded object and the on-disk JSON to equal a queued build plus a passed review. Test `an empty items array round-trips and means the drive is not planned` (line 53). Test `scheduled reviews round-trip as queue rows with statuses` (line 199) saves `insertReviews` output with statuses attached and reads back `review-after-003` as kind `review`. Test `queue source uses the engine lock and does not start a runner` (line 226) requires `withStateLock`, `replaceViaTemp`, and the queue path, and requires `child_process`, `spawn(`, and a runner import to be absent.

- Pause is a status change, not a deletion. `pauseQueue` copies every row and sets `running` to `paused` (`queue-file.ts` lines 180–186). Passed, escalated, fixing, queued, and paused rows keep their status and their order. Test `pause changes running to paused and leaves passed and escalated rows` (queue-file.test.ts line 64) requires the same ids, the same length, `passed` still passed, and `escalated` still escalated. Test `pause then save keeps finished rows on disk` (line 93) writes the paused queue and reads back the passed row and the escalated review.

- The cadence is data. `insertReviews` returns items. It does not run them (`packages/orchestrator/src/schedule.ts` lines 58–124). Inside each contiguous phase, a review follows every third build and the last build. A build that is both gets one review. That review is `phaseEnd: true` and `effort: "xhigh"`. A third build that is not the last gets `effort: "high"` and no `phaseEnd`. Review ids are `review-after-<id>`. Test `three prompts in one phase gain one review` (`packages/orchestrator/test/schedule.test.ts` line 26) requires three builds and `review-after-003` at `xhigh` with `phaseEnd`. Test `four prompts gain a review after the third and after the fourth` (line 43) requires `review-after-003` at `high` and `review-after-004` at `xhigh` with `phaseEnd`. Test `one prompt gains a trailing phase-end review` (line 14). Test `a sixth prompt that is also the phase end is a single xhigh review` (line 62). Test `each contiguous phase ends with a review and the next phase starts with a build` (line 74). Test `the same phase name later is a new group` (line 103).

- Nothing is executed here. `schedule.ts` imports nothing and does not touch the queue file. Test `schedule source does not call the runner` (schedule.test.ts line 164) requires `export function insertReviews` and requires `child_process`, `spawn(`, a runner import, `node:fs`, and `saveQueue` to be absent. The queue module's source test is the matching check for load and save. Test `a second save is refused while the state lock is held` (queue-file.test.ts line 146) holds `withStateLock` and requires `saveQueue` to throw `LockHeld`, so the lock is the real engine lock.

### Key links

Persisted rows are schedule items plus a status. The round-trip test at queue-file.test.ts line 199 maps `insertReviews` output to `{ id, kind, status }` and reads it back. `effort` and `phaseEnd` stay on the schedule result. The queue type in the prompt is id, kind, and status, and unknown fields throw.

Prompt ids are the caller's list. `generateSkeleton` in `packages/engine/src/spec/site-prompts.ts` (line 1133) is the generator. There is no `generateSitePrompts` alias. `reviewFlags` (lines 1088–1103) marks every third entry in a contiguous phase and the last entry of that phase. `insertReviews` inserts the review row after those same builds (schedule.ts lines 100–119). This session also ran length 2 and length 9: length 2 is two builds and one `xhigh` phase-end review; length 9 inserts high reviews after 003 and 006 and one `xhigh` phase-end review after 009. Those two lengths are not committed tests. The committed tests cover lengths 1, 3, 4, and 6.

### Also checked

- Corrupt JSON throws and the file stays (queue-file.test.ts line 118). A partial item throws and the file stays (line 132).
- Ids must match `/^[a-z0-9-]+$/`. A secret-shaped id throws before a write (queue-file.ts lines 36–67). Test `bad ids and secret-looking ids are rejected and not written` (queue-file.test.ts line 161) covers `sk-abcdefghijklmnop`, `xai-abcdefghijklmnop`, `Bad_Id`, and `001!`. The schedule test at line 153 covers the same two failures on input ids. Ids that already start with `review-` throw (schedule.ts lines 46–48, test line 146). Duplicate ids throw in both modules (queue test line 184, schedule test line 135). Empty schedule input throws (test line 131).
- The first returned item is a build (schedule tests at lines 14, 26, 43, 74, and 119). Review ids are deterministic and unique (test line 119).
- The queue comment at lines 7–10 points at `state.lock` for two serialized saves. The lock test is the runtime check.
- No `any`. Paths use `node:path`. The temp project dir uses `node:os`. No API key field exists on the queue item.

## Live model calls

112, 113, and 114 do not call a model. There is no scripted stub standing in for a live call. The 011 adapter is not involved. `lintSlop`, `decideReview`, `loadQueue`, `saveQueue`, `pauseQueue`, and `insertReviews` are deterministic.

## UI

No prompt in this group changed a file under `packages/app/`. There is no screen to open. This review did not take 375 or 1440 screenshots.

## Conflicts recorded

These are prompt-versus-prompt or prompt-versus-pack. The code follows the interface and the numbered tests. This review does not change them.

- Round 2. Prompt 113 step 3 says a `MISSING` truth at round 2 is `ESCALATE`. The goal, the decision table in that same prompt, v1 §11.3 ("after that, log a known issue unless it's a BLOCKER"), and this checkpoint's restatement say the third failure is a known issue when the site still boots. `decideReview` returns `PASS_WITH_KNOWN_ISSUES` when `boots` is true and the pillar is not `BLOCKER`. `boots` false stays `ESCALATE`. Test `a booting site with a MISSING truth at round 2 is a known issue`. Test `boots false at round 2 is ESCALATE, not a known issue`.
- Elevate headings. The pack and v2 §14.3 IMP-15 allow the product name Elevate, `/hh-elevate`, and Guide app chrome headings. Prompt 112's tested rule is narrower: guide mode skips `elevate` only on a line that contains `/hh-elevate` or `The Hitchhiker's Guide`. Other lines still flag it. This session observed `# Elevate` and a bare `Elevate` as hits in guide mode, and observed `The Hitchhiker's Guide will elevate your brand.` as clean in guide mode. Tests `guide mode allows the command and the product title` and `other guide lines still flag elevate` lock that rule. Matt's answers name the Elevate loop. They do not define a heading detector. `DECISIONS.md` does not add one.
- Review index. v2 §11.1 says `prompt index % 3 == 0` across the whole roadmap. Prompt 114, and `reviewFlags` from prompt 090, use a per-phase count. `insertReviews` follows that per-phase count. A global index would change when reviews land. That is a different scheduler.
- Queue file versus `STATE.md`. v1 §11.4 says pause and resume work because `STATE.md` is authoritative. Prompt 114 stores the queue in `.hitchhiker/queue.json` under the state lock. `loadState` still reads the guide state. The queue is the file this prompt specified.
- Pillar scale. `decideReview` consumes `PASS`, `FIX`, and `BLOCKER` from prompt 110. v2 §11.3 still describes six pillars scored 1–4 and brand dimensions scored 1–10. Prompt 113's interface is the rollup. Review 111 recorded the same scale split.
- Visual bans. The pack's blob hero, three icon cards, and cloned rhythm are visual checks. This linter reads text the caller passes. `rounded-xl` alone is clean. Palette classes, the centered container line, purple gradients, and magnetic-plus-pointer are the text checks.

## Verdict

PASS. Every truth for 112, 113, and 114 has a test and a file line. `pnpm --filter @hitchhiker/qa test` exited 0 (83 pass, 0 fail). `pnpm --filter @hitchhiker/orchestrator test` exited 0 (211 pass, 0 fail). Both package typechecks exited 0. No UI file changed. No fix. No architecture change. No test was weakened. No push, no deploy, no remote. Prompt 116 is not started.
