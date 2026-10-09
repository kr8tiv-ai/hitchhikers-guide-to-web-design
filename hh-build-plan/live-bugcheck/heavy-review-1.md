The two live demo failures are real, and they share a cause: a Guide or process failure is either hidden behind a save message, or it opens a window. The rest of the list is what I could confirm in commit 9010874.

## 1. Ranked bugs

### Critical

**1. A cassette miss or Guide failure is reported as "The answer did not save."**
`packages/app/src/server/routes.ts` `turnError` maps every non-`InterviewError` to status 500 and that string. `packages/app/src/client/desk.ts` `postTurn` shows the server string, and falls back to the same sentence on a network or JSON failure.

The miss is not treated as a quiet Guide failure. `packages/engine/src/guide/live-turn.ts` `isQuiet` only accepts `GrokMissingError`, `GrokUnavailableError`, `ThinkTimeoutError`, `ThinkRunError`, `ThinkSchemaError`, and `PersonaError`. `packages/engine/src/ai/think.ts` `think` throws `CassetteMissError` (`cassette miss: <key>`) and does not catch it. `guideThinkFromScript` throws a plain `Error("cassette miss: ${task} #${index}")` when `HH_GUIDE_REPLAY=1` runs past the scripted list. Neither is quiet, so `askGuide` does not return `CALM_MESSAGE`.

Order makes it worse. `answerText` calls `judgePushback` (a think) before `storePlain`. `advance` then calls `askGuide`, which thinks again. A miss on the first call means the answer was never written. A miss on the second means `interview.json` was already written and the cursor moved, then `createLiveTurn` throws before `setInterview`. The client stays on the old question. Retry sends the old id, and `createLiveTurn` throws `InterviewError("command", "That question is no longer on the desk.")`, which is still shown as a save failure.

Reproduce: `HH_GUIDE_REPLAY=1` with a cassette shorter than the interview, or engine replay mode with a missing key, then press Answer.

Fix: add `CassetteMissError`, `CassetteError`, and `/^cassette miss:/` to `isQuiet`, so `askGuide` returns the calm tree ask and the turn succeeds. In `turnError`, map cassette and Grok errors to "The answer is saved. The Guide could not phrase the next question." and map `LockHeld` separately. Only say "did not save" if `persistPair` threw. In `createLiveTurn`, reopen the interview in a `finally` and return the next question with `calm: true` instead of 500.

### High

**2. Windows desk launch opens a console, and often a new browser window.**
`packages/app/src/server/open-browser.ts` `browserLaunch` returns `{ command: "start", args: ["", url] }`. `defaultSpawn` runs `cmd.exe /d /s /c start` with `shell: false` and no `windowsVerbatimArguments`. `openBrowser` also sets `detached: true`.

On Windows, Node drops or mis-quotes an empty argv unless `windowsVerbatimArguments` is set. `start` then treats the first quoted argument as the window title, so the URL becomes the title and a console stays open. Node's own docs say `detached: true` on Windows gives the child its own console. `windowsHide` does not stick to that `start` child. `start` also opens a new browser window, not a tab. Each `hh app` start (Grok Build restart, second desk) does it again. `openBrowser` resolves true on the `spawn` event, which only means `cmd.exe` started.

Reproduce: `hh app` on Windows 11 (open defaults to true).

Fix: do not use `detached` on win32. One verbatim command line, and only after checking the URL is `http://127.0.0.1` or `http://localhost`:

```ts
spawn("cmd.exe", ["/d", "/s", "/c", `start "" "${url}"`], {
  shell: false,
  windowsHide: true,
  windowsVerbatimArguments: true,
  stdio: "ignore",
});
```

Resolve true only after exit 0. Prefer `rundll32 url.dll,FileProtocolHandler` plus the URL if a console still flashes.

**3. Every Guide turn can flash a console, because grok on Windows is a `.cmd`.**
`packages/engine/src/ai/grok-cli.ts` `launch` wraps `grok.cmd` / `grok.bat` in `cmd.exe /d /s /c` with `windowsHide: true` and `windowsVerbatimArguments: true`. npm's global grok is `grok.cmd`. Each answer runs `judgePushback`, then often `requestMirror` and `askGuide`, so one Answer is several cmd spawns. `windowsHide` is unreliable together with `windowsVerbatimArguments` (CREATE_NO_WINDOW does not inherit to the shim). This is the "keeps opening windows while using the app" path.

Fix: resolve `grok.exe` and spawn that with `windowsHide`, `detached: false`, and no cmd. If only the shim exists, pass the prompt via `--prompt-file` (already used when the prompt is large in `planGrokCall`) on every Windows call, never as `-p` on a cmd line.

