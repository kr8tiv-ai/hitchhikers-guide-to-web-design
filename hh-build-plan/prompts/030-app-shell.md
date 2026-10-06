---
id: "030"
kind: build
phase: dont-panic
slice: Don't Panic Desk
title: "Build the local chat shell without a default theme"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["001", "010"]
files: ["packages/app/package.json", "packages/app/index.html", "packages/app/src/shell.ts", "packages/app/src/shell.css", "packages/app/test/shell.test.ts"]
requirements: ["HH-APP-01"]
review_checkpoint_embedded: false
---

# 030. Build the local chat shell without a default theme

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

Serve a local, framework-free shell for the interview. It has a transcript region, a slot for one question card, and a status line. The visual design comes from the Guide design system built in 010 (packages/app/src/design/): Don't Panic in large, friendly letters, the display and text faces, colour tokens, motion tokens, and component styles. It must look agency-grade at 375 and 1440, not like a plain document and not like a purple Tailwind dashboard. Tests render the HTML string and check structure and banned patterns.

## Why this prompt exists

Voice, the tree, and the crawler are useless if the user has nowhere to answer. The shell is the desk. Motion and branding of client sites do not belong here.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 4, 5, and 14
- packages/engine/src/index.ts
- packages/app/src/design/README.md and the 010 reference comps under packages/app/src/design/comps/

## Files to create or change

- packages/app/package.json
- packages/app/index.html
- packages/app/src/shell.ts
- packages/app/src/shell.css
- packages/app/test/shell.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

No React in this package. The app is a static index.html plus TypeScript that the test can import without a browser: renderShell() returns an HTML string. CSS lives in shell.css and is linked from the HTML. Import tokens.css and components.css from packages/app/src/design/. The layout is the conversation desk designed in 010 (transcript, one question card, Guide map rail on wide screens, status), responsive at 375, 768, 1440. Do not use indigo, violet, or a purple-blue gradient. Do not use the word elevate. No magnetic button. No three feature cards. Header text is `The Hitchhiker's Guide to Web Design` and a smaller line `Don't Panic.` with a period, not an exclamation mark. Regions: `data-region=transcript`, `data-region=question`, `data-region=status`. Status default is `Ready.` Include a skip link as the first focusable control. The test loads CSS as text and fails if it matches `linear-gradient` with hex colors in the indigo/violet range, or the class names `bg-indigo-600` and `rounded-full` used as a pill button cliche. A plain border-radius of 2px is fine. Do not start a server in the test. A later prompt can add one. package.json test script runs the app tests.

## Interfaces and data shapes

```ts
export function renderShell(): string;

export function assertShellCss(css: string): string[];
```

## Steps

1. Write renderShell() as a template string in shell.ts. Escape nothing dynamic because there is no user data in the shell yet. Regions use data attributes, not ids only.

2. Write shell.css on top of the 010 tokens (no new raw colour values), a fluid body size using clamp, and a min-height of 44px on any button you include. The only button in this prompt is a visually hidden skip link made visible on focus.

3. assertShellCss returns a list of problems. Empty list means pass. Check for `!` in the CSS file is unnecessary. Check the HTML for `!` via a separate assertShellHtml.

4. shell.test.ts reads the CSS file from disk using fileURLToPath and asserts both functions return no problems. It also asserts the three regions exist once each.

5. Set the document title to the product name. Meta viewport is present so a phone does not zoom out to a desktop layout.

6. index.html is generated by a one-line note: the committed index.html inlines nothing. It contains the same regions. Add a test that the file on disk includes data-region=question so the two copies cannot drift. Generate index.html from renderShell in a tiny script `packages/app/scripts/write-html.ts` and run it once, committing the output. The test re-renders and compares.

7. Do not import the interview engine yet. The question region is empty with a placeholder paragraph `No question yet.`

8. Fonts are the 010 font files, self-hosted under packages/app/public/fonts with OFL notices. No font CDN.

9. Confirm the package does not depend on react or tailwind. gsap is allowed only through the 010 motion layer.

## Edge cases

- The comparison test normalizes newlines.
- A future card will mount inside the question region. Do not put required inputs in the shell that the card also owns.
- Contrast comes from the 010 tokens, which already pass WCAG AA. Do not introduce gray #999 on #fff.

## Acceptance criteria

- [ ] Rendered HTML has the three regions and a viewport meta.
- [ ] CSS has no indigo utility classes and no purple gradient.
- [ ] index.html matches renderShell().
- [ ] No framework dependency was added.
- [ ] Screenshots at 375 and 1440 are attached in the summary and match the 010 reference comps.

## must_haves

truths:

- The desk is local and framework-free.
- Anti-slop bans are checked by a test, not by taste alone.
- The shell does not yet pretend a question is loaded.

artifacts:

- packages/app/src/shell.ts
- packages/app/src/shell.css
- packages/app/index.html

key_links:

- shell.test.ts compares index.html to renderShell().
- The question region is the mount point the next prompt fills.

prohibitions:

- Do not add Tailwind, React, or a component library.
- Do not use an exclamation mark in the UI copy.
- Do not build a client marketing page inside the app shell.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/app test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/030.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(app): add the local interview shell
```
