---
id: "002"
kind: build
phase: dont-panic
slice: Towel Check
title: "Port GSD spine templates into the engine"
tier: Cup of Tea
effort: medium
model: grok-4.7
depends_on: ["001"]
files: ["packages/engine/templates/gsd/project.md", "packages/engine/templates/gsd/requirements.md", "packages/engine/templates/gsd/roadmap.md", "packages/engine/templates/gsd/state.md", "packages/engine/templates/gsd/config.json", "packages/engine/templates/gsd/context.md", "packages/engine/templates/gsd/phase-prompt.md", "packages/engine/templates/gsd/summary.md", "packages/engine/templates/gsd/verification-report.md", "packages/engine/templates/gsd/spec.md", "packages/engine/src/templates.ts", "packages/engine/test/templates.test.ts", "NOTICE"]
requirements: ["HH-GSD-01"]
review_checkpoint_embedded: false
---

# 002. Port GSD spine templates into the engine

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

Copy the GSD spine templates into the engine and rewrite host-specific words so a Guide project writes `.hitchhiker/`, not `.planning/`. Each file starts with an attribution comment that names the upstream path and the vendored commit. A test renders project.md and roadmap.md and fails if `.planning` or a Claude-only instruction survives.

## Why this prompt exists

The Guide is spec-driven in the GSD way, but gsd-core does not list Grok as a host and must not be imported at runtime. Porting the spine now gives every later writer one source of truth.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 10.1 and 19
- vendor/gsd-core/gsd-core/templates/project.md
- vendor/gsd-core/gsd-core/templates/requirements.md
- vendor/gsd-core/gsd-core/templates/roadmap.md
- vendor/gsd-core/gsd-core/templates/state.md
- vendor/gsd-core/gsd-core/templates/config.json
- vendor/gsd-core/gsd-core/templates/context.md
- vendor/gsd-core/gsd-core/templates/phase-prompt.md
- vendor/gsd-core/gsd-core/templates/summary.md
- vendor/gsd-core/gsd-core/templates/verification-report.md
- vendor/gsd-core/gsd-core/templates/spec.md
- vendor/VENDORED.md

## Files to create or change

- packages/engine/templates/gsd/project.md
- packages/engine/templates/gsd/requirements.md
- packages/engine/templates/gsd/roadmap.md
- packages/engine/templates/gsd/state.md
- packages/engine/templates/gsd/config.json
- packages/engine/templates/gsd/context.md
- packages/engine/templates/gsd/phase-prompt.md
- packages/engine/templates/gsd/summary.md
- packages/engine/templates/gsd/verification-report.md
- packages/engine/templates/gsd/spec.md
- packages/engine/src/templates.ts
- packages/engine/test/templates.test.ts
- NOTICE

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

Read the vendor files. Do not edit vendor/. Keep the section structure of roadmap.md (Overview, Phases, Phase Details, Progress) and of state.md. Replace `.planning/` with `.hitchhiker/`. Replace instructions that tell an agent to use Claude Code slash commands with a single line: `Commands for this project are /hh-* as defined by the Guide.` Delete copilot and user-profile content. Do not port the whole templates tree. The ten files in the file list are the spine. config.json in the template is a JSON skeleton with keys model, effort, budgets, gates, deployTarget, voiceEngine, interviewDepth, sessionIdMode. Values are null or empty defaults, not secrets. templates.ts exposes renderTemplate(name, vars) that replaces `{{token}}` and throws on an unknown token left in the output. Add a NOTICE line that these files are adapted from gsd-core MIT.

## Interfaces and data shapes

```ts
export type SpineTemplateName =
  | "project"
  | "requirements"
  | "roadmap"
  | "state"
  | "config"
  | "context"
  | "phase-prompt"
  | "summary"
  | "verification-report"
  | "spec";

export function renderTemplate(name: SpineTemplateName, vars: Record<string, string>): string;

export function listSpineTemplates(root: string): SpineTemplateName[];
```

## Steps

1. Read each vendor template named above. Write the adapted file under packages/engine/templates/gsd/. The first line of each markdown file is an HTML comment: `<!-- Adapted from vendor/gsd-core/gsd-core/templates/<file>. MIT. Vendored commit: <commit from VENDORED.md>. Do not edit vendor copies. -->`

2. In roadmap.md keep the phase-detail shape (Goal, Depends on, Requirements, Success Criteria, Plans) and the progress table columns Phase, Plans Complete, Status, Completed. Replace sample phase names with the six locked Guide phase names as HTML comments showing the shape, not as a filled client roadmap.

3. In state.md keep fields for current phase, slice, prompt id, last good commit, blockers, and next action. Use `.hitchhiker/` in every path example.

4. config.json template uses the keys in the context. sessionIdMode is the string `unknown` until /hh-doctor writes uuid or alias.

5. Implement renderTemplate. It reads the file with node:fs from import.meta.url via fileURLToPath, so the package works on Windows. Unknown `{{token}}` after substitution throws TemplateError listing the token.

6. Add `{{project_name}}` and `{{date}}` tokens to project.md and state.md only. Other files may contain zero tokens. Do not invent tokens you do not substitute in the test.

7. templates.test.ts renders project and state with a fixture name `Towel & Tea` and today's date, asserts the name appears, asserts the output does not contain `.planning`, `Claude Code`, or `copilot`.

8. listSpineTemplates returns the ten names. The test asserts the count and that each file's first line contains `Adapted from vendor/gsd-core`.

9. Append one NOTICE paragraph for the adapted templates. Do not copy GSD source code into NOTICE.

## Edge cases

- A template with no tokens still renders.
- A missing variable throws. It does not leave `{{project_name}}` in the file.
- CRLF in vendor files is normalized to `\n` on write.
- Do not port UI-SPEC.md, user-profile.md, or copilot-instructions.md.

## Acceptance criteria

- [ ] Ten spine templates exist with attribution headers.
- [ ] Rendered project.md contains the fixture name and no `.planning` path.
- [ ] config.json template has sessionIdMode default `unknown`.
- [ ] NOTICE mentions the adapted templates.

## must_haves

truths:

- The Guide does not runtime-import gsd-core.
- Roadmap and state shapes survive the port.
- Host-specific Claude and .planning wording is gone from the ten files.

artifacts:

- packages/engine/templates/gsd/roadmap.md
- packages/engine/templates/gsd/state.md
- packages/engine/src/templates.ts

key_links:

- templates.test.ts calls renderTemplate('project', { project_name, date }).
- Each template header cites vendor/gsd-core and the VENDORED commit.

prohibitions:

- Do not edit files under vendor/.
- Do not add gsd-core to package.json dependencies.
- Do not fill the templates with a sample client brand.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/002.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(engine): port GSD spine templates into .hitchhiker shape
```
