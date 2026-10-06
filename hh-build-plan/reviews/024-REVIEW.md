# 024 Review — prompts 021, 022, 023

Verdict: **PASS**

Reviewed: 2026-10-06. Fresh session. No fix commits. No source changes in this review.

HEAD reviewed: `41abc75` (`feat(voice): quote and call opt-in xAI STT`).

This verdict is the nine must-have truths below, each with a test name or a file line, plus the verification commands. It is not a general impression of the tree. Where a goal sentence disagrees with the same prompt's steps, the conflict is written under Authority.

## History

Three build commits, in order, on top of `5cd3e1d`. Messages match the prompt commit lines. They are not squashed. History was not rewritten.

| Order | Commit | Message | Prompt commit line |
| --- | --- | --- | --- |
| 1 | `1d384e2` | `feat(persona): add the Guide interviewer system prompt` | same |
| 2 | `121b958` | `feat(voice): add a local whisper.cpp wrapper` | same |
| 3 | `41abc75` | `feat(voice): quote and call opt-in xAI STT` | same |

Parents: `1d384e2` is `5cd3e1d`, `121b958` is `1d384e2`, `41abc75` is `121b958`.

## 021 Write the Guide persona system prompt

### Truths

- The persona is precise without naming a diagnosis. `packages/grok-plugin/skills/guide-persona/SKILL.md` line 7 says the Guide is precise and pattern-noticing, loves lists and systems, and gives the literal example `2026-modern, mid-century-modern, or Tron-modern?` plus the pattern line `you said calm four times and sent three neon sites`. Line 19 caps an info-dump at three sentences. Line 23 says never diagnose, never joke about a diagnosis, never perform a stereotype, and never name a condition. A scan of the skill finds none of `autistic`, `autism`, `asperger`, `disorder`, or `spectrum`. Test `a diagnosis joke and an exclamation mark are refused` requires `assertPersonaSafe` to throw `PersonaError` reason `autism` on a joke fixture that lives in the test, and reason `exclamation mark` on `Lovely work!`. Test `spectrum, an em dash, and a third Don't Panic are refused` requires a throw on `broad spectrum of clients`, on `autistic`, `asperger`, `disorder`, and `AUTISM`, and on an em dash. Test `the skill is under 800 words and has no effort frontmatter` runs `assertPersonaSafe` on the skill file itself.
- One question is enforced by appending the id, not by hoping. `buildSystemPrompt` in `packages/engine/src/persona.ts` reads the skill from the path argument and appends a fenced block with `Current question id:` and `Ask:` taken from `ctx.question`. Express adds `This is Express. Ask only this question, then move on. Do not open a side lesson.` The function calls `assertPersonaSafe` on that string before it returns. Test `DP-2.1 prompt carries the tree id, the ask, and Answer, Suggest, Skip` builds the prompt for the tree question `Why are you building this website, in one sentence?` and requires `Current question id:`, `DP-2.1`, that ask, `Answer`, `Suggest for me`, and `Skip`. Test `Express adds one line and Deep does not` requires the Express line only on depth `express`.
- The interviewer is text-only. `SKILL.md` line 9: `You are text only. You do not use text-to-speech. You do not describe a voice performance. You never promise a spoken reply.` The same paragraph says a spoken user still gets a text reply, and that the skill does not collect an API key. Test `the skill states text only, SuperGrok, and the curated pack` requires the skill to contain `text-to-speech`, `voice performance`, `SuperGrok`, and `API key`. `persona.ts` has no `fetch` and no `think(`. The engine suite still skips `live smoke returns a two-field object` unless `HH_LIVE=1`.

### Also checked

- The skill file is 657 words by a whitespace split, and the body under the frontmatter is 605. Both are under 800. Frontmatter is `name`, `description`, and `when-to-use`. The word `effort` is absent. `Don't Panic` appears once, as the phase name. Test `spectrum, an em dash, and a third Don't Panic are refused` allows one and two uses and throws on the third.
- The skill includes Answer, Suggest for me, and Skip; two Godly references and two Awwwards references as a method; the curated pack when the user has no URLs; a ban on invented testimonials, prices, and search volumes; a ban on quoting the novel; the v2 section 14 word list; two pushes then a soft mark; a three-line "Here is what I heard" about every eight questions; a module-end field summary; level read from `PROJECT.md`; the user's language; `happy with this?` and an offer to improve the asset. Test `the skill states text only, SuperGrok, and the curated pack` requires the Godly, Awwwards, curated-pack, happy-with-this, and soft-mark phrases.
- `buildSystemPrompt(skillPath, ctx)` takes the path so the engine does not import `@hitchhiker/grok-plugin`. Test `engine source does not import grok-plugin` walks `packages/engine/src` and requires that import to be absent, and requires the engine `package.json` to omit that dependency. The function is exported from `persona.ts`. The engine barrel does not re-export it. Prompt 021's file list does not include `packages/engine/src/index.ts`.
- `interview/tree.yaml` contains none of the diagnosis words, no exclamation mark, and no em dash, so a built prompt for a real tree question is not refused for those characters. Test `an unsafe coverage line is refused on the built prompt` shows a coverage line with an em dash still fails the gate.

