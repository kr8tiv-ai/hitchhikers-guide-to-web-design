# 119 Review — prompts 116, 117, 118

Verdict: **PASS**

Reviewed: 2026-10-07. Fresh session. No fix commit. No new feature. Prompt 120 is not started.

Every must-have truth for 116, 117, and 118 has a test name and a file line. `pnpm --filter @hitchhiker/app test` exited 0: 105 pass, 0 fail. `pnpm --filter @hitchhiker/orchestrator test` exited 0: 226 pass, 0 fail. `pnpm --filter @hitchhiker/engine test` exited 0: 541 pass, 0 fail, 1 skipped. The skip is the existing 011 live smoke, `live smoke returns a two-field object`, which runs only when `HH_LIVE=1`. The cost tests ran. None of these three prompts call a model.

## History

Three build commits, in order, on top of `0cc9e3d` (the 115 review). Messages match the prompt commit lines. They are separate commits. Each has one parent. History was not rewritten. This session does not push.

| Order | Commit | Parent | Message | Prompt commit line |
| --- | --- | --- | --- | --- |
| 1 | `1271655` | `0cc9e3d` | `feat(app): render the drive dashboard` | same, prompt 116 |
| 2 | `44c0067` | `1271655` | `feat(orchestrator): record drive progress in STATE.md` | same, prompt 117 |
| 3 | `ed9fb4f` | `44c0067` | `feat(engine): add an honest cost line` | same, prompt 118 |

HEAD at review start was `ed9fb4f`. The working tree was clean. No commit sits between these three.

File lists match the prompts, plus the two exceptions prompt 118 names in its own steps and commit body.

- 116: `packages/app/src/dashboard.ts`, `packages/app/src/dashboard.css`, `packages/app/test/dashboard.test.ts`.
- 117: `packages/orchestrator/src/progress.ts`, `packages/orchestrator/test/progress.test.ts`.
- 118: `packages/engine/src/cost.ts`, `packages/engine/test/cost.test.ts`, `packages/app/src/dashboard.ts`. Step 6 also says to update the dashboard test, so `packages/app/test/dashboard.test.ts` changed in this commit. `packages/engine/src/index.ts` gained one export line, `export { formatCost } from "./cost.ts";` (line 179). The app imports `@hitchhiker/engine`, and the boundary scan rejects a deep import. The commit names that file.

## 116 Render the local drive dashboard

### Truths

- The dashboard reads a queue object and does not launch work. `renderDashboard` takes `{ items }` and returns a string (`packages/app/src/dashboard.ts` lines 360–364). It does not read disk, open a session, or call `fetch`. Status values are the QueueFile set: `queued`, `running`, `passed`, `fixing`, `escalated`, `paused` (line 21). Kind is `build` or `review` (lines 60–62). Unknown status throws `Unknown dashboard status.` More than 200 rows throws. One Pause button carries `data-action="pause"` (lines 126–129). There is no Start control. Approve, Elevate, and Deploy are links to `/approve` with `data-action` of `approve`, `elevate`, and `deploy` (lines 269–274). The only script is the day and night toggle. Test `rows stay in order, escape ids, and expose status` (`packages/app/test/dashboard.test.ts` line 24) requires order, escaped `data-id`, the three statuses, one Pause, heading `Drive`, no `grok dashboard`, no indigo, no Start, and no `data-action="start"`. Test `a hostile id stays in the attribute and the text` (line 69) requires the script tag to stay escaped. Test `unknown status and unknown kind throw` (line 118) requires status `review` and status `fixed` to throw, and kind `prompt` to throw. Test `more than 200 rows throws and 200 still renders` (line 133). Test `css uses shell variables, a max-width, and no indigo or fixed width` (line 147) reads `dashboard.ts` and requires `fetch(`, `XMLHttpRequest`, and `grok dashboard` to be absent.

