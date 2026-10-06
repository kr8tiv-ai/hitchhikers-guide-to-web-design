---
id: "066"
kind: build
phase: babel-fish
slice: The Brand Brain
title: "Approve each brand section before it leaves draft"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["059", "065"]
files: ["packages/engine/src/brand/approve.ts", "packages/engine/test/approve.test.ts"]
requirements: ["HH-BRAND-11"]
review_checkpoint_embedded: true
---

# 066. Approve each brand section before it leaves draft

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

Record per-section approval for purpose, voice, tokens, imagery, logo, and neighbors. BRAND.md stays `Status: draft` until every section is approved. A redo clears that section only. This closes Babel Fish. Do not start the PRD.

## Why this prompt exists

A single yes at the bottom approves a logo the user hated. Per-item approval is the decision in the spec.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 9
- hh-build-plan/ROADMAP.md Babel Fish success criteria
- packages/engine/src/brand/brain.ts
- packages/app/src/brand-kit.ts

## Files to create or change

- packages/engine/src/brand/approve.ts
- packages/engine/test/approve.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

Approvals live in `.hitchhiker/brand-approval.json` written with the state lock and temp rename. Sections are the six names. approve(project, section) sets it true and rewrites the Status line to `Status: approved` only when all six are true. redo(project, section) sets it false and forces draft. Unknown section throws. The logo section can be approved without an SVG. That records the user's acceptance of `no logo yet`. The test uses a temp project and the real lock. Compile a minimal brand markdown in the test and run it through applyStatus(markdown, approvals).

## Interfaces and data shapes

```ts
export const BRAND_SECTIONS: readonly ["purpose", "voice", "tokens", "imagery", "logo", "neighbors"];

export function applyStatus(markdown: string, approvals: Record<string, boolean>): string;
export function approveSection(projectDir: string, section: string): Promise<{ allApproved: boolean }>;
export function redoSection(projectDir: string, section: string): Promise<void>;
```

## Steps

1. Implement applyStatus as a pure function. Missing Status line throws, so a hand-edited file cannot skip the gate.

2. All six true rewrites the line to `Status: approved`. Any false rewrites to `Status: draft`.

3. approveSection uses withStateLock. The test approves all six and expects approved.

4. redo on voice after that expects draft and voice false, and the other flags stay true.

5. Unknown section `gsap` throws. That also keeps a weird key out of the file.

6. Do not delete BRAND.md on redo.

7. Write the phase-end note in the test name: it covers brand brain length only by calling compileBrand on a small fixture and then applyStatus. If compileBrand is awkward to call, skip the length assertion here because brain.test.ts owns it, and assert approval behavior only.

8. Export the functions.

9. Do not generate site prompts.

## Edge cases

- Approving twice is idempotent.
- A corrupt json file throws and is not deleted.
- Section names are case-sensitive.

## Acceptance criteria

- [ ] Partial approval stays draft.
- [ ] Full approval flips the status line.
- [ ] Redo clears one section.
- [ ] The state lock is used.

## must_haves

truths:

- Each brand section is approved on its own.
- Draft cannot be relabeled approved by editing one boolean in memory without the file.
- Babel Fish does not launch Deep Thought.

artifacts:

- packages/engine/src/brand/approve.ts

key_links:

- applyStatus rewrites the line compileBrand wrote.
- Section names match the data-approve ids in the kit, plus neighbors.

prohibitions:

- Do not auto-approve on compile.
- Do not start the site prompt generator.
- Do not call Imagine.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/066.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(brand): approve brand sections one at a time
```

## REVIEW CHECKPOINT

This build closes a review group and the Babel Fish phase. After this commit, the driver runs the fresh-session reviewer prompt `067-review-065-066.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `065` Render the brand kit as an approval page with optional social frames (The Brand Brain, Heart of Gold, high)
- `066` Approve each brand section before it leaves draft (The Brand Brain, Gargle Blaster, high)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.
