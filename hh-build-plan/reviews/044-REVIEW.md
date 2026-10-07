# 044 Review — prompts 041, 042, 043

Verdict: **ESCALATE**

Reviewed: 2026-10-06. Fresh session. No fix commits. No new feature.

HEAD reviewed: `78e2182` (`test: prove interview save and resume end to end`).

The 041, 042, and 043 must-have truths hold. Each one below has a test name or a file line. This verdict is those truths, plus the Don't Panic success criteria in `hh-build-plan/ROADMAP.md`. Two phase-gate checks are false and are not local fixes inside these prompts.

Escalate:

- Roadmap success criterion 7 is false. Gallery and motion run in the browser at 375 and 1440. The mood analyzer does not. `analyzeMood` is called only from `packages/engine/test/mood.test.ts`. `GET /mood` and `GET /api/mood` on the desk return 404. Prompt 039's file list had no page, and review 040 passed that prompt. A desk surface for mood is a new prompt. 041, 042, and 043 did not own it.
- `pnpm exec tsc -b --pretty false` exits 1. Eight errors, all under `packages/app/src/motion-previews/` from prompt 038. NodeList is not iterable under the ES2022 lib, `ogl`'s module type has no `Renderer`, `Triangle`, `Program`, or `Mesh`, `three` has no declaration file, and the Theatre `play` signature does not match the local wrapper. Review 040 did not run this command. Patching it needs a dependency (`@types/three`) and a reshape of the OGL and Theatre imports. That is outside these prompts' file lists. This review does not do it.

## History

Three build commits, in order, on top of `1254c16`. Messages match the prompt commit lines. They are separate commits. History was not rewritten.

| Order | Commit | Message | Prompt commit line |
| --- | --- | --- | --- |
| 1 | `d8b406f` | `feat(app): fill the draft from push-to-talk` | same, prompt 041 |
| 2 | `94aa71f` | `feat(engine): scaffold read-only X PKCE` | same, prompt 042 |
| 3 | `78e2182` | `test: prove interview save and resume end to end` | same, prompt 043 |

Parents: `d8b406f` is `1254c16`, `94aa71f` is `d8b406f`, `78e2182` is `94aa71f`.

## 041 Wire push-to-talk to the local transcriber

### Truths

- Push-to-talk uses the local engine interface. `createPtt` in `packages/app/src/ptt.ts` (lines 18–21, 67–77) takes an injected `transcribe(wavPath)` that returns `{ text }` and maps `{ code: "MISSING_BIN" }` to the warning. That code is `WhisperError` in `packages/voice/src/whisper.ts` (lines 69–74, 119–122). The controller has no API key and does not import xAI. Test `capture runs, then transcribe, while state is transcribing` requires capture, then transcribe, and a trimmed draft. Test `the controller does not import the xAI adapter or child_process` reads `ptt.ts` and rejects `api.x.ai`, `child_process`, `getUserMedia(`, and `@hitchhiker/voice`.

- A missing binary does not block typing. Test `MISSING_BIN leaves the draft null and names the env vars` keeps the string `typed on the keyboard`, requires the warning `Local transcriber not installed. Set WHISPER_CPP_BIN and WHISPER_CPP_MODEL, or type instead.`, and renders that string inside the textarea with `Hold to talk` and `data-action="answer"` still present. The warning has no exclamation mark. After the failure, `start()` records again.

- CI does not need a microphone. The same tests inject `capture()` with a fake path. `ptt.ts` lines 4–12 say a later UI may call `getUserMedia` and that this capture is injected. The source test rejects a `getUserMedia(` call and `mediaDevices`. No audio file is in the 041 diff.

### Also checked

- Call order, the second `stop()` during transcribe, `Transcription failed.`, and `Nothing was heard.` are tests in `packages/app/test/ptt.test.ts`.
- `renderCard` in `packages/app/src/card.ts` (lines 150–153 and 192) paints `Hold to talk` as `type="button"` with `data-voice="hold"`. Test `the card shows one question and the three exact actions` requires that button and forbids a `style` attribute. `packages/app/src/design/components.css` (lines 209–215) and `packages/app/src/card.css` (lines 66–70) set `min-height: 44px`.
- Extra files, named in the commit, and required by the prompt's steps 4 and 9: `packages/app/src/card.ts`, `packages/app/test/card.test.ts`, `packages/app/src/index.ts`. No new package.

The key link "satisfied by packages/voice transcribe in the app wiring" is a comment in `ptt.ts` (lines 7–12), not a call. See Known issues.

## 042 Scaffold read-only X OAuth without posting

### Truths

