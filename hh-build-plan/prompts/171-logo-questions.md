---
id: "171"
kind: build
phase: so-long-and-thanks-for-all-the-fish
slice: Don't Panic Release
title: "Logo question drop zone and German restatement toggle"
tier: Heart of Gold
effort: xhigh
model: grok-4.7
depends_on: ["167"]
files: ["packages/app/src/server/routes.ts", "packages/app/src/server/card.ts", "packages/app/src/client/desk.ts", "packages/app/test/"]
review_checkpoint_embedded: false
---

# 171. Logo question drop zone and German restatement toggle

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
- Uploads stay inside the project directory. Validate type and size. No remote fetch.

## Goal

Add a file-input drop zone on the logo question ids so a logo can be attached in the interview. If no storage target is feasible in the current code, fix the copy instead so it no longer asks for a file it cannot take, and record that. The German restatement is off by default and appears behind a `Read this in…` toggle.

## Why this prompt exists

The logo question asks for a file with nowhere to put it, and the German restatement clutters every card.

## Read first

- hh-build-plan/CONTEXT-PACKAGE.v2.md
- DECISIONS.md and context/matt-answers.md (authority)
- packages/app/src/server/routes.ts, packages/app/src/server/card.ts, packages/app/src/client/desk.ts
- packages/app/src/design/ (tokens, type, components)
- the existing app tests under packages/app/test/
- the interview question definitions (find the logo question ids)
- packages/engine asset and brand storage

## Files to create or change

- `packages/app/src/server/routes.ts`
- `packages/app/src/server/card.ts`
- `packages/app/src/client/desk.ts`
- `packages/app/test/`

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Non-goals

- No image processing or vectorizing.
- No change to other questions.

## Steps

1. Verify first. Before editing, read the current code and the later prompts and once-over/review notes (hh-build-plan/reviews/, hh-build-plan/prompts/159-once-over.md, git log). Decide per must_have whether the defect still exists. If a must_have is already satisfied by the current code and has a test, change nothing for it and record "already fixed: <evidence>" in the summary. Do only what is still needed. If everything is already satisfied, make no code change, write the summary, and commit it with the commit line below.
2. Find the logo question ids and the existing asset path. Decide feasible or copy-fix and say which in the summary.
3. Implement the drop zone (accessible file input plus drag target) or the copy fix.
4. Make the German restatement hidden by default behind a Read this in… toggle.
5. Tests: logo ids render the file input (or the corrected copy); other ids do not; German text not in the default HTML and the toggle is present; upload rejects wrong type and oversize.
6. Run verification.

## Acceptance criteria

- [ ] Logo question ids offer a file input drop zone, or their copy no longer asks for a file.
- [ ] Uploads are validated and stay in the project directory.
- [ ] The German restatement is off by default behind a Read this in… toggle.

## must_haves

truths:

- Logo question ids offer a file input drop zone, or their copy no longer asks for a file.
- Uploads are validated and stay in the project directory.
- The German restatement is off by default behind a Read this in… toggle.

artifacts:

- app tests for the drop zone and the toggle

key_links:

- Drop zone writes where the brand plate reads logos from.

prohibitions:

- Do not push, deploy, or create a remote.
- Do not weaken an approval gate (brief approval, prompt approval, Elevate, Hostinger yes).
- Do not restyle: keep the cream editorial desk, the rust rule, and the Don't Panic wordmark.
- Do not start the next prompt.

## Verification

```powershell
pnpm --filter @hitchhiker/app test
pnpm exec tsc -b --pretty false
```

## Report back

Put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/171.md` if that directory exists. The summary names, per must_have, "already fixed" or "fixed now" with evidence, files changed, tests run, and anything assumed.

## Commit

```
feat(app): logo drop zone and opt-in German restatement
```
