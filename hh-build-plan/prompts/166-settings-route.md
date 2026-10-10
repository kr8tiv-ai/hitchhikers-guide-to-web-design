---
id: "166"
kind: build
phase: so-long-and-thanks-for-all-the-fish
slice: Don't Panic Release
title: "Add the /settings route with the xAI STT rate quote"
tier: Heart of Gold
effort: xhigh
model: grok-4.7
depends_on: ["165"]
files: ["packages/app/src/server/routes.ts", "packages/app/src/server/settings.ts", "packages/app/test/settings.test.ts", "packages/voice/src/xai-stt.ts"]
review_checkpoint_embedded: false
---

# 166. Add the /settings route with the xAI STT rate quote

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

- The desk keeps its cream editorial look. No new palette, no gradients, no exclamation marks in copy.
- Every UI change ships with a test against rendered HTML (or the route response), plus a note on 375 and 1440 widths. If no browser is available, say so; do not claim a visual pass.
- Settings lives in a Desk menu, not a seventh nav item. Do not change the six-item nav.
- xAI STT stays disabled until the user accepts the quote. Default is off.

## Goal

Add `/settings` in packages/app/src/server/routes.ts, reached from a Desk menu. It holds voice, model, effort, and the xAI STT rate quote read from packages/voice/src/xai-stt.ts ($0.10/hr REST, $0.20/hr streaming; import the constants, do not retype them). The server refuses to enable xAI STT until the user has accepted the quote.

## Why this prompt exists

Voice cost is real money; the user must see the rate before turning it on, and settings need a home that does not crowd the nav.

## Read first

- hh-build-plan/CONTEXT-PACKAGE.v2.md
- DECISIONS.md and context/matt-answers.md (authority)
- packages/app/src/server/routes.ts, packages/app/src/server/card.ts, packages/app/src/client/desk.ts
- packages/app/src/design/ (tokens, type, components)
- the existing app tests under packages/app/test/
- packages/voice/src/xai-stt.ts
- existing config handling in packages/app and packages/engine

## Files to create or change

- `packages/app/src/server/routes.ts`
- `packages/app/src/server/settings.ts`
- `packages/app/test/settings.test.ts`
- `packages/voice/src/xai-stt.ts`

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Non-goals

- No new nav item.
- No change to the STT client itself beyond exporting the rate constants if they are not exported.

## Steps

1. Verify first. Before editing, read the current code and the later prompts and once-over/review notes (hh-build-plan/reviews/, hh-build-plan/prompts/159-once-over.md, git log). Decide per must_have whether the defect still exists. If a must_have is already satisfied by the current code and has a test, change nothing for it and record "already fixed: <evidence>" in the summary. Do only what is still needed. If everything is already satisfied, make no code change, write the summary, and commit it with the commit line below.
2. Check whether a settings surface or config key already exists; reuse the existing config store.
3. Add the route, the Desk menu entry, and the accept-quote flow (POST stores acceptance with the quoted rates).
4. Route tests: GET shows both rates from the constants; enabling without acceptance is refused with a clear status; enabling after acceptance works; nav still has six items.
5. Run verification.

## Acceptance criteria

- [ ] GET /settings renders voice, model, effort, and both STT rates from xai-stt.ts.
- [ ] Enabling xAI STT without accepting the quote is refused.
- [ ] The nav has no seventh item; settings is under the Desk menu.

## must_haves

truths:

- GET /settings renders voice, model, effort, and both STT rates from xai-stt.ts.
- Enabling xAI STT without accepting the quote is refused.
- The nav has no seventh item; settings is under the Desk menu.

artifacts:

- packages/app/test/settings.test.ts

key_links:

- Rates shown come from the voice package constants.

prohibitions:

- Do not push, deploy, or create a remote.
- Do not weaken an approval gate (brief approval, prompt approval, Elevate, Hostinger yes).
- Do not restyle: keep the cream editorial desk, the rust rule, and the Don't Panic wordmark.
- Do not start the next prompt.

## Verification

```powershell
pnpm --filter @hitchhiker/app test
pnpm exec tsc -b --pretty false
pnpm --filter @hitchhiker/voice test
```

## Report back

Put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/166.md` if that directory exists. The summary names, per must_have, "already fixed" or "fixed now" with evidence, files changed, tests run, and anything assumed.

## Commit

```
feat(app): add the settings route and the xAI STT quote gate
```
