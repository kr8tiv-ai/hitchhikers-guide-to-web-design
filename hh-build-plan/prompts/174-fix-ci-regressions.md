---
id: "174"
kind: checkpoint
phase: so-long-and-thanks-for-all-the-fish
slice: Forty-Two
title: "Fix CI regressions from prompts 165 and 166"
tier: Heart of Gold
effort: xhigh
model: grok-4.7
depends_on: ["173"]
files: ["packages/grok-plugin/", "packages/cli/src/main.ts", "packages/engine/", "packages/app/src/", "packages/app/e2e/polish.spec.ts"]
review_checkpoint_embedded: false
---

# 174. Fix CI regressions from prompts 165 and 166

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
- The driver pushes after checkpoints. You do not push, and you do not run `gh` against the network except read-only `gh run list` and `gh run view --log-failed` if `gh` is already authenticated. If it is not, work from the failure list below.

## Goal

GitHub Actions on main failed for commits afdef15 (prompt 165) and ab246fb (prompt 166). Make CI green again by fixing the three known failures below, then check the commits of prompts 167 to 173 for the same classes of breakage and fix any found. Local green on Windows is the bar, and the fixes must also hold on macOS and Linux.

## Why this prompt exists

Prompts 165 and 166 passed their local checks but broke the shared CI matrix. Red main hides later regressions and blocks the improve loop (173), whose score treats any red test as a regression.

## Known failures

1. `packages/grok-plugin` test "COMMANDS matches the hh CLI subcommands" fails with ERR_ASSERTION on all OSes. Likely cause: the unknown-subcommand command table change in prompt 162 (or a later command such as `improve` from 173) left the plugin `COMMANDS` list and the CLI command table out of sync. Make both agree. Prefer one source of truth that the other imports or is generated from, if the package boundaries allow it; otherwise update the list and keep the test strict.
2. On `windows-latest`, `packages/engine` test "the repo has no deep imports and no package escapes" fails. Likely cause: files added by 164 to 166 import across package boundaries (`../../other-package/src/...`), use deep `@hitchhiker/<pkg>/src/...` imports, or the test mishandles Windows path separators. Fix the offending imports to use each package's public entry point. If the scanner itself mishandles backslashes, normalize paths in the scanner without loosening what it forbids.
3. E2E `packages/app` `e2e/polish.spec.ts` test "every screen at 375, 768, and 1440 in light and dark" times out waiting for `locator('.hh-empty__title')` (around lines 132, 152, 171, and 227 of polish.spec.ts). Prompt 165 reworked the empty brand plate and other empty plates, and prompt 169 reworks more. Give every screen one stable ready marker (for example a `data-hh-ready` attribute set once the screen has rendered its primary content or its empty plate) and make the spec wait on that marker instead of a class name that design work can change. Keep the one-next-action design: each screen still shows exactly one primary next action. Do not restyle.

## Read first

- `.github/workflows/` (the exact commands and OS matrix CI runs)
- `gh run list --branch main --limit 10` and `gh run view <id> --log-failed` if `gh` is authenticated
- `git show --stat afdef15 ab246fb` and the commits for prompts 167 to 173 (`git log --oneline -30`)
- `packages/grok-plugin/` (COMMANDS list and its test), `packages/cli/src/main.ts` (command table from 162)
- `packages/engine/test/` (the deep-import scanner test)
- `packages/app/e2e/polish.spec.ts` and `packages/app/src/design/` (empty plates and screens)
- DECISIONS.md and context/matt-answers.md (authority)

## Files to create or change

- `packages/grok-plugin/` (COMMANDS list and test only if the test asserts something intentionally changed)
- `packages/cli/src/main.ts` (command table, only if it is the side that is wrong)
- `packages/engine/` (the offending imports, or the scanner path normalization)
- `packages/app/src/` (ready marker on each screen and empty plate)
- `packages/app/e2e/polish.spec.ts` (ready selectors)
- Any other file named by a failing check from the later-commit audit, listed in the summary.

## Non-goals

- Do not weaken approval gates: brief approval, prompt approval, Elevate, Hostinger yes.
- Do not restyle: keep the cream editorial desk, the rust rule, and the Don't Panic wordmark.
- Do not skip, delete, or loosen tests, add retries or longer timeouts to hide a missing marker, or mark anything `test.fixme`.
- No new features, no new dependencies, no change to run-build.ps1 or the queue runner.
- Do not start the next prompt.