- It is visually the Guide's desk, not a default admin theme. The document links `tokens.css`, `type.css`, `components.css`, `shell.css`, and `dashboard.css` (dashboard.ts lines 246–250). `dashboard.css` uses `--color-ink`, `--color-success`, `--font-display`, and `max-width: 100%`. It has no hex colour, no `gradient`, no indigo, and no `1440px` width. Passed is the only status that uses `--color-success` (dashboard.ts lines 134 and 73–75 in the stylesheet). The same CSS test requires those tokens and bans indigo, violet, purple, magenta, gradient, and a fixed 1440 width. This session rendered the function, served it on loopback, and opened it. At 1440 the page used Bricolage Grotesque and Literata (both loaded), paper `rgb(243, 235, 221)`, ink `rgb(28, 22, 18)`, passed green `rgb(27, 92, 58)`, and a 4px button radius. `scrollWidth` equalled `clientWidth` (1425, the scrollbar inside a 1440 window). At 375 no element crossed the viewport, `scrollWidth` equalled `clientWidth` (360), and the queue stacked into label and value rows. Empty queue copy was `No drive queued.` Pause had `aria-disabled="true"`, the cost line was `No prompts on this queue.`, and the visible text had no `$` and no exclamation mark. Night mode set `data-theme="dark"`, surface `rgb(18, 16, 14)`, ink `rgb(244, 237, 227)`, and the toggle read `Day desk`. Those colours are the Desk Lamp tokens in `packages/app/src/design/tokens.css`. The body wash is the accent radial already in `components.css`. `dashboard.css` adds none.

### Key link

The queue shape matches QueueFile. `QueueStatus` and `QueueFile` are `packages/orchestrator/src/queue-file.ts` lines 17–27: id, kind `build` | `review`, and the six statuses above. The renderer uses that set. A row's `data-id`, `data-kind`, and `data-status` come from those fields (dashboard.ts lines 135–139).

### Also checked

- Heading is `Drive`. The kicker and the footer say `/hh-dashboard`. The dek says the page is not xAI's agent dashboard. The phrase `grok dashboard` is absent. Test `rows stay in order` (line 44) and the empty test (line 100) require the heading.
- Empty items still render Pause once, with `aria-disabled="true"`. Test `an empty queue keeps Pause and disables it` (line 97).
- Ids are escaped, including quotes and a script tag. Test `a hostile id stays in the attribute and the text`.
- Zaphod rows whose ids contain three digits link to `reviews/NNN-REVIEW.md`. Test `every known status renders once, and passed is the only green status` (line 77) requires `reviews/003-REVIEW.md` for `review-after-003`.
- Escalated rows render a panel and a Marvin line. The reason text says the reason is not on the queue file. The only control in that panel is `Open the pause control`, an in-page link to `#drive-pause`. `renderEscalation` in `packages/app/src/escalation.ts` needs a rule, a reason, and a time. The queue object does not carry those, so this page does not invent them.
- Model, effort, duration, the session tail, the 375 and 1440 frames, and Lighthouse are labeled empty. The interface has no fields for them, and step 7 says not to fetch.
- The phase mark is the literal `04` and `Improbability Drive`, plus a status tally. The queue object has no phase. The tally is `Passed n of total` and the other statuses that are above zero (`progressBlock`, dashboard.ts lines 105–124).
- No `any`. No exclamation mark in the rendered copy. The tests strip the doctype and then require that.

## 117 Update STATE.md as each prompt finishes

### Truths

- Progress uses GuideState, not a side channel. `advance` loads with `loadState` and writes `.hitchhiker/STATE.md` (`packages/orchestrator/src/progress.ts` lines 49–59 and 146–169). The markdown is the string `saveState` writes. `saveState` takes the same lock, and that lock is not reentrant, so the heading document is rendered by `saveState` in a scratch directory and then renamed over the project file inside the project lock. The scratch directory is removed. The queue is written beside it as `.hitchhiker/queue.json`. There is no `PROGRESS.md`. Test `a pass updates the queue and STATE together` (`packages/orchestrator/test/progress.test.ts` line 54) requires `loadState` to return the same phase, slice, prompt id, blockers, and the next action `002`, requires the directory to contain only `STATE.md` and `queue.json`, and requires those bytes to equal a fresh `saveState` and `saveQueue` of the same values. Test `a missing STATE.md becomes a minimal guide state` (line 196) requires a new GuideState that `loadState` reads back. Test `advance does not import a process runner` (line 463) requires `saveState`, `loadState`, and `withStateLock`, and requires `child_process`, `git `, and `PROGRESS.md` to be absent.

