---
id: "178"
kind: build
phase: so-long-and-thanks-for-all-the-fish
slice: Forty-Two
title: "Voice with no API spend by default"
tier: Heart of Gold
effort: xhigh
model: grok-4.7
depends_on: ["177"]
files: ["packages/voice/", "packages/app/src/", "packages/app/e2e/", "docs/voice.md"]
review_checkpoint_embedded: false
---

# 178. Voice with no API spend by default

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


Additional rules for this session only:

- Fix root causes. Never weaken, skip, delete, or loosen a test or an assertion to get green. A test may change only when it asserts something the product intentionally changed, and then the new assertion must be at least as strict and the summary must say why.
- The driver pushes after checkpoints. You do not push, and you do not run `gh` against the network.
- Playwright runs use the existing app e2e setup in packages/app/e2e/. Fixtures and cassettes only. No live xAI or other paid API call in any test or script.
- Zero paid calls by default. No test, script, or default code path may call a paid STT, TTS, or LLM endpoint. Opt-in paths are covered by fakes only.
- Keep the rate-accept gate from prompt 166 intact; read it before editing and reuse it. Do not weaken it.

## Goal

Guarantee that hold-to-talk and conversational voice work with NO paid API call by default. The default engine is the browser Web Speech API (Chrome and Edge). An optional local whisper engine is used only if it is installed. The xAI STT engine is strictly opt-in and sits behind the rate-accept gate from prompt 166: no paid endpoint is called unless the user has explicitly enabled it and accepted the rate. Add tests that assert no network request to a paid STT endpoint occurs in default mode. Show a clear in-UI status of which engine is active, and a plain fallback message in browsers without Web Speech support (typed input stays available). Add a note in the docs and the UI help text that browser speech recognition is free to the user but is processed by the browser vendor (for example Google for Chrome, Microsoft for Edge), so audio may leave the device.

## Why this prompt exists

Voice must never create a surprise bill. Default behavior has to be free, honest about where audio goes, and visibly labeled.

## Read first

- packages/voice/src/ (engines, selection, the rate-accept gate from 166)
- packages/app/src/ (hold-to-talk and conversation UI, settings)
- packages/app/e2e/ (existing voice specs and network helpers)
- docs/ (existing voice docs) and DECISIONS.md and context/matt-answers.md (authority)

## Files to create or change

- packages/voice/src/ engine interface, web-speech engine, optional local whisper detection, xAI engine behind the gate
- packages/app/src/ engine status label and unsupported-browser fallback message
- packages/voice/test/ and packages/app/e2e/voice-no-spend.spec.ts
- docs/voice.md (engines, defaults, opt-in, privacy note)

## Non-goals

- No removal of the xAI engine; it stays, opt-in only.
- No weakening of the rate-accept gate.
- No new dependency; local whisper is detected on PATH or by config, never installed or downloaded by the app.
- No live audio or network call in tests.

## Steps

1. Verify first. Before editing, read the current code and the git log. Decide per must_have whether the defect still exists. If a must_have is already satisfied by the current code and has a test, change nothing for it and record "already fixed: <evidence>" in the summary. Do only what is still needed. If everything is already satisfied, make no code change, write the summary, and commit it with the commit line below.
2. Audit the current default engine and every code path that can reach a paid endpoint. List the endpoints (hostnames and paths) in the summary.
3. Make the engine selector deterministic: default `web-speech` when `SpeechRecognition` or `webkitSpeechRecognition` exists; else `local-whisper` if detected; else `none` with the fallback message. `xai` is chosen only when the setting is enabled AND the rate-accept gate is accepted; any other state falls back to the default.
4. Add a central guard that throws before any request to a paid STT endpoint unless the opt-in state is true. Route every paid call through it.
5. Write unit tests for the selector and the guard, including: default mode, gate not accepted, gate accepted but setting off, both on.
6. Write `e2e/voice-no-spend.spec.ts`: in default mode, stub the Web Speech API, run hold-to-talk and a conversational turn, record all network requests with `page.on("request")` and `page.route`, and assert none targets a paid STT host (xAI and any other known STT host). Add a second case with Web Speech missing: assert the fallback message shows, typing works, and still no paid request.
7. In the UI, show the active engine label near the voice control (for example "Voice: browser (free)", "Voice: local whisper", "Voice: xAI (paid, accepted)"), updated live, readable at 375 and 1440, in light and dark, with no exclamation marks.
8. Write the browser-vendor privacy note in docs/voice.md and in the voice help text. Run the full verification list.

## Acceptance criteria

- [ ] Default mode never contacts a paid STT endpoint, proven by unit tests and the e2e request assertion.
- [ ] Web Speech API is the default; local whisper is used only if installed; xAI only when enabled and accepted through the 166 gate.
- [ ] The UI always names the active engine.
- [ ] Unsupported browsers show a clear fallback and typed input still works.
- [ ] The browser-vendor privacy note is in the docs and the UI help.
- [ ] The rate-accept gate is unchanged in strictness.

## must_haves

truths:

- No paid endpoint is called by default.
- xAI STT is opt-in behind the rate-accept gate.
- The active engine is visible in the UI.
- Tests assert no paid request in default mode.

artifacts:

- packages/voice engine selector and paid-call guard
- packages/app/e2e/voice-no-spend.spec.ts
- docs/voice.md

key_links:

- Every paid STT call goes through the guard.
- The selector reads the gate state from prompt 166.

prohibitions:

- Do not push, deploy, or create a remote.
- Do not weaken an approval gate (brief approval, prompt approval, Elevate, Hostinger yes).
- Do not restyle: keep the cream editorial desk, the rust rule, and the Don't Panic wordmark.
- Do not weaken, skip, or delete a test.
- Do not start the next prompt.
- Do not edit run-build.ps1.

## Verification

```powershell
pnpm lint
pnpm typecheck
pnpm -r test
pnpm exec tsc -b --pretty false
pnpm --filter @hitchhiker/app e2e
```

## Report back

Put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/178.md` if that directory exists. The summary names, per must_have, "already fixed" or "fixed now" with evidence, files changed, tests run, and anything assumed.

## Commit

```
feat(voice): free Web Speech by default, xAI STT strictly opt-in
```
