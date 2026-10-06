---
id: "097"
kind: build
phase: improbability-drive
slice: Vogon Constructor Fleet
title: "Deny push, deploy, and unapproved destructive actions"
tier: Heart of Gold
effort: xhigh
model: grok-4.7
depends_on: ["096"]
files: ["packages/orchestrator/src/policy.ts", "packages/orchestrator/test/policy.test.ts"]
requirements: ["HH-DRIVE-02"]
review_checkpoint_embedded: false
---

# 097. Deny push, deploy, and unapproved destructive actions

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

Decide which commands a site-building session may run. git push, remote creation, and deploy commands are denied. Deleting the project root is denied. Package installs are allowed only through the legitimacy gate stub that records name, license, and repo. Hooks are not the only gate: this function is called by the orchestrator too, because hooks fail open.

## Why this prompt exists

A fail-open hook plus a confident agent will push to a remote the user did not create. The orchestrator has to repeat the check.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 11
- hh-build-plan/RESEARCH-ADDENDUM.md hooks fail-open note
- context/sources/xai/features_hooks.md

## Files to create or change

- packages/orchestrator/src/policy.ts
- packages/orchestrator/test/policy.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

evaluateCommand(argv) returns allow or deny with a reason. Deny git push, git remote add, gh repo create, npx wrangler deploy, vercel, netlify deploy, and any command containing hostinger deploy words. Allow git status, git diff, git add, git commit. Deny rm of `/`, `C:\`, or the project root. A package manager add requires a side object `{ name, license, repo }` or it is deny `legitimacy record missing`. GPL and AGPL licenses deny. The test table covers those cases. Do not shell out.

## Interfaces and data shapes

```ts
export function evaluateCommand(input: {
  argv: string[];
  projectRoot: string;
  packageMeta?: { name: string; license: string; repo: string };
}): { decision: "allow" | "deny"; reason: string };
```

## Steps

1. Implement the deny list as data. Match on the joined argv but compare tokens, so a commit message that mentions the word push is not a push. `git commit -m "do not push"` is allow. `git push` is deny.

2. Test that distinction.

3. GPL and AGPL deny. MIT allows when meta is present. Missing meta denies npm install of a named package. `pnpm test` allows without meta.

4. Deploy substrings: `wrangler deploy`, `vercel --prod`, `netlify deploy`, `hostinger` plus `deploy`.

5. Reason strings contain no secrets.

6. Add a comment that Grok hooks fail open and this function is the second gate.

7. Do not execute the command.

8. Export evaluateCommand.

## Edge cases

- Empty argv denies.
- Windows path case is normalized when comparing the project root.
- A repo URL that is empty denies the install.

## Acceptance criteria

- [ ] Push and deploy are denied.
- [ ] A commit message containing push is allowed.
- [ ] GPL is denied and MIT with metadata is allowed.

## must_haves

truths:

- The orchestrator can deny a command without relying on hooks.
- Legitimacy metadata is required for new packages.

artifacts:

- packages/orchestrator/src/policy.ts

key_links:

- The runner will call evaluateCommand before spawn in a later integration. This prompt exports the pure function.

prohibitions:

- Do not allow git push.
- Do not treat hooks as sufficient.
- Do not execute commands in the test.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/orchestrator test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/097.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(orchestrator): deny push, deploy, and unmarked packages
```
