---
id: "185"
kind: checkpoint
phase: so-long-and-thanks-for-all-the-fish
slice: Forty-Two
title: "Showcase pass: make the Guide spectacular for the Grok team"
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
depends_on: ["184"]
files: ["README.md", "docs/PITCH.md", "docs/assets/", "samples/", "packages/engine/src/", "packages/engine/test/", "packages/cli/src/", "packages/cli/test/", "packages/app/src/", "packages/app/test/", "packages/app/e2e/", "packages/qa/"]
review_checkpoint_embedded: true
---

# 185. Showcase pass: make the Guide spectacular for the Grok team
## RULES

You are Grok (grok-4.7-build-fast) in Grok Build, building The Hitchhiker's Guide to Web Design. This prompt builds the Guide app itself, not a client's website.

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
- No new paid dependencies and no paid services. Demo media comes from the existing Playwright tooling only. Any new package still follows the MIT-compatible rule and gets a NOTICE entry.
- README: keep every existing line and section. Only add (a new demo section, embedded screenshots, a try-it block). Prompt 181 restored it on purpose.
- No breaking change to the project file, save, or resume from 182. Old project files must still open.
- Keep the identity: cream editorial desk, rust rule, Don't Panic wordmark. Polish within it. Do not restyle into something else.
- Voice for docs and UI copy: funny but clear. Jokes never hide the instruction. No exclamation marks in the app UI.
- Verify each must_have by running it. Do not claim a result you did not observe. If something cannot be verified on this machine, say so in the summary.

## Goal

Make the Guide something the Grok team would want to adopt: a stranger clones it, runs one command, and within two minutes sees a polished desk, a working sample project, and a guided tour, with a demo and screenshots in the README to prove it before they even clone.

## Why this prompt exists

The build is feature complete through 184. What is missing is the first impression: the first run, the first five minutes, the empty and failing states, and the pitch. A strong tool with a rough front door gets closed in thirty seconds.

## Read first

- `README.md` (as restored in 181), `docs/` (including `dont-panic.md`, `ci.md`, `improve.md`)
- `packages/cli/src/doctor.ts` and its tests; `packages/app/src/server/` first-run, preflight, and error paths
- `packages/app/src/design/`, `packages/app/src/client/desk.ts`, and the existing Playwright config and e2e in `packages/app/e2e/`
- `packages/qa/` (screenshot and viewport tooling to reuse for the media)
- `packages/engine/src/project-file/` from 182 (the format the sample must use)
- `DECISIONS.md` and `context/matt-answers.md` (authority)

## Files to create or change

- `README.md` (add only), `docs/PITCH.md` (new), `docs/assets/` (generated gif or video and screenshots)
- A one-command entry (a root `package.json` script and, if needed, a small cross-platform node script under `packages/cli/` or `scripts/`)
- `samples/` (a ready-to-open sample project in the 182 project file format)
- `packages/cli/src/doctor.ts` and tests; `packages/app/src/server/` and `src/client/` for the tour, empty states, and friendly errors; `src/design/` for polish using existing tokens
- A media generator script reusing the existing Playwright setup, and tests and e2e for everything above

## Non-goals

- No new paid dependency, no paid or hosted service, no telemetry.
- No breaking change to save or resume, and no change to the project file schema other than additive optional fields.
- No new feature outside first-run, tour, sample, empty states, errors, doctor, docs, and media.
- No approval gate change. No change to run-build.ps1, the driver, or STATE.json.
- Do not start the next prompt.

## Steps