## Steps

1. Verify first. Before editing, reproduce each known failure locally and record the exact failing output: `pnpm --filter @hitchhiker/grok-plugin test`, `pnpm --filter @hitchhiker/engine test`, and the polish e2e (`pnpm --filter @hitchhiker/app exec playwright test e2e/polish.spec.ts`; install browsers with `pnpm exec playwright install chromium` if missing). Read the current code and the commits. Decide per failure whether it still exists. If one no longer fails and has a test, change nothing for it and record "already fixed: <evidence>" in the summary. Do only what is still needed. If everything is already satisfied, make no code change, write the summary, and commit it with the commit line below.
2. Failure 1: diff the plugin COMMANDS against the CLI table, including `improve` from 173 and any command added after 162. Fix the side that is wrong, or unify to one source. Keep the test strict.
3. Failure 2: run the engine test and read the offending paths it prints. Fix each import to the public entry point. Check the scanner on backslash paths, and make it normalize with `node:path` without relaxing its rules. Add a regression test for a Windows-style path if the scanner changed.
4. Failure 3: add the ready marker to every screen and empty plate in `packages/app/src/`, point every ready wait in polish.spec.ts (and any other spec using `.hh-empty__title` as a ready signal) at it, and confirm each screen at 375, 768, and 1440 in light and dark still has exactly one primary next action. Confirm the polish checks (overflow, contrast, focus, motion reduction) still run and still assert.
5. Audit 167 to 173: for each commit, run the affected package tests and look for the same classes of breakage: command table drift, deep imports or package escapes, hardcoded POSIX paths or path separators, selectors tied to design classnames, and OS-specific assumptions. Fix what fails. Do not fix style nits.
6. Run the full verification list on Windows. If CI workflow steps differ from the list below, run those too.
7. As a checkpoint prompt, finish by reviewing your own work as Zaphod would: re-read each truth below against the code, run the full suite, fix at most one defect in a `fix(review):` commit. Do not add features during the review.

## Acceptance criteria

- [ ] The plugin COMMANDS test passes and the plugin list and the CLI table agree, including `improve`.
- [ ] The engine no-deep-imports test passes on Windows, macOS, and Linux with the rules unchanged in strictness.
- [ ] `polish.spec.ts` passes for every screen at 375, 768, and 1440 in light and dark using a stable ready marker, and each screen still shows one primary next action.
- [ ] Prompts 167 to 173 were audited and any same-class breakage is fixed or recorded as "already fixed".
- [ ] No test was skipped, deleted, or loosened; no approval gate behavior changed; no restyle.

## must_haves

truths:

- The plugin COMMANDS list and the CLI subcommand table agree, and the test that checks it is as strict as before.
- The engine deep-import and package-escape test passes on Windows with no offending import left.
- Every app screen exposes a stable ready marker, and the polish e2e waits on it, not on a design classname.
- `pnpm lint`, `pnpm typecheck`, `pnpm -r test`, and the app e2e all pass locally on Windows.
- No approval gate behavior changed and nothing was restyled.

artifacts:

- Fixed imports, plugin COMMANDS, or CLI table (whichever was wrong)
- Ready marker in packages/app/src/ and updated selectors in packages/app/e2e/polish.spec.ts
- A regression test for any scanner change

key_links:

- Plugin COMMANDS and the CLI command table (162, 173) share one source or are asserted equal.
- polish.spec.ts ready waits use the ready marker from the app screens.

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
pnpm --filter @hitchhiker/grok-plugin test
pnpm --filter @hitchhiker/engine test
pnpm -r test
pnpm exec tsc -b --pretty false
pnpm --filter @hitchhiker/app exec playwright test e2e/polish.spec.ts
pnpm --filter @hitchhiker/app e2e
```

## Report back

Put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/174.md` if that directory exists. The summary names, per failure, "already fixed" or "fixed now" with evidence (the failing output before, the passing output after), files changed, the audit result for 167 to 173, tests run, and anything assumed.

## Commit

```
fix(ci): repair plugin COMMANDS, engine import scan, and e2e ready markers
```