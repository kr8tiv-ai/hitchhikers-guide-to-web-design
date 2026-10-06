---
id: "093"
kind: build
phase: deep-thought
slice: Approval Gate
title: "Require a yes before Improbability Drive"
tier: Heart of Gold
effort: high
model: grok-4.7
depends_on: ["090", "089", "069", "010"]
files: ["packages/app/src/approval.ts", "packages/engine/src/spec/approve-drive.ts", "packages/engine/test/approve-drive.test.ts", "packages/app/test/approval.test.ts"]
requirements: ["HH-SPEC-08"]
review_checkpoint_embedded: false
---

# 093. Require a yes before Improbability Drive

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

Show the PRD title, the context token estimate, and every site prompt's title and tier. Starting the drive requires an explicit yes stored in `.hitchhiker/drive-approval.json`. A missing file is not a yes. The button copy is `Approve and allow the drive`. There is no default checked box.
Extend the gate to three approvals (Q10): PRD.md, CONTEXT.md, and the prompt package. Improbability Drive starts only when all three carry a recorded yes with a hash of the approved file.

## Why this prompt exists

The orchestrator will spend a long run and real API money. A missing file must not count as permission.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 10.5 approval paragraph
- packages/engine/src/spec/site-prompts.ts
- packages/app/src/brand-kit.ts

## Files to create or change

- packages/app/src/approval.ts
- packages/engine/src/spec/approve-drive.ts
- packages/engine/test/approve-drive.test.ts
- packages/app/test/approval.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

renderApproval(summary) returns HTML with a list of prompts, the token estimate, and one button. The button is type=button and data-approve-drive=no until a pure reducer sets it. The engine function assertDriveAllowed(fileJson) returns true only when `{ approved: true, at: string, count: number }` and count matches the current prompt count. A mismatch throws because they approved a different package. Tests cover missing file, approved false, and count mismatch. No exclamation marks. Do not start a process.

## Interfaces and data shapes

```ts
export interface DriveApproval { approved: true; at: string; count: number; promptIdsHash: string; }
export function assertDriveAllowed(raw: unknown, expected: { count: number; promptIdsHash: string }): void;
export function renderApproval(input: { titles: string[]; tokens: number }): string;
```

## Steps

1. Implement assertDriveAllowed. null throws. approved true with the wrong count throws. Hash mismatch throws.

2. The hash is a pure function of the ids joined by newlines, sha256 hex, so a title change does not matter but an id change does. Use node:crypto.

3. renderApproval lists every title. A test with three titles expects three list items.

4. The HTML does not contain `checked` on an input.

5. Button label is exact.

6. Token line says `estimate`, not a dollar price.

7. Do not call grok.

8. Export both.

## Edge cases

- count 0 throws.
- A string `true` instead of boolean true throws.
- Titles are escaped.

## Acceptance criteria

- [ ] Unapproved state is denied.
- [ ] A stale count is denied.
- [ ] The screen lists titles and tiers or titles plus a tier attribute.

## must_haves

truths:

- The drive cannot start without a matching approval file.
- The UI does not default to yes.

artifacts:

- packages/engine/src/spec/approve-drive.ts
- packages/app/src/approval.ts

key_links:

- assertDriveAllowed hashes the ids from generateSitePrompts.

prohibitions:

- Do not default the checkbox to approved.
- Do not launch the orchestrator.
- Do not show a fake dollar price.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
pnpm --filter @hitchhiker/app test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/093.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(spec): gate the drive on an explicit approval
```