- A good commit pointer only moves on success. `passedState` sets `lastGoodCommit` to the sha when `commit` is a string, and keeps the previous sha when `commit` is null (progress.ts lines 117–131). `escalatedState` copies `lastGoodCommit` and does not read `commit` (lines 134–143). A sha must match `/^[0-9a-f]{7,40}$/` or be null, and that check runs before the lock writes (lines 72–74). Test `an escalation appends a blocker and keeps the old good commit` (progress.test.ts line 145) passes commit `deadbee` and requires `lastGoodCommit` to stay `abc1234`, blockers to become `["hold the towel", "002"]`, and the queue row to become `escalated`. Test `a null commit on a pass does not move lastGoodCommit` (line 246) requires the row to become `passed` and the sha to stay `abc1234`. Test `passing the last item sets the next id null and the next action to Drive idle` (line 101) requires a 40-character sha on `lastGoodCommit` after a pass. Test `escalating with no prior state records the blocker and an empty good commit` (line 223) passes a sha and requires `lastGoodCommit` to stay `""`. Test `bad shas are rejected and neither file changes` (line 265) covers uppercase, six characters, a non-hex character, 41 characters, an empty string, and a newline.

### Key link

`advance` writes the same STATE.md the interview and the map use. The path is `path.join(projectDir, ".hitchhiker", "STATE.md")` (progress.ts lines 150–152), which is `statePath` in `packages/engine/src/state.ts` lines 112–114. `loadState` parses that file. The byte-compare in the pass test is the check that the heading document matches `saveState`.

### Also checked

- A pass sets that row to `passed`. `nextAction` becomes the next row after it whose status is still `queued`, or `Drive idle` when there is none. The returned `nextId` is that id, or null. Test `the next action is the next queued id, skipping a fixing row` (line 125) requires `003` when `002` is `fixing`.
- An escalation appends the id and does not clear the old blockers. Test `a second escalation appends again and does not clear blockers` (line 174) requires `["hold the towel", "002", "002"]`. The prompt says append. It does not say to dedupe.
- An unknown id throws `Unknown queue id.` and leaves both files. Test `an unknown id throws and leaves the queue and STATE` (line 312). A missing queue throws and does not create STATE.md (line 340). Corrupt JSON stays on disk (line 439).
- A queue with any `paused` row throws `Queue is paused. Resume the drive before advancing.` and writes nothing. Test `a paused queue throws until the drive is resumed` (line 360) then resumes by saving a queue with no paused row and requires the pass to proceed.
- The existing lock is `withStateLock`. Test `a held state lock rejects advance before either file changes` (line 411) plants `state.lock` and requires `LockHeld`, with both files unchanged. The comment at the top of `progress.ts` says a paused queue must be resumed first.
- A pass does not clear blockers. Stored phase, slice, and `promptId` stay when a state file already exists. A missing state starts at phase `Improbability Drive`, slice `Eddie`, and `promptId` equal to the finished id. That assumption is in the commit body. The prompt says to create a minimal state and does not name the phase.
- The queue parser inside the lock repeats the QueueFile checks (id pattern, secret-shaped ids, duplicate ids, unknown fields) because `loadQueue` would take the lock again. The pass test's byte compare is the check that the written queue matches `saveQueue`.
- No `any`. Paths use `node:path`. The scratch directory uses `node:os`. No push.

## 118 Show counts in subscription mode and measured tokens in API mode

### Truths