- X in this milestone is read-only scaffolding. `X_SCOPES` in `packages/engine/src/x-oauth.ts` (lines 36–39) is frozen as `tweet.read` and `users.read`. `buildAuthorizeUrl` (lines 126–136) puts that list on the query as a space-joined `scope`, with `code_challenge_method` `S256`, and does not set `client_secret`. Test `scope list snapshot is the two read scopes` requires that pair, rejects `write` and `offline` in any scope, and rejects a push of `tweet.write`. Test `buildAuthorizeUrl puts read scopes and S256 on the x.com authorize host` requires `https://x.com/i/oauth2/authorize` and `scope=tweet.read%20users.read`.

- PKCE S256 is used. `createPkce` (lines 58–61) builds a 64-character base64url verifier from 48 `randomBytes` and a sha256 base64url challenge, with `method: "S256"`. Test `createPkce returns an S256 challenge of the verifier` recomputes the hash and requires length at least 43.

- Posting is not implemented. The module exports `createPkce`, `buildAuthorizeUrl`, `X_SCOPES`, `X_AUTHORIZE_HOST`, `X_AUTHORIZE_PATH`, and `XOAuthError` (`packages/engine/src/index.ts`). There is no token, refresh, or tweet function. Test `the module has no post or token endpoint` reads the source and requires the absence of `tweet.write`, `statuses/update`, `oauth2/token`, `/2/tweets`, `fetch(`, and `STATE.md`, and requires `buildAuthorizeUrl` not to call `fetch`.

### Also checked

- Non-loopback redirects throw, including `https`, userinfo, `::1`, decimal and short IPv4, and a fragment. Test `non-loopback redirects throw`. Empty and whitespace `clientId`, and a state shorter than 16 characters, throw. Test `empty clientId and short state throw`.
- `http://127.0.0.1` and `http://localhost` are accepted. The host is frozen as `https://x.com` with a comment that a later milestone must re-check the X docs. This module does not call it.
- Extra file, required by step 7: `packages/engine/src/index.ts`. No network, no client secret, no new package.
- DP-0.5 does not open this URL. The prompt says a later step may. The tree question stays a question.

## 043 Prove the interview saves and resumes end to end

### Truths

- Save and resume work on the real tree, not a one-question stub. `packages/engine/test/interview-e2e.test.ts` loads `interview/tree.yaml` through `loadTree` and `questionsForDepth(..., "express")`. Test `express saves, resumes at the next id, and finishes with no missing required field` requires the first id `DP-0.1`, the last id `DP-9.5`, at least eight modules, and every `requiredIds()` value inside Express. It answers three questions, holds `state.lock` with this process and expects `LockHeld`, drops that session, opens another, and requires the cursor `DP-0.3`. It then skips the rest except the five sentences and requires `interview:done` in `STATE.md`, `saved.length === express.length`, and no `.planning` directory. The home index stamp is unchanged.

- Required fields are non-empty at the end of the fixture. The same test requires `missingRequired(saved)` to be `[]`, every value non-blank, and the five answers `a tea shop site`, `a visitor who wants a tin`, `the action buy`, `vibe earthy, anti-vibe neon`, and `hosting no idea`. `DP-6.2` stays `SKIPPED` with the tree skip default, which matches `/ASSUMED/`. `requiredIds` in `packages/engine/src/required.ts` (lines 16–24) is `DP-2.1`, `DP-2.6`, `DP-2.2`, `DP-5.3`, `DP-6.2`, `DP-9.2`, the v2 section 8.4 list in the prompt's order. `missingRequired` was not weakened: an empty list still returns those six ids (asserted in the test).

- The desk can show the phase and the question without a live model. `packages/app/test/desk-e2e.test.ts` calls `openInterview`, `missingRequired`, `loadState`, `renderCard`, and `renderMap`. Test `the desk renders the question card and Don't Panic from a saved session` skips `DP-0.1` through `reduceCard`, drops the session, opens another, and requires the card for the next id with Answer, Suggest for me, and Skip. `renderMap` has one `data-current="true"` item and that item is Don't Panic. No Grok import, no network, temp dir removed in `finally`.

### Also checked

- The file header lists the criteria this test covers: lock, resume, tree ids, card regions.
- Production change allowed by step 1: `requiredIds()` and the export from `packages/engine/src/index.ts`. `interview/tree.yaml` was not edited. Required ids were already in every depth.
- The test does not write `os.homedir()/.hitchhiker/index.json`. On Windows the temp directory sits under the user profile. The check is the index file stamp, which the commit names.

## UI at 375 and 1440

Prompt 041 changed `packages/app/` (the card button). Prompts 042 and 043 did not change a screen. 043's desk test renders HTML strings. It does not open a browser.

This session started the desk with `startServer` on `127.0.0.1` and a temp project, then looked in Chromium.

