# 036 Review — prompts 033, 034, 035

Verdict: **PASS_WITH_KNOWN_ISSUES**

Reviewed: 2026-10-06. Fresh session. One fix commit. No new feature.

HEAD reviewed before the fix: `5e8f7fd` (`feat(guide): run the interview live on Grok with pushback, Suggest, and the brief loop`).

Fix: `06541e8` (`fix(review): checkpoint 036 stores a model-only third accept as SOFT`).

This verdict is the must-have truths below, each with a test name or a file line, plus the verification commands. It is those truths. Two goal gaps are written under Known issues. They are not failed must-haves, and they are not a new surface this review will build.

## History

Three build commits, in order, on top of `cf643ee`. Messages match the prompt commit lines. They are separate commits. History was not rewritten. The fix commit is after them.

| Order | Commit | Message | Prompt commit line |
| --- | --- | --- | --- |
| 1 | `3af3527` | `feat(app): add the phase map and pause/resume` | same, prompt 033 |
| 2 | `e90ff62` | `feat(app): serve the companion app on localhost with CSRF and SSE` | same, prompt 034 |
| 3 | `5e8f7fd` | `feat(guide): run the interview live on Grok with pushback, Suggest, and the brief loop` | same, prompt 035 |
| fix | `06541e8` | `fix(review): checkpoint 036 stores a model-only third accept as SOFT` | this review |

Parents: `3af3527` is `cf643ee`, `e90ff62` is `3af3527`, `5e8f7fd` is `e90ff62`, `06541e8` is `5e8f7fd`.

## Fix

Prompt 035 says the model verdict is OR'd with the 019 phrase floor, and the third vague answer is SOFT. `judgePushback` returned `soft`. `interview.command` stores SOFT only when the phrase floor matches, so a model-only third accept was written as `ANSWERED` while the turn status said `soft`.

Red, before the fix: test `a model-only vague answer is stored as SOFT after two pushes` failed with `ANSWERED !== SOFT`. The text was `The pages can wait until the audience is clearer.`, which `pushbackFor` does not match. Each turn used a new `GuideSession` so the count had to come back from disk.

Green, after the fix: the same test passes. `markLatestSoft` in `packages/engine/src/guide/live-turn.ts` (lines 402–427) rewrites that one record to `SOFT` under the state lock, and only after the 018 command has stored it. Phrase-floor SOFT is unchanged. Test `ten Towel and Tea turns push twice, suggest four cards, and approve the brief` still requires the stored status `SOFT` for `it's fine`.

## 033 Show phase progress and resume from the home index

### Truths

- Progress reads the same GuideState the interview writes. `runStateCommand` in `packages/cli/src/main.ts` (lines 120–125) calls `loadState` and `formatProgress` prints `phase`, `slice`, `promptId`, and `nextAction`. `loadState` in `packages/engine/src/state.ts` parses `.hitchhiker/STATE.md`. The interview writer in `packages/engine/src/interview.ts` (`renderState`, lines 546–557) emits the same headings, and the comment there says the document matches `state.ts`. Test `progress prints the slice and exits 1 when state is missing` saves with `saveState`, then requires the four plain lines and exit 0. The Playwright test `answers DP-0.1 at 375 and shows the next question at 1440` reads the file the interview wrote and requires `interview:DP-0.2` and `Answer DP-0.2.`

- Resume does not reset the cursor. Resume in `main.ts` (lines 127–128) prints `resume: ${state.promptId}` and returns. It does not call `saveState` and does not spawn Grok. Test `pause stores the message and resume does not rewrite STATE.md` pauses with `Pick up the palette.`, reloads, requires `promptId` `interview:DP-4.2` (not `DP-0.1`), then requires the file bytes and mtime to be unchanged across resume. Test `resume and pause do not invent state or start a session` requires exit 1 and no `STATE.md` when the project is empty, and requires `main.ts` to omit `spawnGrok`, `grok -p`, and `.planning`.

- Phase names match the locked list. `PHASES` in `packages/app/src/map.ts` (lines 9–18) is Don't Panic, Babel Fish, Deep Thought, Improbability Drive, Mostly Harmless, and So Long and Thanks for All the Fish. That is Matt Q35. `renderMap` (lines 107–129) throws unless `state.phase` is one of those strings, and it sets `data-current="true"` on that item only. Test `PHASES is the six locked names, in order`. Test `Babel Fish is the only current phase, and every locked name is listed`. Test `phase comparison is exact` throws on `dont panic`.

