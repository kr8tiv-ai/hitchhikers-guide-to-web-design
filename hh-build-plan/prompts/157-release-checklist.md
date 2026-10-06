---
id: "157"
kind: build
phase: so-long-and-thanks-for-all-the-fish
slice: Don't Panic Release
title: "Write the release checklist and wire the root test"
tier: Heart of Gold
effort: high
model: grok-4.7
depends_on: ["140", "150", "154", "156", "120", "138"]
files: ["docs/release.md", "package.json", "packages/qa/test/release-doc.test.ts"]
requirements: ["HH-SHIP-12"]
review_checkpoint_embedded: true
---

# 157. Write the release checklist and wire the root test

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

Add docs/release.md that a human runs before tagging. It includes license audit, secret scan, hh doctor, the fixture drive, the phone gate, Hostinger approval, and the once-over prompt. Add a root test script if one is missing. The checklist does not publish, push, or deploy. This is the last build prompt.

## Why this prompt exists

The phase is done when a stranger can tell whether the tree is releasable. A mental checklist will skip the license audit.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/ROADMAP.md success criteria for So Long and Thanks for All the Fish
- hh-build-plan/CONTEXT-PACKAGE.v2.md section 23
- README.md
- docs/secrets.md
- packages/qa/src/licenses.ts

## Files to create or change

- docs/release.md
- package.json
- packages/qa/test/release-doc.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

The markdown is a list of commands and the expected evidence. Include `pnpm --filter @hitchhiker/qa test` and the doctor command. State that `npm publish` and `git push` are not steps. State that D-001 means no GSAP fallback and no Theatre studio. The test reads the file and asserts those phrases exist and that `npm publish` appears only in a negative sentence. Also assert `git push` is in a do-not line. Add root package.json script `test` that runs `pnpm -r test` if that works with your package manager, or document the per-package commands inside the checklist if a recursive script would fail on packages without tests. Prefer fixing package test scripts to exit 0 when they have no tests.

## Interfaces and data shapes

```ts
export function assertReleaseDoc(markdown: string): void;
```

## Steps

1. Write docs/release.md with the checks in the context.

2. assertReleaseDoc throws if the file tells the reader to npm publish as an action. Allow the words inside `Do not npm publish`.

3. The test loads the file and calls assertReleaseDoc.

4. Mention the once-over as a human step that runs prompt 159, without embedding that whole prompt.

5. Mention Hostinger does not run without yes.

6. Mention the real-mobile Lighthouse scores (all four at 90 or more).

7. Do not tag a release or create a remote.

8. Update the root test script.

9. Leave the tree unpushed.

## Edge cases

- The checklist contains no exclamation marks.
- It contains no API key.

## Acceptance criteria

- [ ] Release doc names the audits and the bans.
- [ ] It does not instruct a publish or a push.
- [ ] The root test script exists.

## must_haves

truths:

- A release is a checklist, not an automatic publish.
- The last build prompt does not deploy.

artifacts:

- docs/release.md

key_links:

- The checklist points at the license audit, secret scan, and doctor command.

prohibitions:

- Do not npm publish.
- Do not git push.
- Do not deploy.
- Do not add a GSAP fallback.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/qa test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/157.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
docs: add the release checklist
```

## REVIEW CHECKPOINT

This build closes a review group and the So Long and Thanks for All the Fish phase. After this commit, the driver runs the fresh-session reviewer prompt `158-review-156-157.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `156` Audit licenses and keep GPL and Theatre studio out (Don't Panic Release, Heart of Gold, high)
- `157` Write the release checklist and wire the root test (Don't Panic Release, Heart of Gold, high)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.
