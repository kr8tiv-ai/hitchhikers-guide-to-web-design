# Live bug check report (Oct 9, 2026)

Audit only. No source files were changed. Prompts 001–005 were already written; new evidence for them is under "Already prompted". New fix prompts are 006–010.

The repro used a temp project and port 0, with `HH_CASSETTE=replay` set only in that process. It was not a `node --test` process, so `selectGuideThink` took the live `think()` path. The server was closed and the temp directory was removed. The repo `.hitchhiker/` folder was not read or written. `grok` was not run.

## Findings

### F-01 — A failed turn saves the answer, and the next click writes it onto the next question

- Severity: blocker
- Where: `packages/app/src/server/routes.ts` `createLiveTurn` (the id check at 232–234, `runTurn` at 241–246, `setInterview` only after success), `packages/engine/src/guide/live-turn.ts` `perform` (169–179) and `answerText` (207–210), `packages/app/src/client/desk.ts` `postTurn` / `submit` (183–188, 467–471)
- What breaks: The desk checks the question id against the interview object it loaded at startup. `runTurn` then opens the interview from disk and ignores the id. `storePlain` / `storeCommand` write the answer, then `askGuide` calls the model. `CassetteMissError` is not in `isQuiet` (474–482), so a cassette miss throws after the write. `setInterview` never runs. The client keeps the old card (`postTurn` drops everything except `error` when the status is not ok). The next Answer, Suggest, or Skip still matches the stale id, and `perform` applies it to whatever `next()` is on disk now.
- Confirmed: temp desk, port 0, `HH_CASSETTE=replay`, default depth, question `DP-0.1`, one 83-character answer. First `POST /api/answer` returned 500 `{"error":"The answer did not save. Try again, or skip."}` and `interview.json` already had `DP-0.1` `ANSWERED`. The same post again returned the same 500, and the file then had `DP-0.1` and `DP-0.2`, both `ANSWERED`, both 83 characters. Stderr logged `Desk error: cassette miss: …` twice. The suite hides this: under `NODE_TEST_CONTEXT` the desk uses `unavailableGuideThink`, and that error is quiet, so the turn succeeds.
- Prompt: 006. 003 owns the sentence the person reads. 003's client test keeps the Answer button enabled with the same draft, so 003 can land without stopping this write.

### F-02 — A crash leftover locks the desk forever

- Severity: high
- Where: `packages/engine/src/lock.ts` `classify` (114–121), `packages/app/src/server/routes.ts` `readAnswers` (1391–1394), `packages/engine/src/guide/live-turn.ts` `seedExpressAssumptions` (116–125), `markLatestSoft` (421), `persistSession` (508)
- What breaks: A `STATE.md.lock` that is not JSON is `held` with pid 0 and is never stolen. A dead pid whose `acquiredAt` is not a date is never stolen either, because the 30s floor only runs when `Date.parse` works. `readAnswers` calls `JSON.parse` with no catch, and `buildSession` runs on `/`, `/api/session`, and `/api/events`. A half-written `interview.json` turns every one of those into 500 `The desk could not finish that request.` The live writers that use `writeFile` on the existing file (express seed, soft mark, `guide-session.json`) truncate first, so a kill mid-write leaves that file. `turnError` maps `LockHeld` to the same "did not save" string, including the intentional 30s wait after a dead but well-formed lock.
- Confirmed: `acquire` on `{not json` was still `LockHeld` pid 0 when `now` was a day ahead, and the file was still there. A dead pid (`2147000000`) with `acquiredAt: "not-a-date"` was still `LockHeld` a day ahead. The same dead pid 5s ago was `LockHeld` (the 30s floor, keep this). The same dead pid 60s ago was stolen. After the F-01 run, overwriting `interview.json` with `{` made `GET /api/session` return 500 and stderr `Expected property name or '}' in JSON…`.
- Prompt: 007

### F-03 — A locked `STATE.md` fails the rename, after the answers file has already moved

- Severity: high
- Where: `packages/engine/src/interview.ts` `persistPair` (482–494), `packages/engine/src/lock.ts` `replaceViaTemp` (214–228)
- What breaks: Both renames are one shot. On this Node, rename onto an existing file succeeds when the destination is not open. Rename onto a file opened with `open(path, "r+")` throws `EPERM`. There is no retry. `persistPair` renames `interview.json` first and `STATE.md` second. If the second rename throws, the answers file is already the new one, the in-memory interview does not advance, and the desk says the answer did not save. The next click is F-01 again. OneDrive, an editor, or an indexer holding `STATE.md` is enough. Brand approval and the queue use `replaceViaTemp` and fail the same way, without the two-step hole.
- Confirmed: in a temp dir, rename over an existing file replaced the body. Rename onto an open handle threw `EPERM: operation not permitted, rename`. No product path catches that code.
- Prompt: 008. 006 stops the follow-on write. 008 makes the first save succeed when the file is only briefly locked.

### F-04 — Every live model call runs `grok --help` in the project first