### Also checked

- Pause calls `saveState` (`main.ts` lines 135–143) and keeps phase, slice, prompt id, and blockers. An empty message, a newline, or a `## ` heading throws in `parseCli`. Test `pause rejects an empty message and a newline`.
- The per-module map is `renderGuideMap` (`map.ts` lines 136–174). `SKIPPED` renders as assumed. Test `a module shows 3 answered, 2 skipped as assumed, and 1 soft on that module only` requires counts 3, 2, and 1 on `the-question`, with the ids, and ignores an id the tree does not ask.
- `packages/cli/test/progress.test.ts` is outside the frontmatter file list. Step 8 of the prompt requires the CLI tests. It is not a new feature.
- `pnpm --filter @hitchhiker/cli test` prints `No projects matched` and exits 0 without running a suite. The CLI package from prompt 001 is `hitchhikers-guide`. `pnpm --filter hitchhikers-guide test` is 24 pass, including doctor. Renaming the package is out of scope for this review.

## 034 Serve the companion app locally

### Truths

- The companion app is a real local web app, not only HTML strings. `startServer` in `packages/app/src/server/server.ts` listens with `node:http`. `createDeskApp` serves the shell, injects the question card, and replaces the map nav with `renderMap`. `packages/app/src/client/desk.ts` fetches `/api/session`, posts with the CSRF header, and listens for SSE. Test `the server binds to 127.0.0.1 and refuses any other host` gets HTML that contains the CSRF meta tag. Test `POST without a token is rejected and the session advances through the engine` answers through the HTTP server. Playwright test `answers DP-0.1 at 375 and shows the next question at 1440` drives Chromium, fills the textarea, and requires `DP-0.2`.

- It is never reachable from the network. `listen` (`server.ts` line 173) binds `127.0.0.1` only. Any other `host` throws before listen (`server.ts` lines 49–51). `checkHost` allows only `127.0.0.1:<port>` or `localhost:<port>`. A wrong Host is 421. Test `checkHost allows only this loopback port`. Test `the server binds to 127.0.0.1 and refuses any other host` requires `host: "0.0.0.0"` to throw and `boundHost` to be `127.0.0.1`.

- Every later screen has a route slot to mount into. `routes.ts` serves `GET /`, `GET /brand`, `GET /approve`, and `GET /hh-dashboard` (`renderBrand`, `renderApprove`, `renderDashboard`). Each placeholder uses the Guide shell classes, the wordmark, and the route nav. Test `route slots, static files, and the browser modules are served` requires 200, `hh-shell`, `hh-wordmark`, and no exclamation on those three paths, and requires `/hh-dashboard` in the dashboard body.

### Also checked

- CSRF: every POST checks `x-hh-csrf` (`routes.ts` lines 338–341) before answer, suggest, skip, upload, or audio. A missing or wrong token is 403. Test `POST without a token is rejected and the session advances through the engine`. Test `upload without a token is refused`.
- Uploads: `MAX_UPLOAD_BYTES` is 25 MB. Test `a 26 MB upload is refused before the body is buffered`. Test `an exe is rejected and a traversal name is stored under uploads` stores `../../mark.svg` as a sanitized name under `.hitchhiker/uploads` and requires the fetched body not to contain `<svg`. Test `push-to-talk audio is stored and not returned inline`.
- SSE: `HEARTBEAT_MS` is 15 seconds. Test `sse heartbeat is 15 seconds and both sinks close`. Test `two listeners both receive the handler events`.
- `hh app` loads `startServer` from the app server file and prints the loopback URL. `--no-open` skips the browser. Test `hh app prints a loopback URL and hh sessions stays the doctor hint`. Package boundaries block a CLI dependency on the app, so the command imports the server by file URL. That is the boundary, not a second server.
- `.gitignore` ignores `packages/app/e2e/screens/`. The prompt says those screenshots stay uncommitted. Not a new feature.
- No Express, React, or a CSS framework was added. `@playwright/test` 1.63.0 is Apache-2.0 in NOTICE. NOTICE still says it is only for design comps. The license line is already there. This review did not edit NOTICE.

## 035 Run the Guide live: persona, pushback, grounded Suggest, brief loop

### Truths

