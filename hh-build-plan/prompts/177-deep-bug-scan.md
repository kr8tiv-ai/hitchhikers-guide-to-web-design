---
id: "177"
kind: build
phase: so-long-and-thanks-for-all-the-fish
slice: Forty-Two
title: "Deep bug scan across every desk screen and CLI command"
tier: Heart of Gold
effort: xhigh
model: grok-4.7
depends_on: ["176"]
files: ["packages/app/", "packages/cli/", "packages/engine/", "docs/bug-scan.md"]
review_checkpoint_embedded: false
---

# 177. Deep bug scan across every desk screen and CLI command

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

- Fix root causes. Never weaken, skip, delete, or loosen a test or an assertion to get green. A test may change only when it asserts something the product intentionally changed, and then the new assertion must be at least as strict and the summary must say why.
- The driver pushes after checkpoints. You do not push, and you do not run `gh` against the network.
- Playwright runs use the existing app e2e setup in packages/app/e2e/. Fixtures and cassettes only. No live xAI or other paid API call in any test or script.
- Every bug found gets a test that fails first and passes after the fix. Findings you cannot fix in this session are listed as not fixed with the reason.
- Use cassettes and fixtures for the interview run. No paid API call.
- The scan itself must not modify user data; run CLI commands in a temporary directory or a temporary HOME.

## Goal

Systematically exercise every desk screen and every CLI command, find defects, fix each with a test, and write findings to docs/bug-scan.md with fixed or not-fixed status. Cover: `hh doctor`, `hh app`, `hh install`, unknown commands and their error text, `hh settings`, `hh brand`, `hh approve`, `hh drive`, `hh improve --dry-run`, and a full `hh interview` run with a cassette. For the desk: every screen at 375 and 1440, console errors, failed network requests, failing git or tool hooks, broken links, keyboard and focus order, and accessibility with axe. Check Windows, macOS, and Linux path problems (separators, drive letters, case sensitivity, home directory, spaces in paths, line endings).

## Why this prompt exists

Many small defects hide between prompts: console errors, dead links, hooks that fail quietly, and path assumptions that only break on another OS. One systematic sweep finds them before the user does.

## Read first

- packages/cli/src/main.ts (the command table) and each command module
- packages/app/src/ (routes, screens) and packages/app/e2e/
- packages/engine/src/ (shared logic, path handling)
- .github/workflows/ (the OS matrix) and any git hooks in the repo (.husky, .githooks, lefthook, or package.json scripts)
- docs/ (existing docs, to avoid duplicating)
- DECISIONS.md and context/matt-answers.md (authority)

## Files to create or change

- docs/bug-scan.md (new): a table with id, area, steps, expected, actual, severity, status fixed|not-fixed, commit or reason
- packages/app/e2e/bug-scan.spec.ts (new: walks every screen, collects console errors and failed requests, runs axe)
- packages/cli/test/ and packages/engine/test/ tests for each CLI or path fix
- Source fixes in the package where each root cause lives

## Non-goals

- No new features and no restyle.
- No change to approval gates.
- No new dependency except an axe integration already present in the repo; if axe is missing, use the MIT-licensed `@axe-core/playwright` after the registry check in RULES and a NOTICE entry.
- Do not mark a finding fixed without a test.
- Do not run `hh improve` for real.

## Steps

1. Verify first. Before editing, read the current code and the git log. Decide per must_have whether the defect still exists. If a must_have is already satisfied by the current code and has a test, change nothing for it and record "already fixed: <evidence>" in the summary. Do only what is still needed. If everything is already satisfied, make no code change, write the summary, and commit it with the commit line below.
2. Inventory: list every desk screen and every CLI command from the code (not from memory). Write the inventory at the top of docs/bug-scan.md.
3. CLI sweep: run each command in a temporary directory with a temporary HOME, with valid input, with missing input, and with unknown flags. Record exit codes, stderr, and any stack trace. Unknown commands must print a helpful message and a nonzero exit code, never a stack trace.
4. Desk sweep: write `e2e/bug-scan.spec.ts` that visits every screen at 375 and 1440, listens for console errors, page errors, and failed requests, follows every link and checks for 404s, tabs through each screen to check focus order, and runs axe with zero serious or critical violations.
5. Hooks sweep: run the repo git hooks and the package scripts they call on a scratch commit in a temporary clone; record exit codes and output; fix any hook that fails or prints errors on a clean tree.
6. Path sweep: grep for hardcoded separators, `/tmp`, `~`, `process.env.HOME` without fallback, case-sensitive imports, and `\r\n` assumptions; test paths with spaces and non-ASCII names; fix with `node:path` and `node:os`.
7. Fix each finding with a failing-first test. Update docs/bug-scan.md with status and commit hash for each. Findings that need a product decision stay not-fixed with the reason.
8. Run the full verification list.

## Acceptance criteria

- [ ] docs/bug-scan.md lists every screen and command scanned and every finding with status.
- [ ] Every fixed finding has a test that failed first.
- [ ] The desk walk finds zero console errors, failed requests, broken links, and serious or critical axe violations at 375 and 1440, or the remainder is listed not-fixed.
- [ ] Unknown CLI commands exit nonzero with a clear message and no stack trace.
- [ ] Path handling passes on Windows and holds for macOS and Linux by test or by code reading recorded in the doc.

## must_haves

truths:

- Every desk screen and CLI command was exercised and recorded.
- Each fix has a regression test.
- docs/bug-scan.md is honest about what is not fixed.

artifacts:

- docs/bug-scan.md
- packages/app/e2e/bug-scan.spec.ts

key_links:

- The inventory in docs/bug-scan.md comes from the code.
- Findings link to commits and tests.

prohibitions:

- Do not push, deploy, or create a remote.
- Do not weaken an approval gate (brief approval, prompt approval, Elevate, Hostinger yes).
- Do not restyle: keep the cream editorial desk, the rust rule, and the Don't Panic wordmark.
- Do not weaken, skip, or delete a test.
- Do not start the next prompt.
- Do not edit run-build.ps1.

## Verification

```powershell
pnpm lint
pnpm typecheck
pnpm -r test
pnpm exec tsc -b --pretty false
pnpm --filter @hitchhiker/app e2e
```

## Report back

Put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/177.md` if that directory exists. The summary names, per must_have, "already fixed" or "fixed now" with evidence, files changed, tests run, and anything assumed.

## Commit

```
fix(app): deep bug scan fixes and docs/bug-scan.md findings
```