- Unsourced run prices are not shown. `formatCost` walks every string in the input and throws `Unsourced run price is refused.` when it finds the ten-to-twenty illustration, including the en dash and em dash forms (`packages/engine/src/cost.ts` lines 9–55 and 143–147). The source builds that marker by joining parts, so the file does not contain the illustration as one literal. Subscription output is `Prompts ${n} of ${total}.` and contains no `$` (lines 169–170). API mode without both token counts and a rate card returns `API mode. No measured tokens yet.` (lines 173–175). Test `subscription format is counts and has no dollar sign` (`packages/engine/test/cost.test.ts` line 13) passes a million tokens and a rate card and requires `Prompts 2 of 5.` with no dollar sign. The same test, through the package index, requires `Prompts 0 of 4.` Test `API mode without rates or tokens does not invent a price` (line 27) covers no tokens, tokens without rates, rates without tokens, and input tokens without output tokens. Each line is the not-measured sentence, with no `$` and no `2.00`. Test `refuses an unsourced run price, a zero total, and a run past the total` (line 98) puts the illustration in `cardDate` and requires `CostError`. Test `the meter does not bill and does not print the refused illustration` (line 172) requires `priceTokens` and requires `fetch(`, `api.x.ai`, and `super grok` to be absent from `cost.ts`. The desk tests require the rendered page to contain no `$` and to no longer say `Cost is not measured on this desk yet` (dashboard.test.ts lines 60–62 and 109–111).

- Dollars require measured tokens and an explicit rate card. `priceTokens` takes the counts and the per-million rates as arguments (cost.ts lines 119–134). `formatCost` shows `$` only when mode is `api`, both token counts are present, and `rates.cardDate` is a non-empty string (lines 173–179). The line is `API mode. $2.00. Card 2026-09-29.` for 1,000,000 input tokens at 2 per million and zero output tokens. Rates with a blank or missing `cardDate` throw `Rates need a card date.` Negative tokens throw `Negative tokens are refused.` in both modes. `promptsTotal` of 0 throws. `promptsRun` above `promptsTotal` throws. Test `API mode prices measured tokens from the caller card` (cost.test.ts line 56) requires `2.00`, the card date, and the exact line, and requires 1,000,000 input plus 500,000 output at 2 and 6 per million to render `API mode. $5.00. Card 2026-09-29.` Test `zero tokens with a card are a measured zero, not a guess` (line 86) requires `API mode. $0.00. Card 2026-09-29.` Test `negative tokens and rates without a card date throw` (line 119) covers a negative input in API mode, a negative input in subscription mode, an empty card date, and a card with no date field.

### Key link

The dashboard cost line calls `formatCost`. `costLine` counts rows that are not `queued` as prompts run, and calls `formatCost` in subscription mode (`dashboard.ts` lines 224–235). An empty queue does not call it, because a total of 0 throws. That branch returns `No prompts on this queue.` Test `rows stay in order` requires `Prompts 2 of 3.` for one passed row, one running row, and one queued row. Test `css uses shell variables` requires the source to contain `formatCost(`. The package export is `packages/engine/src/index.ts` line 179. The subscription test imports `formatCost` from that index.

### Also checked

- The desk kicker on the cost region says `Subscription`. The populated render showed `Prompts 5 of 6.` for five rows that had left `queued` and one queued review. No dollar sign was on the page.
- Imagine prices are not on this desk. `cost.ts` does not mention Imagine. Prompt 118 says those dollars stay in the Imagine client.
- No billing call. No `any`. The function does not read a price card from disk or from the network.

## Live model calls

116, 117, and 118 do not call a model. There is no scripted stub standing in for a live call. The 011 adapter is not on this path. `renderDashboard`, `advance`, and `formatCost` are deterministic. The engine suite's one skip is the older live-smoke test, and it stayed skipped.

## UI

116 and 118 changed files under `packages/app/`. This session rendered `renderDashboard` and opened it in a browser.

