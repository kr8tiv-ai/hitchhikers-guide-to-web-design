---
id: "195"
kind: checkpoint
phase: so-long-and-thanks-for-all-the-fish
slice: Forty-Two
title: "Fix the red engine unit test for Windows batch shims on Linux and macOS CI"
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
depends_on: ["194"]
files: ["packages/engine/src/tool-install/win-spawn.ts", "packages/engine/test/install-platform.test.ts", "packages/engine/src/tool-install/"]
review_checkpoint_embedded: false
---

# 195. Fix the red engine unit test for Windows batch shims on Linux and macOS CI
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

Main has been red in the CI workflow since prompt 193 (commit 337a79c). The engine unit test `packages/engine/test/install-platform.test.ts:17` "windows batch shims launch through cmd.exe and other platforms stay direct" fails on both ubuntu-latest and macos-latest, every run, at line 29 (`assert.equal(spec.verbatim, true)`, actual false). It is deterministic, not a flake. Find the real cause and fix it so the test passes on Windows, macOS, and Linux with every assertion intact.

## Known failures

1. 2026-10-11, run 38182430037 (workflow CI) on 337a79c, ubuntu-latest and macos-latest: `not ok 283 - windows batch shims launch through cmd.exe and other platforms stay direct`, `Expected values to be strictly equal: false !== true`, at install-platform.test.ts:29:12.
2. 2026-10-11, run 38182735418 (workflow CI) on docs-only commit abf92d6: the same failure on both runners. E2E and Audit were green on both commits.

Leading suspect, to confirm or reject by evidence: the test asks `launchSpec(..., "win32")` to resolve `scoop.cmd` inside a POSIX temp dir (`/tmp/hh spawn XXXX`). `resolveOnPath` in `packages/engine/src/tool-install/win-spawn.ts` lists the dir with `readdirSync` (works) but builds the candidate with `path.win32.join`, which turns the dir into `\tmp\hh spawn XXXX\scoop.cmd`. `isFile` then cannot stat that path on a POSIX host, so the shim is never found, `scoop` comes back unresolved, and `verbatim` stays false. On a real Windows host the code is fine, which is why it passed locally.

## Read first

- `packages/engine/src/tool-install/win-spawn.ts` (`launchSpec`, `resolveOnPath`, `isFile`)
- `packages/engine/test/install-platform.test.ts`
- Every caller of `launchSpec` and `resolveOnPath` (runner.ts, probes.ts, download.ts, path-env.ts)
- `.github/workflows/ci.yml` to see which runners run unit tests
- The summary from prompt 193 (`.hitchhiker-dev/summaries/193.md` if present) and `.hh-driver/FLAKES.md` if present
- `gh run view 38182735418 --log-failed` if `gh` is authenticated (read-only)

## Steps

1. Verify first. Run `pnpm --filter @hitchhiker/engine test` on Windows and confirm it passes there. If any later commit already turned CI green for this test, prove it with the run id, change nothing else, and finish.
2. Reproduce the POSIX failure. If WSL or Git Bash with node is available use it; otherwise write a tiny throwaway script that calls `resolveOnPath` with a forward-slash dir that exists, and show it returns the bare command. Record the evidence.
3. Fix the root cause in the product code, not by special-casing the test. For example, join the found entry onto the dir with a separator that keeps the dir as given (so a real `C:\...` dir still joins with backslashes and a POSIX dir still stats), or pass the path module that matches the host filesystem for the stat while keeping Windows semantics for PATHEXT and `;` splitting. Real Windows behavior must not change: `C:\` paths, PATHEXT order (`.EXE` before `.CMD`), and the cmd.exe `/d /s /c` quoting stay exactly as they are.
4. Add a unit test that pins the fix: on any host, a simulated win32 resolve of a shim in a real temp dir returns the full shim path, and `.EXE` still wins over `.CMD` when PATHEXT lists EXE first.
5. Run `pnpm -r test` twice and the targeted engine test 20 times in a row with 0 failures. If you can run it under Linux (WSL), do.
6. As a checkpoint prompt, finish by reviewing your own work as Zaphod would: re-read each truth below against the code, run the full suite, and fix at most one defect in a `fix(review):` commit. Do not add features during the review.

## Non-goals

- Do not skip, delete, loosen, or platform-gate the failing assertions (no `if (process.platform === "win32")` around the `verbatim` or `args[3]` checks, no `test.skip`, no `todo`).
- Do not change how real Windows installs launch or quote commands.
- No new dependencies. No change to run-build.ps1, the queue runner, or the CI workflow files.
- Do not restyle anything. Do not start the next prompt.

## Acceptance criteria

- [ ] The root cause is named with evidence from step 2.
- [ ] install-platform.test.ts passes on Windows and, by reasoning plus a POSIX-path reproduction, on Linux and macOS, with every original assertion intact.
- [ ] A new test pins the fix and the PATHEXT order.
- [ ] No test was skipped, deleted, gated, or loosened.

## must_haves

truths:

- `launchSpec(cmd, args, env, "win32")` resolves a `.cmd` shim in a temp dir on every host and returns `cmd.exe /d /s /c` with `verbatim: true`.
- Non-Windows platforms still launch directly with `verbatim: false`.
- Real Windows path resolution and quoting are unchanged.
- `pnpm lint`, `pnpm typecheck`, and `pnpm -r test` pass locally on Windows.

artifacts:

- The fix in `packages/engine/src/tool-install/win-spawn.ts`
- The new regression test
- Root-cause notes in the commit body

key_links:

- The win32 resolver and the tests agree on how a found entry is joined to its PATH dir.

prohibitions:

- Do not push, deploy, or create a remote.
- Do not weaken an approval gate (brief approval, prompt approval, Elevate, Hostinger yes).
- Do not weaken, skip, or delete a test.
- Do not start the next prompt.
- Do not edit run-build.ps1.

## Verification

```powershell
pnpm lint
pnpm typecheck
pnpm -r test
pnpm --filter @hitchhiker/engine test
```

## Report back

Put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/195.md` if that directory exists. Name the root cause with evidence, the files changed, the tests run, and anything assumed.

## Commit

```
fix(engine): resolve Windows batch shims from any host so CI is green on Linux and macOS
```