Desk at 375 (viewport `375×812`, `window.innerWidth` 375, no horizontal overflow):

- Paper `#f3ebdd` (`rgb(243, 235, 221)`), body face Literata, rust Answer `#8e2f1a` (`rgb(142, 47, 26)`). Those are `--color-surface-light`, `--font-text`, and `--color-accent-light` in `packages/app/src/design/tokens.css`.
- Don't Panic wordmark, rust spine, one question card for DP-0.1, four actions stacked at 268×44. Hold to talk is a bordered secondary button. Answer is the rust primary. Suggest for me is bordered. Skip is the ghost.
- Six phases in two columns. Don't Panic is current.

Desk at 1440 (viewport `1440×900`, no overflow): question and transcript on the left, the six phases in a rail on the right. Hold to talk, Answer, and Suggest for me sit on one row at y=648, each 188×44. Skip wraps onto the next row. Typed text `A tea shop site.` stayed in the field. A click on Hold to talk left that draft in place, left the question on DP-0.1, and left Answer enabled. The button does not submit.

No indigo utility, no purple gradient, no magnetic control, no lorem, no exclamation mark in the rendered desk text, and the word elevate is not in that text.

Gallery at 1440 and 375: the walk renders, no overflow, two Awwwards cards (Lando Norris, CoMinVi) and zero Godly cards. That is the pack gap from review 040. Motion at 375 and 1440: ten `[data-family]` cards, the appetite slider, the magnetic-button ban sentence, paper background, no overflow.

## Don't Panic phase gate

| # | Criterion | Result | Evidence |
| --- | --- | --- | --- |
| 1 | A new project writes `.hitchhiker/` and locks STATE.md | TRUE | `openInterview` creates `.hitchhiker` and writes `STATE.md` under `state.lock` (`packages/engine/src/interview.ts`). `saveState` uses `withStateLock` (`packages/engine/src/state.ts`). Test `a live lock blocks a second acquire`. The 043 e2e requires the lock to block, then to be gone, and requires no `.planning` directory. `renderTemplate` still renders the ported spine (`listSpineTemplates returns the ten spine files with attribution`). The on-disk `STATE.md` is the short 007 heading document, not a paste of `templates/gsd/state.md`. Prompt 068, in Deep Thought, is the site-file writer. |
| 2 | `/hh-doctor` reports grok, node, git, CLI flags, and session-id shape, and does not throw on a missing optional tool | TRUE | Test `a missing grok is a warning and the probe is skipped` requires exit 0, `node: 22.0.0 ok`, `git: ok`, `grok: not on PATH`, `session-id: unknown`, and warnings for playwright, whisper, and pdftotext. Test `missing git warns and still exits 0 when node is supported`. Test `doctor does not require whisper, playwright, or pdftotext`. Test `effortFlag is true only when --effort appears`. |
| 3 | The design system exists and screens use it | TRUE | `packages/app/src/design/tokens.css` and `components.css` are the Desk Lamp sheets. Desk, gallery, and motion, opened this session, use that paper, ink, rust, and type. `/brand`, `/approve`, and `/hh-dashboard` return 200 and link the design sheets. Rendered desk text has no lorem, no elevate, and no exclamation mark. |
| 4 | One Grok adapter, live interview, two pushbacks, grounded Suggest, mirroring, approved Site Brief | TRUE | `think()` in `packages/engine/src/ai/think.ts` validates a schema and replays cassettes. `selectGuideThink` in `packages/app/src/server/routes.ts` (lines 272–284) returns `think` for a product process. Test flags replay a cassette or throw quiet. Test `soft, soft, soft gives two pushes and then SOFT`. Test `a model-only vague answer is stored as SOFT after two pushes`. Test `mirror cadence is every eight, and module end is a different next module`. Test `ten Towel and Tea turns push twice, suggest four cards, and approve the brief` writes `SITE-BRIEF.md`. The Playwright spec `replays ten Towel and Tea turns at 375` does the same through a node child after the browser turns. `live smoke returns a two-field object` stayed skipped because `HH_LIVE` was unset. The desk page still has no approve control. See Known issues. |
| 5 | Deep is the default. Standard and Express drop no ids | TRUE | `defaultConfig` sets `interviewDepth: "deep"` (`packages/engine/src/config.ts` line 368). Test `empty object becomes defaults` requires `interviewDepth` `deep`. Every top-level tree id is in `standard` and `deep` (63 depth lines, 63 top-level ids, no deep-only tag). Express omits `DP-0.5` and `DP-7.2` from the question list. Test `depth is a filter and express drops DP-0.5 without dropping the id`. `seedExpressAssumptions` writes those two as `SKIPPED` with an `ASSUMED:` value and lists them in `before-we-jump.json`. Test `express writes ASSUMED for ids the mode does not ask`. The default desk calls that seed when depth is express (`routes.ts` lines 151–152). `runTurn` seeds on every express turn. Re-asking those rows is Before-we-jump, prompt 134. |
| 6 | `tree.yaml` contains every DP id from v2 section 8, with a depth tag | TRUE | The 62 ids named in v2 section 8.3 were checked against `interview/tree.yaml`. Each is a top-level question with a `depth:` line within the next eight lines. `DP-7.1` is an extra id from prompt 017 and also has a depth tag. Follow-ups such as `DP-1.1a` sit under `follow_ups` and are not section 8 question ids. |
| 7 | `hh app` on 127.0.0.1 with CSRF. Gallery, motion, and the mood analyzer in a real browser at 375 and 1440 | FALSE | The desk listens on `127.0.0.1` only (`packages/app/src/server/server.ts`). Test coverage in `packages/app/test/server.test.ts` requires the CSRF meta tag and rejects a POST without `x-hh-csrf`. Gallery and motion were opened this session at 375 and 1440, and their Playwright specs still assert both widths. The mood analyzer has no route and no call from `packages/app`. Escalate, above. |
| 8 | CI on Windows, macOS, and Linux, without secrets | TRUE | `.github/workflows/ci.yml` matrices `ubuntu-latest`, `windows-latest`, and `macos-latest`, permission `contents: read`, and the only env value is `HH_CASSETTE: replay`. No secret, token, or key is written into the workflow. |