- Severity: high
- Where: `packages/engine/src/ai/think.ts` (298, and `probeFlags` at 411–428)
- What breaks: Unless the caller passes `flags`, every non-replay `think()` spawns `grok --help` with the answer timeout (`ai.timeoutMs`, default 120s) and with `cwd` set to the project. The real call then runs in a scratch dir. A normal answer calls `think` twice (pushback judge, then the next question), so that is two help probes plus two model runs, and a schema retry adds more. The help child uses `launch()` in `grok-cli.ts`, which already sets `windowsHide`. A `.cmd` shim still goes through `cmd.exe`, and the probe's cwd is the project, so a grok build that opens a console or writes session files does it on every question. A help probe that waits uses the full 120s before the answer starts. The desk stays on `pending` until that returns. Replay returns before `probeFlags`, so this is not what spawned processes during the cassette-miss demo. It is what a normal live session does once cassette mode is cleared.
- Confirmed: by reading `think` and `probeFlags`. `grok` was not executed.
- Prompt: 009. 002 still owns `windowsHide`, `detached`, and opening the browser once. `launch()` already passes `windowsHide: true` (grok-cli.ts 441–461). 002 should not spend its commit re-adding that flag on this one spawn.

### F-05 — Pushback re-render drops the new answer and disables Answer

- Severity: medium
- Where: `packages/app/src/card.ts` `renderCard` (182–205), `packages/app/src/client/desk.ts` `paint` (479–492) and `startVoice` (293–336)
- What breaks: If `pushback` is set, the textarea is rendered empty and Answer is disabled, even when `state.draft` has new text. Typing survives only because `input` does not re-render. Voice, a failed submit, and any other `paint()` do re-render. The heard or typed text disappears and Answer stays disabled until the person types again. The empty field was meant to stop the rejected line being sent again. The hold path already sets `draft` to `""` when the push succeeds. The renderer cannot tell that old line from a new one.
- Confirmed: by reading `renderCard` and `desk.ts`. `packages/app/test/card.test.ts` ("a draft enables Answer, and pushback keeps the field empty") locks the wipe in: draft `"fine"` plus a pushback must render an empty textarea and a disabled Answer. No browser pass. 004's Chromium script does not set a pushback.
- Prompt: 010

## Already prompted

### 001 — cassette env guard

Confirmed the live path. A non-test process with `HH_CASSETTE=replay` reaches `think()`, misses, and the desk logs `Desk error: cassette miss: …`. Nothing in the page says replay mode. `selectGuideThink` (`routes.ts` 281–294) only substitutes the quiet guide when `NODE_TEST_CONTEXT`, `--test`, or `HH_E2E_PROJECT` is set. `hh app` from a shell that still has the variable does not hit that branch.

### 002 — no new windows

Extra evidence, not a second prompt:

- `open-browser.ts` 62–66 spawns `cmd.exe /c start` with `detached: true` on Windows. That is one console-bearing child per `hh app` start, including a replay session, which does not spawn grok.
- `think()` spawns `grok --help` on every live call (F-04). Hiding the window is 002. Not spawning it every time is 009.
- `packages/qa/src/playwright-opener.ts` `withChromium` (73) and `packages/engine/src/exports/prd-pdf.ts` `printHtml` (156) omit `headless: true`. Crawler launches already pass `headless: true`.
- Doctor, whisper, tools, git, and the grok launch already pass `windowsHide: true`.

### 003 — say why, and do not freeze

The generic string is `turnError` (`routes.ts` 1906–1917). The repro returned that string after the answer was already `ANSWERED`. Current `desk.ts` 467 does set `pending = false` when the fetch finishes, so a finished 500 does not leave the button busy. The card stays on the old question because the error body has no session. That is the freeze, and the next click is F-01. `LockHeld`, a timeout that escapes `isQuiet`, and a `finishLog` throw (`think.ts` 385–387, the `finally` after a successful return) all become the same sentence. 003 should treat "already written" as saved. 006 stops the write if the client retries anyway.

### 004 — hold to talk in a browser

`startVoice` is wired to the browser recognizer. The remaining desk bug is F-05. 004's scripted recognizer does not cover a card that already has pushback.

### 005 — reference sites

No new evidence. DP-5.1 was not rewritten.

## Later

Not given a prompt. At most a few lines if someone is already in the file.

- `checkHost` rejects a foreign `Host` (`evil.example:port` is false) and rejects a second host in the same header. POST still requires `x-hh-csrf`. No rebinding bypass showed up. `Host: 127.0.0.1` with no port is also false, so `hh app --port 80` would refuse the browser, which omits the default port. Same for 443.
- `deploy()` calls `deps.yes()` before any host call. The `approved: true` values inside `cli-run.ts` sit behind that gate. `hh assets run` still spends nothing without `--yes`. No path found that deploys or spends on its own.
- Upload names keep the last path segment, then a generated `hh-` prefix. SVG is stored and has no route. `/src/` and `/vendor-pkg/` reject `..` and check the real path.
- The answer `fetch` has no abort. `pending` clears on a finished response or a thrown fetch. A socket that never completes leaves the button busy. Grok itself is killed at `ai.timeoutMs` (default 120s) once the child has started. F-04 is the extra wait in front of that.
- `GET /gallery` and `GET /api/gallery` use the same queue as `/api/answer` (`routes.ts` 180–187, 591). A slow gallery open holds the next answer.
- Whisper's Windows timeout uses `child.kill("SIGKILL")` (`whisper.ts` 365), not `taskkill /T`. The desk's Hold to talk path does not spawn it.
- Crawler `parseHttpUrl` allows any http(s) host, including loopback, and follows redirects with no private-network check. The desk does not call `crawl()`.

## Checked, no separate finding

Host binding stays `127.0.0.1`. CSRF compare is constant-time and required on POST. Imagine, Hostinger, Vercel, Netlify, and Cloudflare writes sit behind an explicit yes. Playwright in the crawler is headless. The state lock's 30s floor for a dead, well-formed lock is doing what the comment says. Rename-over-existing works on this Node when the destination is not open.
