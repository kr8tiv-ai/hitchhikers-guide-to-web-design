---
id: "005"
kind: build
phase: dont-panic
slice: Towel Check
title: "CI workflows"
tier: Cup of Tea
effort: medium
model: grok-4.7
depends_on: ["003"]
files: [".github/workflows/ci.yml", ".github/workflows/e2e.yml", ".github/workflows/audit.yml", "docs/ci.md", "packages/engine/test/ci-workflows.test.ts"]
requirements: ["HH-CI-01"]
review_checkpoint_embedded: false
---

# 005. CI workflows

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

Add GitHub Actions workflows: lint, typecheck, unit tests on Windows, macOS, and Linux, Playwright e2e, evals from cassettes, a licence audit, and a secret scan. CI needs no secrets and has no deploy job.

## Why this prompt exists

The build runs unattended for days. CI on three operating systems catches the Windows path bug or the missing cassette before the next prompt builds on it.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 19 and 23
- package.json and pnpm-workspace.yaml (001)
- tsconfig.base.json and project references (003)
- context/matt-answers.md and DECISIONS.md (authority; they override this prompt)

## Files to create or change

- .github/workflows/ci.yml
- .github/workflows/e2e.yml
- .github/workflows/audit.yml
- docs/ci.md
- packages/engine/test/ci-workflows.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

ci.yml: on push and pull_request; matrix os [ubuntu-latest, windows-latest, macos-latest], node 22; steps checkout, pnpm/action-setup, setup-node with pnpm cache, pnpm install --frozen-lockfile, pnpm -r lint (if present), pnpm exec tsc -b, pnpm -r test with HH_CASSETTE=replay. e2e.yml: ubuntu only, installs Playwright chromium, runs pnpm -r e2e if present. audit.yml: licence audit script (from 156 once it exists; until then a step that runs `pnpm licenses list --json` and fails on GPL/AGPL) and a secret scan with gitleaks via its official action, pinned by SHA. Pin every third-party action by commit SHA with the version in a comment. permissions: contents: read. No secrets referenced, no deploy, no publish. docs/ci.md explains each job and how to run the same commands locally on Windows PowerShell.

## Interfaces and data shapes

```ts
export function readWorkflow(path: string): { name: string; jobs: Record<string, { "runs-on": string | string[]; steps: unknown[] }> };
```

## Steps

1. Write the three workflow files.

2. Write docs/ci.md with local equivalents.

3. Write ci-workflows.test.ts that parses each workflow (a minimal YAML reader or the yaml package, MIT) and asserts: three OS in the unit matrix, no `secrets.` references, no deploy or publish steps, every `uses:` pinned to a 40-character SHA, permissions contents read.

4. Run the test.

## Edge cases

- Windows runners and long paths: set git config core.longpaths true in the Windows leg.
- No lockfile yet: the install step falls back to pnpm install with a warning until one is committed.
- Pushing workflow files may need a token with the workflow scope; if the steward's push is rejected for that reason, the summary says so.

## Acceptance criteria

- [ ] Workflow files parse and pass the structure test.
- [ ] No secrets, no deploy, no publish.
- [ ] Local dry-run commands are documented without act.

## must_haves

truths:

- CI runs on Windows, macOS, and Linux.
- CI needs no secrets.
- Actions are pinned by SHA.

artifacts:

- .github/workflows/ci.yml
- .github/workflows/e2e.yml
- .github/workflows/audit.yml

key_links:

- ci-workflows.test.ts guards the workflow structure.
- audit.yml calls the licence audit that 156 completes.

prohibitions:

- Do not add deploy or publish jobs.
- Do not reference repository secrets.
- Do not use unpinned third-party actions.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/005.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
ci: lint, typecheck, tests on three OSes, e2e, audit, and secret scan
```
