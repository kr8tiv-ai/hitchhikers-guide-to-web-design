---
id: "144"
kind: build
phase: so-long-and-thanks-for-all-the-fish
slice: Share and Enjoy
title: "Draft a launch kit that does not auto-post"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["065", "142", "058"]
files: ["packages/deploy/src/launch-kit.ts", "packages/deploy/test/launch-kit.test.ts"]
requirements: ["HH-SHIP-06"]
review_checkpoint_embedded: false
---

# 144. Draft a launch kit that does not auto-post

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

Draft a launch note, a short social caption, and a checklist. Writing the files is allowed. Posting is not implemented. The draft must pass the claim linter. There is no function named post or tweet.

## Why this prompt exists

Launch copy is useful. An automatic post is how a draft testimonial leaves the building.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 13
- packages/templates/src/social.ts
- packages/engine/src/brand/truth.ts

## Files to create or change

- packages/deploy/src/launch-kit.ts
- packages/deploy/test/launch-kit.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

renderLaunchKit({ name, offer, url }) returns markdown. URL is optional. If missing, the checklist says the domain is not set. Caption uses the offer and not a star rating. Run lintClaims with empty evidence and throw if the draft would fail. The checklist includes `Do not post this until a human sends it.` No network client import.

## Interfaces and data shapes

```ts
export function renderLaunchKit(input: { name: string; offer: string; url: string | null; evidence: Evidence }): string;
```

## Steps

1. Build the markdown with sections Note, Caption, Checklist.

2. Call lintClaims before returning.

3. A test with offer `5 stars` and empty evidence throws.

4. A clean offer returns text containing the do-not-post sentence.

5. Scan the file for `fetch(` and fail the test if present.

6. No exclamation marks.

7. Export the function.

8. Do not import the X OAuth module.

## Edge cases

- Null url omits a link rather than printing the string null.
- Name longer than 60 characters throws.

## Acceptance criteria

- [ ] The kit is a draft with an explicit do-not-post line.
- [ ] Fake proof cannot be rendered.
- [ ] There is no post function.

## must_haves

truths:

- Launch copy stays on disk.
- The truth gate covers it.

artifacts:

- packages/deploy/src/launch-kit.ts

key_links:

- lintClaims is called on the draft.

prohibitions:

- Do not post to a network.
- Do not invent a testimonial.
- Do not add a tweet helper.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/deploy test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/144.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(deploy): draft a launch kit that does not post
```