- Grok is live in the interview through the adapter in `packages/engine/src/ai/think.ts`. `pullMessage` (`live-turn.ts` lines 314–322) calls `deps.think` with task `guide-message` and `GUIDE_MESSAGE_SCHEMA`. `judgePushback` calls `deps.think` with `PUSHBACK_SCHEMA`. `suggest` calls `deps.think` with `SUGGEST_SCHEMA`. `briefLoop` calls `deps.think` with `BRIEF_DRAFT_SCHEMA` and `BRIEF_REVISE_SCHEMA` at effort `xhigh`. `createLiveTurn` (`routes.ts` lines 188–224) is the default desk handler and calls `runTurn`. `selectGuideThink` (`routes.ts` lines 249–261) returns the real `think` export when `HH_GUIDE_REPLAY` is unset and the process is not the test runner or `HH_E2E_PROJECT`. `HH_LIVE=1` also returns `think`. Replay is `guideThinkFromScript`, which checks the cassette against the schema. Test `ten Towel and Tea turns push twice, suggest four cards, and approve the brief` replays `cassettes/guide/turns.json` through `runTurn`. Playwright test `replays ten Towel and Tea turns at 375, including pushback, four cards, and brief approval` sets `HH_GUIDE_REPLAY=1` on the real desk. The suite does not execute the bare `return think` line, because unit tests set `NODE_TEST_CONTEXT` and the e2e sets replay or `HH_E2E_PROJECT`. That line is the product path. The engine suite still skips `live smoke returns a two-field object` unless `HH_LIVE=1`. This run skipped it. Cassettes are hand-written. The commit says so.

- Pushback holds the line twice, then accepts as SOFT. `PUSH_CAP` is 2. Test `soft, soft, soft gives two pushes and then SOFT` requires actions `push`, `push`, `soft` and count 2. Test `the phrase floor pushes even when the model says the answer is concrete`. After the fix, test `a model-only vague answer is stored as SOFT after two pushes` requires stored status `SOFT`, one record, and the same question id for the first two turns. The ten-turn test requires stored status `SOFT` for `DP-0.2` and `session.pushes["DP-0.2"] === 2`. The live e2e pushes twice on `DP-0.2` in the browser, then moves to `DP-0.3`.

- Suggest is grounded in the user's own material. `sourceExists` in `suggest.ts` keeps a source only when it is `upload:`, `answer:`, `crawl:`, or `industry:` and that value is in the facts. Test `suggest drops an option that cites an upload which does not exist` keeps `upload:tins.jpg` and drops `upload:tray.jpg`. The ten-turn test requires four options on the taste turn. Taste cards use `referenceCards`: at most two Godly and two Awwwards, and source `other` is not a backfill. Test `taste cards are two Godly and two Awwwards, and a shown url is excluded`. The live e2e requires two `[data-gallery='godly']` and two `[data-gallery='awwwards']`.

- The Site Brief is approved by the user, not assumed. `briefLoop` (`brief-loop.ts` lines 64–78) yields `approved: false` until `isApproval` matches the whole reply, then writes `.hitchhiker/SITE-BRIEF.md`. `isApproval` accepts `approve` and does not treat a correction that merely contains a yes as approval. The ten-turn test requires the first yield unapproved, requires the vibe correction to leave `goal` unchanged, and requires `approve` before the file exists. The live e2e runs that same loop in a node child and requires `approved` plus the revised vibe line. A word buried in a correction does not approve.

### Also checked

- Validators: one test each for an exclamation, an em dash, a banned word, two question marks, zero question marks, an invented testimonial, an invented award, an invented number, a number that is in the facts, and Spanish versus English. `lintClaims` is still the local stub. The file says `TODO(058)`.
- Two invalid guide messages fall back to the tree ask. Test `two invalid guide messages fall back to the tree ask`. Test `Grok unavailable keeps the answer and the tree ask`.
- Express ids the mode does not ask are stored `SKIPPED` with the value prefix `ASSUMED:` and listed in `before-we-jump.json`. There is no `ASSUMED` status on `AnswerRecord`. Test `express writes ASSUMED for ids the mode does not ask`.
- The model does not pick the next id. `advance` reopens the 018 interview and uses `next()`.
- `packages/engine/src/index.ts` re-exports the guide functions so the app and the e2e can import them. The cassette files `turns.json`, `gallery.json`, and `tree.yaml` are the hand-written cassettes step 8 asked for. The frontmatter named the README only. They are not a new feature.
- Prompt 035's goal says "the 017 adapter". Read-first names `packages/engine/src/ai/think.ts` and labels it 017. That file is the adapter from prompt 011. Prompt 017 is the interview tree. The code calls `think` from `packages/engine/src/ai/think.ts`. This review follows that file. Matt's decisions still say the interview makes a real Grok call through the one adapter. No Matt conflict.