- 1440 by 900, day: full page. Paper ground, rust spine, Don't Panic wordmark, headline Drive, one queue table, phase rail, escalation panel, Marvin, session, two frame slots, Zaphod link, Lighthouse, and the subscription count. No horizontal overflow. Fonts loaded. Buttons are the shell's secondary buttons, 4px radius, transparent fill, ink text. Passed is the token green. No indigo, no purple gradient, no three icon cards, no magnetic control.
- 375 by 812, day: full page. The table stacks. Pause, Approve, Elevate, and Deploy wrap. Frames stack. No element crossed the viewport.
- 375, night: the toggle switched the document to the dark tokens. The cost line stayed `Prompts 5 of 6.`
- 375, empty queue: heading Drive, `No drive queued.`, Pause with `aria-disabled="true"`, cost line `No prompts on this queue.`, no dollar sign, no exclamation mark, no horizontal overflow.

The word Elevate appears as the control label the prompt's goal names, and once in the sentence that names Approve, Elevate, and Deploy. That sentence is Guide chrome for the product action. It is not site copy. The page does not use the other banned words.

117 changed no file under `packages/app/`.

## Conflicts recorded

These are prompt-versus-prompt or prompt-versus-package. The code follows the interface and the numbered tests. This review does not change them.

- Live route. Prompt 116's goal says to render `/hh-dashboard`. The file list is the renderer, the stylesheet, and the test, and it says not to edit anything else. `packages/app/src/server/routes.ts` lines 620–622 still call the local stub `renderDashboard(token)` at lines 897–924. That stub's heading is `/hh-dashboard`, and it does not read a queue. The new function is a separate `renderDashboard(queue)`. The server test `route slots, static files, and the browser modules are served` only requires the stub response to contain `hh-shell`, `hh-wordmark`, and `/hh-dashboard`. Wiring the new document in would be an edit outside the file list, and the handler would need a queue the renderer is forbidden to fetch. The truths above are about the function that returns the desk.
- Status `review`. The goal lists it beside queued, running, fixing, passed, escalated, and paused. QueueFile has no status `review`. Kind `review` is the review row. The renderer throws on status `review`. Test `unknown status and unknown kind throw`. The key link is QueueFile.
- Time on the cost line. v2 section 20 says subscription mode shows prompt counts and time. Prompt 118's function has no duration argument. `formatCost` does not invent a duration. The desk says model, effort, and duration are not on the queue.
- Imagine spend. Prompt 116's goal names an Imagine slot for 118 to fill. Prompt 118 says Imagine dollars stay in the Imagine client, and the desk shows the subscription count only.
- Phase label. The queue shape has no phase or slice. The mark is fixed as `04` and `Improbability Drive`. The numbers beside it are status counts from the items.
- Session, frames, watchdog, and Lighthouse. v2 section 11.4 and the goal name a stream, screenshots, a watchdog log, and spend. The interface is the queue object, and the steps say not to fetch. Those regions say they have nothing on the queue, except Marvin, which repeats escalated ids. Escalation answers need the 106 record, which is not on the queue.
- Next id. `advance` takes the next `queued` row after the finished row. A queued row earlier in the file is not chosen. The commit states that assumption. An escalation returns that next id and leaves `nextAction` on the previous value.
- Repeated blocker. Escalating the same id twice appends it twice. The prohibition is against clearing blockers. The test locks the duplicate.
- Lock name. v2 section 5's save-and-resume note says `STATE.md.lock`. The existing helper is `state.lock`, from prompt 007. `advance` uses that helper.

## Verdict

PASS. Every truth for 116, 117, and 118 has a test and a file line. `pnpm --filter @hitchhiker/app test` exited 0 (105 pass, 0 fail). `pnpm --filter @hitchhiker/orchestrator test` exited 0 (226 pass, 0 fail). `pnpm --filter @hitchhiker/engine test` exited 0 (541 pass, 0 fail, 1 pre-existing skip). The drive desk was opened at 1440 and 375, day and night, including the empty queue. No horizontal overflow. No fix. No architecture change. No test was weakened. No push, no deploy, no remote. Prompt 120 is not started.