## 022 Wrap whisper.cpp for local push-to-talk

### Truths

- Local transcription does not bundle weights. `git ls-files` for `*.bin`, `*.gguf`, and `*.ggml` in this range returns only two pre-existing vendor fixtures under `vendor/gsd-core/tests/fixtures/base64-locale/`. `packages/voice` has no weight file. `assertModel` in `packages/voice/src/whisper.ts` throws `WhisperError` when the model path is inside the repo's `packages/` directory, before it looks at the file. Test `a model path inside packages/ is refused before the runner` requires code `FAILED`, a message that names `packages`, and zero runner calls. Test `README names the env vars and says weights are not in git` requires `weights are not in git` and `not bundled`. `NOTICE` lines 94–101 record whisper.cpp as MIT, optional, and not distributed, and say no model weights ship in git. Test `NOTICE records the optional whisper.cpp binary` requires that sentence.
- The child is spawned without a shell. `spawnWhisper` calls `spawn(bin, [...args], { shell: false, windowsHide: true, ... })`. `buildArgs` returns an array: bin, `-m`, model, `-f`, wav, `-nt`, `--no-timestamps`. Test `buildArgs keeps shell metacharacters in one argv entry` requires that array for a path containing spaces, `&`, `;`, and `$(rm)`, requires the source to contain `shell: false`, and requires the source to contain `spawn(` and no `exec(`. Test `the default runner collects stdout with shell off` spawns `process.execPath` with an argv array and requires `{ text: "hello from the mic", engine: "local" }`.
- Failure is a typed error, not a paid fallback. `WhisperError.code` is `MISSING_BIN`, `MISSING_MODEL`, `BAD_AUDIO`, `FAILED`, or `TIMEOUT`. Test `a missing bin throws MISSING_BIN and does not call the runner` requires that code and zero runner calls. Test `a runner exit of 1 throws FAILED with stderr clipped and no env dump` requires `FAILED`, a 500-character stderr clip, and no environment dump. Empty stdout with code 0 is `FAILED`. A 0-byte wav is `BAD_AUDIO` before the runner. `http:` and `https:` wav paths are `BAD_AUDIO`. A hung child is `TIMEOUT`. `whisper.ts` does not import `xai-stt.ts` and does not call `fetch`. Test `the package source has no fetch and no paid host` requires `whisper.ts`, `src/index.ts`, and `README.md` to omit `api.x.ai` and `fetch(`, and requires the whisper source to omit `winget`, `apt-get`, and `brew`.

### Also checked

- `resolveWhisperPaths` reads `WHISPER_CPP_BIN`, then `whisper-cli` or `main` on `PATH` (`.exe` names on Windows), and `WHISPER_CPP_MODEL`. Test `resolveWhisperPaths reads the env vars and then PATH` and test `linux and macOS candidate names have no exe suffix` cover that. A missing env value throws the typed code and does not spawn.
- The default timeout is 60 seconds (`DEFAULT_TIMEOUT_MS`). The timeout path calls `child.kill("SIGKILL")`, and on Unix it signals the process group first. Test `a hung child is killed and reported as TIMEOUT` requires `TIMEOUT` in under 5 seconds.
- README names Windows, macOS, and Linux, says Homebrew is not required, documents `--output-txt` as an upstream flag this wrapper does not pass, and states the local path costs $0 and no audio leaves the machine.
- `packages/voice/package.json` is outside the prompt file list. The test script was `node -e "process.exit(0)"`. Prompt 022's verification command is `pnpm --filter @hitchhiker/voice test`, so the commit replaces that script with `node --experimental-strip-types --test test/**/*.test.ts`. The commit names the file. That is the harness change the prompt allows. It is not a new feature.

## 023 Add an opt-in xAI speech-to-text adapter

### Truths