## File list

`git diff --name-only cf643ee..5e8f7fd` is the three prompts. Extra paths, and why they stay:

- `packages/cli/test/progress.test.ts` — prompt 033 step 8.
- `.gitignore` — prompt 034 step 8, screenshot directory.
- `packages/engine/src/index.ts` — export harness for 035.
- `packages/engine/test/cassettes/guide/turns.json`, `gallery.json`, `tree.yaml` — the cassettes 035 step 8 told the builder to write.

Nothing in that range is a feature from prompt 037 or later. This review did not revert them.

## UI

Prompts 033, 034, and 035 changed the app. I looked at rendered pages.

Desk, from `packages/app/e2e/screens/desk-375.png` and `desk-1440.png`, taken by `answers DP-0.1 at 375 and shows the next question at 1440` on this run:

- 375: one column. Wordmark, dek, route links, one question card, Answer / Suggest for me / Skip stacked, six phases in two columns. Don't Panic is current, with the rust meter. No horizontal overflow. The e2e asserts `scrollWidth`.
- 1440: question and transcript on the left, the six phases in a rail on the right. Answer and Suggest sit on one row. Skip stays a text button. The calm line is on this shot because `HH_E2E_PROJECT` makes the model call throw and the desk falls back to the tree ask. That is the quiet-Grok path, not the live reply.

Route slots, screenshots taken in Chromium at 375 and 1440 with reduced motion, then deleted with the script:

- `/brand`, `/approve`, and `/hh-dashboard` use the same paper surface, rust spine, Bricolage wordmark, and bordered empty state. Copy has no exclamation. Each page fits the viewport (`scrollWidth`). At 375 the fourth nav link, `/hh-dashboard`, wraps onto its own line. At 1440 the four links sit on one row.
- Approve and Redo are rectangular Desk Lamp buttons, `aria-disabled`, not pill buttons. They are the empty slot, not a working approval control.

Checked against `packages/app/src/design/tokens.css` and `components.css`: surface `#f3ebdd`, ink `#1c1612`, accent `#8e2f1a`, display face Bricolage Grotesque, text face Literata. I did not see an indigo utility, a purple gradient, a magnetic control, lorem, or the word elevate.

The per-module map is not on these screens. See Known issues.

## Known issues

- The per-module Guide map is not on the page. `renderGuideMap` is tested, and `buildSession` sets `guideHtml`, and the desk HTML inserts only `mapHtml` (the six phases). `desk.ts` does not paint `guideHtml`. Prompt 033 said the render function is what the desk mounts later, and the phase map is mounted. A user of `hh app` does not see answered, suggested, assumed, soft, imported, and to do counts. Mounting that list into the rail is a layout change, not a failed must-have, and this review did not do it.

- `hh app` does not run the brief loop. When the interview ends, the desk shows the close line `What did I get wrong?` and does not call `briefLoop`. Nothing writes `SITE-BRIEF.md` until something calls the generator and the user replies `approve`. The library and both tests do that. The browser e2e approves from a node child after the turns, not from a control on the page. Putting the draft and the correction field on the desk would be a new interaction on the question card. The `/approve` route is still the empty slot. This review did not add that surface.

## Verification

| Command | Result |
| --- | --- |
| `pnpm --filter @hitchhiker/app test` | 51 pass |
| `pnpm --filter @hitchhiker/cli test` | no project matched, exit 0, suite not run |
| `pnpm --filter hitchhikers-guide test` | 24 pass, including doctor, progress, pause, and resume |
| `pnpm install` | lockfile up to date |
| `pnpm --filter @hitchhiker/app exec playwright install chromium` | exit 0 |
| `pnpm --filter @hitchhiker/app exec playwright test` | 2 pass: `answer-one.spec.ts`, `live-guide.spec.ts` |
| `pnpm --filter @hitchhiker/engine test` | 194 pass, 1 skipped (`live smoke returns a two-field object`) |
| `pnpm --filter @hitchhiker/app exec playwright test e2e/live-guide.spec.ts` | 1 pass |

The model-only SOFT test was run red before the fix and green after it, then again inside the engine suite.

## This session

No prompt 037 work. No push, no remote, no deploy. The review script used for the route screenshots was deleted and is not in the commit.