1. Verify first. Read the current code and decide per must_have whether it already holds. Record "already fixed: <evidence>" for any that does and change nothing for it.
2. One-command first run. Prove it from a clean clone: `git clone` the repo into a temp directory (local path is fine), run the single documented command, and confirm the desk opens or prints its URL, with no manual steps in between. Fix whatever breaks (missing build step, wrong script order, Windows path, missing pnpm hint). Document the command at the top of the README try-it block. Test it where possible (a script test that checks the scripts exist and run in order) and record the exact clean-clone result.
3. Doctor that explains fixes. Every failing or missing probe in `hh doctor` prints what it means, why it matters, and the exact fix for the current OS, plus the doc link. Exit codes stay as they are. Add tests for each probe message.
4. Sample project. Add a ready-to-open sample under `samples/` in the 182 format with no secrets and no machine paths. The desk offers Open the sample on the empty state. Add a test that loads it through the real project file loader.
5. Guided first-five-minutes tour. A short, skippable, keyboard-accessible tour on first run (state kept in saved settings, with a Replay tour control). It walks: the desk, the sample, the brief, Suggest, the approval step, and where saves live. Five minutes of real orientation, not a modal wall. Respect reduced motion.
6. Empty states and friendly errors. Audit every screen for the empty case and every error path a new user can hit (no grok, no network, bad project file, port in use, missing browsers). Each shows plain words, what happened, what to do, and a copy or retry control. No stack traces in the UI; the detail stays available behind a Details control.
7. Polished default look. Within the cream and rust identity: spacing rhythm, type scale, focus states, hover and pressed states, loading skeletons, and a considered first screen at 375 and 1440. Use existing design tokens. Anti-slop rules apply.
8. Demo and screenshots. Write a script that drives the desk through the sample with Playwright and produces: an animated gif or short video (a few seconds to under a minute, small enough for a README) and at least four screenshots (desk empty, sample open, tour, phone width). Use only tools already in the repo or MIT-compatible ones; ffmpeg is not required (Playwright video plus a node gif encoder, or a frame sequence, is acceptable). Commit the generated media under `docs/assets/` and keep the total size modest (under 8 MB). Embed them in the README in a new section, adding only.
9. `docs/PITCH.md`: one page. What it is, why it is useful, how to try it in two minutes. Funny but clear, in the project's voice. Link it from the README.
   Community link: add a short, fun Join the community section to the README (add only, in the README's funny voice) pointing to the AntiHero AI Facebook group, https://www.facebook.com/groups/antiheroai. Also mention the group, with the same link, in docs/PITCH.md. Verify by running a search that the URL appears in README.md (for example Select-String -Path README.md -SimpleMatch 'https://www.facebook.com/groups/antiheroai') and record the result.
10. Review as Zaphod would: re-read each truth below against the code and the clean-clone result, run the full suite, fix at most one defect in a `fix(review):` commit. Do not add features during the review.

## Acceptance criteria

- [ ] A clean clone reaches a running desk with one documented command, verified and recorded.
- [ ] The README keeps all prior content, adds the demo and screenshots, and the embedded files exist and load.
- [ ] The first screen at 375 and 1440 looks finished and keeps the cream and rust identity.
- [ ] A first-run tour exists, is skippable, replayable, keyboard accessible, and stored in settings.
- [ ] The sample project opens through the real loader from the empty state.
- [ ] Empty states and errors are friendly, actionable, and hide stack traces behind Details.
- [ ] `hh doctor` explains each problem and the OS-specific fix.
- [ ] `docs/PITCH.md` exists, is short, and is linked from the README.
- [ ] The README has a Join the community section linking to https://www.facebook.com/groups/antiheroai, the link is also in docs/PITCH.md, and a search of README.md confirms the link appears.
- [ ] Old project files still open; no gate, test, or dependency rule was broken.

## must_haves

truths:

- One command takes a clean clone to a running desk, and this was run and observed.
- The README keeps all existing content and adds a demo (gif or short video) and at least four screenshots that exist in `docs/assets/`.
- The default look is polished at 375 and 1440 and keeps the cream and rust identity.
- A guided first-five-minutes tour exists, can be skipped and replayed, and works by keyboard.
- A ready-to-open sample project loads through the real project file loader from the empty state.
- Empty states and errors are clear and friendly with a next step, with no stack trace in the UI by default.
- `hh doctor` explains each failing check and gives the fix for the current OS.
- `docs/PITCH.md` states what it is, why it is useful, and how to try it in two minutes, in the project's voice.
- The README has a short, fun Join the community section (add-only, in the README's funny voice) linking to the AntiHero AI Facebook group https://www.facebook.com/groups/antiheroai, and docs/PITCH.md also mentions the group with the same link.
- No new paid dependency, and no breaking change to save or resume.

artifacts:

- `docs/PITCH.md`, `docs/assets/` (demo and screenshots), README additions
- One-command first-run script and its test
- `samples/` project and its loader test
- Tour, empty-state, and error components with tests and e2e at 375 and 1440
- `hh doctor` messages with tests
- Media generator script
- Summary with the clean-clone transcript (command and result)

key_links:

- README try-it block uses the same command the clean-clone check ran.
- The sample uses the 182 project file loader, not a special path.
- Doctor messages and the desk's tool rows share the probe functions.

prohibitions:

- Do not push, deploy, or create a remote.
- Do not weaken an approval gate (brief approval, prompt approval, Elevate, Hostinger yes).
- Do not delete or rewrite existing README content.
- Do not weaken, skip, or delete a test.
- Do not add a paid dependency or service.
- Do not edit run-build.ps1, the driver, or STATE.json.
- Do not start the next prompt.

## Verification

```powershell
pnpm lint
pnpm typecheck
pnpm -r test
pnpm exec tsc -b --pretty false
pnpm --filter @hitchhiker/app exec playwright test
node --experimental-strip-types packages/cli/src/main.ts doctor
```

Plus the clean-clone run: clone to a temp directory, run the documented one command, confirm the desk responds, and record the transcript. Confirm the README embeds resolve to files that exist and that `git diff` on the README shows additions only.
Also confirm the Facebook group link (https://www.facebook.com/groups/antiheroai) appears in README.md (for example Select-String -Path README.md -SimpleMatch 'https://www.facebook.com/groups/antiheroai' returns a match) and in docs/PITCH.md.

## Report back

Put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/185.md` if that directory exists. The summary names, per must_have, "already fixed" or "fixed now" with evidence, the clean-clone command and result, media files and sizes, files changed, tests run, and anything assumed or left for the owner.

## Commit

```
feat(app): showcase pass with one-command start, tour, sample, demo, and pitch
```