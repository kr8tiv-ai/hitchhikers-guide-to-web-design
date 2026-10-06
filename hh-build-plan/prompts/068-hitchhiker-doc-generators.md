---
id: "068"
kind: build
phase: deep-thought
slice: Seven and a Half Million Years
title: "Write PROJECT, REQUIREMENTS, ROADMAP, and STATE for a site"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["002", "066"]
files: ["packages/engine/src/spec/scaffold.ts", "packages/engine/test/scaffold.test.ts"]
requirements: ["HH-SPEC-01"]
review_checkpoint_embedded: false
---

# 068. Write PROJECT, REQUIREMENTS, ROADMAP, and STATE for a site

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

Create `.hitchhiker/` for a client site from the ported GSD templates. Fill PROJECT.md from the approved brand and the site why. Requirements start as a list of ids, not prose. A client site's ROADMAP.md always uses the six locked phases (Don't Panic, Babel Fish, Deep Thought, Improbability Drive, Mostly Harmless, So Long and Thanks for All the Fish) with the generated-site slice catalog from v2 §5.2 under each, and creates .hitchhiker/phases/01-dont-panic … 06-so-long. Prompt ranges are filled in by the prompt package (090). Do not copy the Guide app's own build roadmap into a client site.

## Why this prompt exists

Deep Thought is where a website becomes specs. Using `.planning/` would collide with a user who already runs GSD. The directory name is the whole point of the port.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 10.1
- packages/engine/templates/gsd/project.md
- packages/engine/templates/gsd/requirements.md
- packages/engine/templates/gsd/roadmap.md
- packages/engine/templates/gsd/state.md
- packages/engine/src/templates.ts

## Files to create or change

- packages/engine/src/spec/scaffold.ts
- packages/engine/test/scaffold.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

scaffoldProject(dir, info) mkdir .hitchhiker, renders project, requirements, roadmap, and state through renderTemplate, and refuses to run if `.planning` exists and the user did not pass `acknowledgeForeignPlanning: true`. It never writes into `.planning`. It never deletes it. PROJECT.md contains the name, the one-sentence site why, and the hosting answer. REQUIREMENTS.md contains a table header and zero rows. ROADMAP.md contains the GSD headings and no phase checked off. STATE.md current phase is `Deep Thought`, slice `Seven and a Half Million Years`, prompt id `scaffold`, next action `Write the PRD`. Use the lock around the writes. Temp files then rename, one lock for the batch.

## Interfaces and data shapes

```ts
export interface ProjectInfo {
  name: string;
  siteWhy: string;
  hosting: string;
  acknowledgeForeignPlanning?: boolean;
}

export function scaffoldProject(dir: string, info: ProjectInfo): Promise<string[]>;
```

## Steps

1. Call renderTemplate for the four spine files. Pass project_name and date. Do not leave raw tokens.

2. If dir already has `.hitchhiker/PROJECT.md`, throw rather than overwrite. The test uses a fresh temp dir.

3. If `.planning` exists and the flag is false, throw ScaffoldError and write nothing. Test that PROJECT.md was not created.

4. Write files through the state lock helper. You may write four files inside one lock.

5. Assert the written PROJECT.md contains the site why and does not contain `.planning`.

6. Assert STATE.md contains Deep Thought.

7. Return the relative paths written.

8. Do not generate a PRD in this function.

9. Export scaffoldProject.

## Edge cases

- Empty siteWhy throws.
- A name containing a newline throws.
- Date is ISO `YYYY-MM-DD` from an injected clock.

## Acceptance criteria

- [ ] Fresh directories get four files under `.hitchhiker`.
- [ ] An existing `.planning` blocks the scaffold unless acknowledged.
- [ ] Nothing is written into `.planning`.

## must_haves

truths:

- Client spec state lives in `.hitchhiker`.
- Existing GSD state is not overwritten or deleted.
- Templates are the ported ones, not a new format.

artifacts:

- packages/engine/src/spec/scaffold.ts

key_links:

- scaffoldProject calls renderTemplate and withStateLock.

prohibitions:

- Do not write `.planning/` content.
- Do not delete a user's existing planning directory.
- Do not invent requirements rows yet.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/068.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(spec): scaffold .hitchhiker project files
```
