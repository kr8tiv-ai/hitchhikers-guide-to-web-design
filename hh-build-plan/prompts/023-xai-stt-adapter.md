---
id: "023"
kind: build
phase: dont-panic
slice: Sub-Etha
title: "Add an opt-in xAI speech-to-text adapter"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["022"]
files: ["packages/voice/src/xai-stt.ts", "packages/voice/src/index.ts", "packages/voice/test/xai-stt.test.ts"]
requirements: ["HH-VOICE-02"]
review_checkpoint_embedded: true
---

# 023. Add an opt-in xAI speech-to-text adapter

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

Call xAI speech-to-text only when voiceEngine is `xai` and XAI_API_KEY is set. Show the rate before the call returns a quote object. Default projects never hit this code. Tests use an injected fetch.

## Why this prompt exists

Some users will want a hosted transcript. The price has to be visible, the key has to stay out of the repo, and the local engine has to remain the default.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/RESEARCH-ADDENDUM.md section 4 (STT rates)
- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 16 and 20
- packages/voice/src/whisper.ts
- packages/engine/src/config.ts

## Files to create or change

- packages/voice/src/xai-stt.ts
- packages/voice/src/index.ts
- packages/voice/test/xai-stt.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

Addendum: REST STT about $0.10 per hour, streaming about $0.20 per hour, on the 2026-09-29 card. Do not invent a newer price. quoteStt({ seconds, mode }) returns `{ usd, ratePerHour, mode, label }`. REST rate 0.10, streaming 0.20. usd is seconds/3600 times the rate, rounded to 4 decimal places. The label is a sentence with the rate and the mode. transcribeWithXai(req, deps) requires deps.apiKey and deps.fetch. It posts to the path you read from the xAI docs in context/sources/xai if a speech endpoint is written there. If the local docs do not name the path, do not invent one: export the quote function and a `createXaiTranscriber(endpoint: string)` that throws if endpoint is empty. The test supplies `https://api.x.ai/v1/stt` as a fixture endpoint the caller passes, and the function uses that string. If the real path differs, a later prompt can change the constant. The body is FormData or the shape the injected fetch asserts. Never log the api key. Read the key from the argument, not from a checked-in file. voiceEngine local must not construct this client. Add assertLocalDoesNotUseXai() that the interview engine can call: it throws if config.voiceEngine is local and someone passed an xai transcriber. Simple guard.

## Interfaces and data shapes

```ts
export interface SttQuote {
  usd: number;
  ratePerHour: number;
  mode: "rest" | "streaming";
  label: string;
}

export function quoteStt(input: { seconds: number; mode: "rest" | "streaming" }): SttQuote;

export function createXaiTranscriber(endpoint: string): (req: { wavPath: string; apiKey: string; fetchImpl: typeof fetch }) => Promise<{ text: string; engine: "xai"; quote: SttQuote }>;
```

## Steps

1. Implement quoteStt. 3600 seconds REST returns 0.10. 0 seconds throws. Negative throws. Streaming uses 0.20.

2. The label contains `$0.10` or `$0.20` and does not say the call is free.

3. createXaiTranscriber returns a function. Empty endpoint throws at creation. The function reads the wav as a Blob or Buffer and calls fetchImpl with Authorization Bearer. The test fetch returns `{ text: 'from the api' }` and asserts the bearer equals the fixture key.

4. If the response is not ok, throw and do not include the key in the error message. Test this with a response whose body contains the key. The thrown Error message must not contain the key.

5. Do not read XAI_API_KEY inside the library. The CLI or app passes it. Document that in a file comment.

6. Add a test that quoteStt(10 seconds, rest) is a small number and the label names per hour.

7. Export quoteStt and createXaiTranscriber from the voice index.

8. Confirm packages/voice/src has no default endpoint that runs at import time.

9. Do not add TTS. If you find a TTS sample in the docs, ignore it.

## Edge cases

- A 1-second clip still quotes. Do not round it to $0.
- fetchImpl is required. Falling back to global fetch in tests is forbidden. In production the app passes global fetch. There is no hidden default in the library function. If fetchImpl is missing, throw.
- endpoint must be https. http throws.

## Acceptance criteria

- [ ] REST and streaming rates match the addendum.
- [ ] The error path does not echo the API key.
- [ ] No transcriber is created at import.
- [ ] Local whisper tests still pass.

## must_haves

truths:

- xAI STT is opt-in and quoted.
- The key is an argument, never a source literal.
- There is no text-to-speech function in this package.

artifacts:

- packages/voice/src/xai-stt.ts

key_links:

- xai-stt.test.ts injects fetchImpl and a fixture endpoint.
- quoteStt rates are 0.10 and 0.20 per hour.

prohibitions:

- Do not call the live API from the test suite.
- Do not add speech synthesis.
- Do not change the local wrapper into a cloud fallback.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/voice test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/023.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(voice): quote and call opt-in xAI STT
```
## REVIEW CHECKPOINT

This build closes a review group. After this commit, the driver runs the fresh-session reviewer prompt `024-review-021-023.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `021` Write the Guide persona system prompt (The Guide, Forty-Two, xhigh)
- `022` Wrap whisper.cpp for local push-to-talk (Sub-Etha, Heart of Gold, high)
- `023` Add an opt-in xAI speech-to-text adapter (Sub-Etha, Gargle Blaster, high)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.