**4. Hold to talk dies mid-hold, and it is not local.**
`packages/app/src/client/desk.ts` `startVoice` sets `continuous: true` and `interimResults: true`. `onresult` calls `paint`, and `paint` sets `question.innerHTML = renderCard(state)`, so the held button is destroyed on the first partial. `onend` always calls `finishVoice`, so Chrome's spontaneous end (pause, or the ~60s cut) drops the hold while the pointer is still down. `startVoice` returns immediately if `recognition !== null`. `stopVoice` only calls `finishVoice` if `rec.stop()` throws. Chrome often never fires `onend` if `stop()` happens before `onstart`, so the button stays dead until reload.

`stopVoice` sets `voiceError = VOICE_FIRST_ALLOW` whenever `!heardStart`, so a normal fast release shows the permission sentence even when the mic was already allowed. Web Speech in Chrome posts audio to Google. The comment above `mountDesk` says nothing is stored on the server, which is true of this desk and false of the speech service. `packages/app/src/ptt.ts` still documents whisper.cpp and is not called by the desk. Firefox gets `VOICE_UNSUPPORTED` with no local fallback.

Fix: update the textarea and notice in place. Do not replace the card on interim results. `setPointerCapture` on pointerdown. Track pointer-held separately from recognition, and restart on `onend` while held. On stop, abort after 400ms if `onend` has not fired. Show the Allow copy only on `not-allowed`. Label the button "Hold to talk. Chrome sends this audio to its speech service." Offer whisper when `SpeechRecognition` is missing.

### Medium

**5. Windows cannot CreateProcess a `.cmd`, so tools and deploy fail after a yes.**
`packages/cli/src/commands/tools.ts` `defaultRun` sets the binary to `pnpm.cmd` on win32 and spawns with `shell: false`. Node returns EINVAL. The install looks like exit 127. `packages/deploy/src/cli-run.ts` `cliPlan` returns `vercel`, `netlify`, or `wrangler`, and `runCli` passes that to `spawnImpl`. Those CLIs are `.cmd` shims on Windows. `spawn` does not apply PATHEXT. Deploy fails after the user said yes, and the error is only `${command} exited ${status}`.

`packages/cli/src/doctor.ts` `spawnCommand` has the same `shell: false` probe. `grok --version` returns EINVAL, then `probeGrok` falls through to `where.exe` and reports grok on PATH with version null. The session probe is skipped.

Fix: share `grok-cli.ts` `launch`'s cmd wrapper, or resolve the `.exe`. Always set `windowsHide`.

**6. A locked interview file becomes the same save error.**
`packages/engine/src/interview.ts` `persistPair` writes a temp file and renames over `interview.json` and `STATE.md`. On Windows, rename over a file locked by Defender or another `hh` process throws EPERM or EBUSY. `packages/engine/src/lock.ts` `isPidAlive` treats any `process.kill(pid, 0)` error other than `ESRCH` as alive, so EPERM (access denied, or a recycled pid) holds the lock until `STALE_LOCK_MS` (30s). `LockHeld` is not an `InterviewError`, so `turnError` hides it.

Fix: on win32 EPERM/EBUSY, retry the rename, then unlink the destination and rename. Map `LockHeld` to "Another Guide process is writing. Wait a moment."

**7. `%` in an answer can expand inside the grok cmd line.**
`packages/engine/src/ai/grok-cli.ts` `quoteCmdArg` quotes spaces and `&|<>^()%!`` but not `%`. `planGrokCall` puts the prompt in `-p` or `--single` unless it is large enough for `--prompt-file`. Inside `cmd /c`, `%VAR%` still expands in quotes. A `%` in an answer can break the command line.

Fix: always pass the prompt via `--prompt-file` on win32. Escape `%` as `%%` if a cmd shim is unavoidable.

**8. The crawler will fetch loopback, RFC1918, and the cloud metadata address.**
`packages/crawler/src/thumbnails.ts` `isPublicHttp` only checks that `parseHttpUrl` accepted http(s) with no userinfo. `packages/crawler/src/crawl.ts` follows redirects with a scheme check and no private-host check. An imported or gallery URL can make the desk GET `http://169.254.169.254/` or `http://127.0.0.1`.

Fix: reject loopback, link-local, private, and metadata addresses on the initial URL and on every redirect hop. Resolve DNS before the fetch and pin that address.

### Low

**9. Reference cards navigate away from the interview.**
`packages/app/src/server/routes.ts` `renderLiveExtras` emits gallery cards as same-tab `<a href>`. A click leaves the desk. The gallery walk (`packages/app/src/gallery/walk.ts`) already uses `target="_blank"`. Use that, with `rel="noopener"`, on the interview cards too.

**10. Mostly Harmless can pop a browser.**
`packages/qa/src/playwright-opener.ts` `withChromium` calls `chromium.launch`. Set `headless: true` explicitly so a headed channel on Windows does not open a window during the gates.

