---
id: "041"
kind: build
phase: dont-panic
slice: Don't Panic Desk
title: "Wire push-to-talk to the local transcriber"
tier: Heart of Gold
effort: high
model: grok-4.7
depends_on: ["022", "031", "034"]
files: ["packages/app/src/ptt.ts", "packages/app/test/ptt.test.ts"]
requirements: ["HH-APP-04"]
review_checkpoint_embedded: false
---

# 041. Wire push-to-talk to the local transcriber

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

Hold-to-talk fills the card draft with a transcript from the injected local transcriber. Releasing the key stops the capture. If the transcriber returns MISSING_BIN, the status line explains how to set the env vars and the draft is unchanged. This prompt does not record real microphone audio in CI.

## Why this prompt exists

Push-to-talk is locked, and it must fail soft when whisper.cpp is absent so a keyboard user is never stuck.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 4
- packages/voice/src/whisper.ts
- packages/app/src/card.ts

## Files to create or change

- packages/app/src/ptt.ts
- packages/app/test/ptt.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

Define PttController with start(), stop(), and a state machine idle | recording | transcribing. Inject `capture(): Promise<{ wavPath: string }>` and `transcribe(wavPath): Promise<{ text: string }>`. The test's capture returns a fake path. stop() awaits transcribe and returns `{ draft: text }`. start() while recording throws. A transcribe error with code MISSING_BIN returns `{ draft: null, warning: 'Local transcriber not installed. Set WHISPER_CPP_BIN and WHISPER_CPP_MODEL, or type instead.' }`. Do not call the xAI adapter from this controller. There is no API key parameter on PttController. Keyboard path remains the card's text field. UI copy for the button is `Hold to talk`. Add it to renderCard only when a flag `voice: true` is passed to a new optional argument. Default false so earlier card tests still match, or update those tests if the button is always present. Prefer always present and update the card test to expect `Hold to talk`. The button is type=button, min-height 44px. No waveform library.

## Interfaces and data shapes

```ts
export type PttState = "idle" | "recording" | "transcribing";

export interface PttDeps {
  capture: () => Promise<{ wavPath: string }>;
  transcribe: (wavPath: string) => Promise<{ text: string }>;
}

export function createPtt(deps: PttDeps): {
  state(): PttState;
  start(): void;
  stop(): Promise<{ draft: string | null; warning: string | null }>;
};
```

## Steps

1. Implement the state machine. start sets recording. stop from idle throws. stop from recording sets transcribing, awaits deps, then returns to idle.

2. Map an error object `{ code: 'MISSING_BIN' }` to the warning string in the context. Other errors return a generic warning `Transcription failed.` and draft null.

3. The test uses deferred promises to assert that state() is transcribing before resolve, if you structure stop that way. If that is racy, assert the call order with an array the fakes push to: capture then transcribe.

4. Add the button to the card HTML and extend the card test.

5. Do not import child_process in the app package.

6. Do not request microphone permission inside the unit test.

7. Write the warning with a period, no exclamation mark.

8. Document in a comment that a later UI may call getUserMedia. This prompt's capture is injected.

9. Export createPtt from the app index.

## Edge cases

- stop() twice concurrently: the second call throws if you set a latch. Test it.
- Empty transcript text returns draft null and warning `Nothing was heard.`
- A wavPath is not written to the DOM.

## Acceptance criteria

- [ ] Call order is capture then transcribe.
- [ ] MISSING_BIN leaves the draft null and names the env vars.
- [ ] The card shows Hold to talk.
- [ ] No xAI import exists in packages/app/src/ptt.ts.

## must_haves

truths:

- Push-to-talk uses the local engine interface.
- A missing binary does not block typing.
- CI does not need a microphone.

artifacts:

- packages/app/src/ptt.ts

key_links:

- createPtt's transcribe argument is satisfied by packages/voice transcribe in the app wiring, not inside the unit test.
- The card button is rendered by renderCard.

prohibitions:

- Do not call api.x.ai from the push-to-talk controller.
- Do not commit audio recordings.
- Do not auto-submit the answer when a transcript arrives. The user still presses Answer.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/app test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/041.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(app): fill the draft from push-to-talk
```