## Known issues

These are not the escalate items. This review does not build them.

- Hold to talk is painted by `renderCard` and is not wired to `createPtt`. `packages/app/src/client/desk.ts` handles answer, suggest, and skip. Nothing in the app passes `packages/voice` `transcribe` into the controller. The package boundary allows the app to depend on `@hitchhiker/engine` only (`packages/engine/src/boundaries.ts`). `POST /api/audio` still stores the blob and says prompt 041 will transcribe it. Importing the voice package, or spawning whisper from the app, is a new surface. A click on the live desk left the typed draft unchanged, so typing is not blocked. The MISSING_BIN sentence is returned by the controller and is not painted on the card, because nothing calls `stop()`.

- At 1440 the card column fits three buttons. Skip, the fourth, wraps to the next line and the ghost style makes that row read as a centered label. Heights stay 44px. `card.css` is outside the 041 file list. This review does not restyle it.

- The curated gallery pack still has no `source: "godly"` row. The live `/gallery` round is two Awwwards cards. Review 040 recorded this. The balance tests use a fixture pack.

- `hh app` still does not run `briefLoop` from a control on the page. Approval is the engine function and the live-guide e2e node child. Review 036 recorded this. Criterion 4 stays true because that path writes an approved `SITE-BRIEF.md`.

- `openInterview` alone does not call `seedExpressAssumptions`. The 043 express walk therefore has no `DP-0.5` row. The desk and `runTurn` do seed. Criterion 5 uses that product path.

## Live Grok

041, 042, and 043 do not call a model. 041 injects a transcriber and forbids the xAI adapter in `ptt.ts`. 042 does not call the network. 043 forbids Grok and Imagine, and the tests do not import them. The product desk still reaches Grok through `think()` unless `HH_GUIDE_REPLAY`, `NODE_TEST_CONTEXT`, or `HH_E2E_PROJECT` is set. Mood keeps its schema and cassette from prompt 039. Nothing in this group left a scripted stub in place of a call these prompts asked to make.

## Verification

Commands run from the repo root on this review. No fix was applied, so there is no second run.

| Command | Result |
| --- | --- |
| `pnpm --filter @hitchhiker/app test` | included in `pnpm -r test`: 69 pass, 0 fail |
| `pnpm --filter @hitchhiker/engine test` | included in `pnpm -r test`: 221 pass, 0 fail, 1 skipped (`live smoke returns a two-field object`) |
| `pnpm -r test` | exit 0. crawler 80 pass, voice 43 pass, engine 221 pass and 1 skipped, cli (`hitchhikers-guide`) 24 pass, orchestrator 13 pass, app 69 pass. Stub suites in grok-plugin, knowledge, and templates exit 0. |
| `pnpm exec tsc -b --pretty false` | exit 1. Eight errors in `packages/app/src/motion-previews/`. Escalate, above. |

Node printed `NO_COLOR` / `FORCE_COLOR` warnings. They did not fail the test run.

No prompt 045 work. No push, no remote, no deploy. The desk process started for the screenshots was stopped. Screenshot files were not committed.

## Scope

No source edit. No fix commit. The only file this session adds is this review.