- xAI STT is opt-in and quoted. `quoteStt` returns `{ usd, ratePerHour, mode, label }` and does not call the network. REST is $0.10 per hour and streaming is $0.20 per hour, from the 2026-09-29 card in `hh-build-plan/RESEARCH-ADDENDUM.md` (speech to text: $0.10 / hour REST, $0.20 / hour streaming). Test `REST and streaming quotes use the addendum hourly rates` requires 3600 seconds to quote `0.1` and `0.2`, and requires the label to contain `$0.10` or `$0.20`, `per hour`, and the mode, and to omit `free`. `transcribeAt` calls `quoteStt` before `fetchImpl`. Test `the injected fetch receives the fixture endpoint and the bearer key` requires the returned `quote` to equal `quoteStt({ seconds: 1, mode: "rest" })`. `createXaiTranscriber` does not run at import. Test `import does not build a transcriber or read an API key` requires no call to `createXaiTranscriber(` outside the function declaration. `assertLocalDoesNotUseXai` throws when `voiceEngine` is `local` and the value is an xAI transcriber. Test `voiceEngine local rejects an xAI transcriber and ignores other functions` requires that throw, allows `voiceEngine: "xai"`, and allows `local` with no transcriber. `packages/engine/src/config.ts` still defaults `voiceEngine` to `local`. Nothing outside `packages/voice` calls `createXaiTranscriber`.
- The key is an argument, never a source literal. `transcribeAt` reads `req.apiKey` and sends `Authorization: Bearer`. The file comment says the library does not read `XAI_API_KEY` or `process.env`. Test `import does not build a transcriber or read an API key` strips comments and requires the remaining source of `xai-stt.ts` and `index.ts` to omit `XAI_API_KEY`, `process.env`, and `console.`. Test `the injected fetch receives the fixture endpoint and the bearer key` passes `fixture-key-hh-023-do-not-leak` as the argument and requires that bearer. Test `a failed response does not echo the API key` puts the key in the response body and `statusText` and requires the thrown message to omit it. Test `a fetch error that contains the key is redacted` requires `[redacted]` in place of the key.
- There is no text-to-speech function in this package. `packages/voice/src` exports `transcribe`, `quoteStt`, `createXaiTranscriber`, and `assertLocalDoesNotUseXai`. A search of `packages/voice` for `textToSpeech`, `speechSynthesis`, and a TTS function finds only the negative assertion in the test. Test `import does not build a transcriber or read an API key` requires `xai-stt.ts` and `index.ts`, with comments stripped, to omit `textToSpeech`, `speechSynthesis`, `text-to-speech`, and `tts`.

### Also checked

- The local docs in `context/sources/xai/model-capabilities_audio_speech-to-text.md` name `POST https://api.x.ai/v1/stt` and model `grok-voice-transcribe-2.0` as multipart form fields, with `file` after `model`. `XAI_STT_ENDPOINT` is that URL. It is a constant. Import does not request it. Test `a caller-supplied https endpoint is the one that is posted` posts the caller's URL. An empty endpoint throws at creation. `http:` throws. Test `an empty or http endpoint throws before a transcriber exists` covers both.
- `fetchImpl` is required. Test `fetchImpl is required and global fetch is not a fallback` stubs `globalThis.fetch`, omits `fetchImpl`, and requires zero global calls. The test suite does not call the live API.
- A 1-second REST clip is `0.0001`. Exact 4-decimal rounding of `1/3600 * 0.10` is `0.0000`. The prompt also says a 1-second clip must not quote as $0. The code keeps a positive amount that would round to `0.0000` at `$0.0001`. Test `a 1-second clip still quotes above zero` locks that floor. Nine seconds of REST is `0.0003`, which is half-up to 4 decimals (`a half unit of a cent rounds half up`). Zero, negative, and non-finite durations throw.
- The 022 tests still pass inside the same voice run, including `the package source has no fetch and no paid host`. That test reads `whisper.ts`, `index.ts`, and `README.md`. `index.ts` re-exports the adapter and does not call `fetch`. The host string lives in `xai-stt.ts`, which 023 was required to add.

## File list

`git diff --name-only 5cd3e1d..HEAD`:

- `NOTICE` (022)
- `packages/engine/src/persona.ts` (021)
- `packages/engine/test/persona.test.ts` (021)
- `packages/grok-plugin/skills/guide-persona/SKILL.md` (021)
- `packages/voice/README.md` (022)
- `packages/voice/package.json` (022 harness, named in that commit)
- `packages/voice/src/index.ts` (022, then 023 exports)
- `packages/voice/src/whisper.ts` (022)
- `packages/voice/src/xai-stt.ts` (023)
- `packages/voice/test/whisper.test.ts` (022)
- `packages/voice/test/xai-stt.test.ts` (023)

No extra feature. Nothing to revert. No client site, no new remote, no `@theatre/studio`, no committed whisper weights, no TTS module.

## UI

No file under `packages/app/` changed in `5cd3e1d..HEAD`. This group has no screen to open. There is no 375 or 1440 capture for these prompts, and no visual pass is claimed.

The skill is a system prompt, not an app screen. It lists the section 14 banned words as words the Guide must not say, contains no exclamation mark, and contains no em dash. `assertPersonaSafe` rejects those characters in the built prompt.