## 2. Windows-specific

The window bug is two spawn paths, not the browser reloading the page.

- `open-browser.ts` `openBrowser`: `detached: true` plus `start` without a verbatim empty title. One console and one browser window per desk start.
- `grok-cli.ts` `launch`: one cmd console per Guide call while answering. This is the "keeps opening" path.
- `tools.ts` `defaultRun` and `deploy/src/cli-run.ts` `runCli`: `.cmd` with `shell: false` fails with EINVAL after the user said yes.
- `doctor.ts` `spawnCommand`: same EINVAL, then a misleading "grok on PATH, version null".
- `lock.ts` `isPidAlive` and `interview.ts` `persistPair`: EPERM means "alive" for the lock, and a locked rename becomes the save error. PID reuse on Windows makes a dead lock look live for up to 30 seconds.
- `quoteCmdArg` does not stop `%` expansion.
- Path handling elsewhere is careful: `install.ts` realpath-checks the destination, upload names are leaf-only, gallery shot reads are jailed to the cache. Line endings were not a defect in the paths I read.

## 3. Interview flow, start to deploy

The desk blames the person when the system failed.

- Answer, skip, and suggest all go through `turnError`. A quiet Guide (`GrokUnavailableError`) is handled inside `askGuide` and shows `CALM_MESSAGE`. A cassette miss, a lock, and a rename failure do not, and all three look like a lost answer.
- After a post-save throw, the in-memory session is stale. Retry can say the question is no longer on the desk, which is also shown as a save failure.
- `desk.ts` SSE `error` listener is empty. A dead desk looks idle. There is no "Guide is thinking" state, so a slow think and a hung recognition look the same.
- Express writes skipped assumptions in `seedExpressAssumptions` before the first card. Those only come back at Before we jump. That is by design, but nothing on the card says so.
- `safePromptLine` in `live-turn.ts` replaces a whole fact with `(omitted)` if it contains `spectrum`, `disorder`, `autism`, `!`, or an em dash. A business that says "spectrum of services" disappears from the prompt. The stored answer is intact. The model never sees it.
- Hold to talk never reaches `ptt.ts` or whisper. Offline and Firefox are a dead button.
- Deploy is yes-gated in `packages/deploy/src/cli-run.ts` (a declined yes returns before spawn). A failed CLI only says `exited N`, with no next step, and on Windows it fails before the host is contacted. Hostinger stays keychain-only, which is the right boundary.

## 4. Security

Real issues:

- Crawler SSRF, item 8 above. The desk binds to `127.0.0.1` and checks Host, so this is the local process fetching internal addresses, not a remote RCE.
- `%` expansion on the grok cmd line, item 7. The prompt is user text. That is the one injection path. `runCli` and `tools` otherwise keep argv arrays and `shell: false`.
- Web Speech uploads the microphone stream to Google. CSP `connect-src 'self'` does not cover it. The local-first claim in the desk comment is wrong for this path.

Checked and intentionally hardened, not bugs: `install.ts` refuses a copy that leaves the project and realpath-checks `.grok`. `uploads.ts` `acceptUpload` leaf-names, blocks `html`/`js`/`exe`, and caps size. SVG is allowed on disk and not given a route. `xai-stt.ts` requires https, refuses credentials in the URL, and redacts the key. Imagine and Hostinger do not read a project file for the token. CSRF is required on the turn routes. OAuth redirect is loopback-only. Logo and model paths refuse `packages/`. Zip extract uses a safe path. No `shell: true` in the app or engine spawn sites I read.

## 5. Ten changes that would make a first run feel finished

1. Open the desk once, with a verbatim loopback `start` or `rundll32`, and print the URL in the same sentence. Never a console.
2. Spawn `grok.exe`, not `grok.cmd`. No window per answer.
3. Split "saved" from "the Guide could not phrase the next question." Reload the interview from disk after a model failure. Never say the answer did not save unless the write threw.
4. On a cassette miss or a quiet Guide, stay on the tree question and say so in the card, not in stderr.
5. Hold to talk that does not destroy the button, restarts while the pointer is down, and says Chrome sends audio out. Whisper as the offline fallback the server path already has.
6. A phase line on the card: Don't Panic, question 4 of 18, Guide thinking. The map is not enough when the model is slow.
7. If the question id is stale, reload the session and show the real next question instead of a 409 that looks like a lost answer.
8. `hh doctor` on Windows that runs the real grok binary and says "signed in" or "run grok login" before the first answer, so the first turn is not an auth browser.
9. Deploy failure that names the missing CLI, the Windows shim, and the exact next command, after the yes gate. A yes that then exits 127 feels like the deploy ran.
10. Gallery cards that open beside the interview, not instead of it, with the shot already cached so the walk does not navigate away.