## Live Grok

021 says not to wire the skill to a live Grok call. `persona.ts` only reads the skill file and appends the question. The interview still stores Suggest from the tree. D-003's live interview call remains prompt 035, through the 011 adapter. Nothing here left a scripted answer in place of a call these prompts asked to make.

022 spawns a local process. It does not call a model.

023 is speech-to-text, not a chat completion. The local xAI doc names `https://api.x.ai/v1/stt`. The adapter posts there only when the caller passes the endpoint, the key, and `fetchImpl`. Tests inject `fetchImpl` and a fixture key. They do not call the network. The 011 adapter is the structured `think` path. This prompt does not ask STT to go through it. The engine live-smoke test stayed skipped.

## Authority

Matt Q8 calls the interviewer "a bit autistic and fun" and says replies are text, with no text-to-speech. CRITIQUE's persona guardrail and v2 section 6 (IMP-14) say the safe implementation is precision, pattern-noticing, and lists, and that the prompt must also say never joke about autism. Prompt 021 forbids the words `autistic`, `autism`, `Asperger`, `disorder`, and `spectrum` anywhere in the skill, including inside that prohibition sentence. The review truth for 021 is "precise without naming a diagnosis." The skill follows that truth and prompt 021: it states the precise behaviors and says never diagnose, never stereotype, and never name a condition. Putting "never joke about autism" in the skill would fail `assertPersonaSafe`. This review does not add the word.

v2 section 6 also says one question at a time, except Express module-3 batching. Prompt 021 and its truth require the current id to be appended, and the Express line says to ask only that question. The built prompt follows 021. Module-3 batching is not implemented here.

Matt Q11 says offer to elevate a provided asset. v2 section 6 says offer to improve it, and says not to use the banned word "elevate" in sentences. Prompt 021 says the same, and the skill says `happy with this?` and offer to improve it. The word `elevate` appears only inside the "do not say" list. That matches v2 section 6 and the prompt.

Prompt 022's goal asks for an `hh voice setup` downloader: explicit yes, official binary, `base.en` or `small`, checksum, `os.homedir()/.hitchhiker/voice/`, licences in NOTICE, and an injected downloader. The same prompt's context says the user downloads the model and this prompt does not pick a weight file. The interface block, the nine steps, and the file list have no setup function. The prompt also says not to invent an API. The implementation follows the steps: env paths, spawn, typed errors, NOTICE line, no download. Tests inject a runner, not a downloader. Adding the setup helper would be a new surface (download, checksum, home-directory store, a yes gate) outside the file list. This review does not add it and does not mark the nine truths failed. Prompt 041 expects the wrapper and a soft failure when the binary is absent. `MISSING_BIN` is that failure.

## Notes for later prompts

These are not failed truths.

- `buildSystemPrompt` is not on the engine barrel. A later prompt that calls it from another package needs a one-line export, or it should import the module the test imports.
- The interview does not load the skill yet. Prompt 035 is the live persona.
- `packages/voice/README.md` line 9 says this package does not call a paid speech API. After 023, the local transcriber still does not, and it still does not fall over. The opt-in adapter in `xai-stt.ts` does call xAI when the caller invokes it. The 022 test `the package source has no fetch and no paid host` forbids the host string in the README, so 023 left the file alone. A later edit can say the local path stays local, without putting `api.x.ai` or `fetch(` in that file, or it can update the test and the README together.
- Quote rounding uses a `$0.0001` floor when 4-decimal half-up would be `0.0000`. The 1-second edge case requires a non-zero quote. The 3600-second rates stay `0.10` and `0.20`.
- `publicError` redacts a key only when the key is at least 12 characters. The failed HTTP path never copies the response body into the error. The specified test uses a long fixture key and a body that contains it.
- Express does not batch module 3. See Authority.
- The engine live-smoke test stays skipped unless `HH_LIVE=1`.

## Verification

Run from the repo root on 2026-10-06.

| Command | Result |
| --- | --- |
| `Test-Path hh-build-plan/reviews/024-REVIEW.md` | True after this file is written. |
| `pnpm --filter @hitchhiker/engine test` | 150 passed, 0 failed, 1 skipped (`live smoke returns a two-field object`). Exit 0. |
| `pnpm --filter @hitchhiker/voice test` | 43 passed, 0 failed. Exit 0. |

Node printed `NO_COLOR` / `FORCE_COLOR` warnings. They did not fail the runs.

The engine count is the previous 141, plus the 9 persona tests. The voice count is the 25 whisper tests plus the 18 xAI tests. Earlier cassette, config, lock, state, template, boundary, workspace, interview, and pushback tests still pass. No test was weakened.

## Scope

No new feature. No fix commit. Prompt 025 was not started. Nothing was pushed, deployed, or published.
