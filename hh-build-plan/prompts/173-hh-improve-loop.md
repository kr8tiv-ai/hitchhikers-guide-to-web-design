---
id: "173"
kind: checkpoint
phase: so-long-and-thanks-for-all-the-fish
slice: Forty-Two
title: "Self-improving loop for the Guide: hh improve"
tier: Heart of Gold
effort: xhigh
model: grok-4.7
depends_on: ["172"]
files: ["packages/cli/src/main.ts", "packages/cli/src/improve/", "packages/engine/src/improve/", "packages/cli/test/improve.test.ts", "packages/engine/test/improve.test.ts", "docs/improve.md", "docs/improve-runbook.md", "improve/program.md", "improve/protected.json"]
review_checkpoint_embedded: false
---

# 173. Self-improving loop for the Guide: hh improve

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

- Pattern: Karpathy autoresearch (github.com/karpathy/autoresearch). Read its README and program.md idea first (WebFetch). Adapt the idea; copy no code and no files from it.
- Node built-ins only. Use node:path, node:os, node:child_process. No new dependencies. Windows, macOS, and Linux.
- The loop never edits approval gates, the evaluation, DECISIONS.md, context/matt-answers.md, secrets, .hh-driver, or hh-build-plan/prompts. Enforce this in code, not only in prose.
- The loop never force pushes, never pushes to main, and never deploys. Its commits live on a dedicated branch (improve/<date>-<tag>) and a human merges.
- Default model grok-4.7, effort xhigh, matching the build driver. The command must run unattended with a hard max-experiment cap.

## Goal

Add `hh improve`, a bounded self-improvement loop in the autoresearch style. Parts: (1) a human-written `improve/program.md` that states the objective, the one editable target area (default: packages/app/src/design/ copy and tokens plus packages/app/src/server/card.ts, configurable in program.md front matter), and the rules. (2) A FIXED, protected evaluation the agent cannot edit: `pnpm -r test` pass count plus `hh doctor` exit code, `pnpm exec tsc -b`, and the anti-slop checks already in packages/qa, combined into one numeric score (higher is better; any red test or typecheck failure scores below the baseline). (3) A fixed per-experiment budget (wall-clock minutes and grok turn count). (4) For each experiment: spawn a fresh `grok -p ... -m grok-4.7 --effort xhigh` session on the dedicated branch, run the evaluation, KEEP the commit only if the score strictly improves over the best so far, otherwise `git reset --hard` to the prior commit on that branch only (never main, never a user branch). (5) Append every experiment to `improve/results.tsv` (columns: n, started, commit, score, best, status keep|discard|crash|violation, seconds, note). (6) Stop at `--max-experiments` (default 5, hard ceiling 50) or when a stop file exists. (7) Docs and a runbook that teaches Grok 4.7 how to run it.

## Why this prompt exists

Manual polish passes do not scale and drift. A bounded loop with a protected metric lets the Guide improve itself overnight without the agent grading its own homework.

## Read first

- Fetch https://github.com/karpathy/autoresearch and read its README and program.md (the pattern only)
- DECISIONS.md and context/matt-answers.md (authority)
- packages/cli/src/main.ts and the CLI test setup
- .hh-driver/run-build.ps1 (how grok is spawned, --always-approve, deny rules, state, stall kill)
- packages/qa/ (anti-slop and license checks the score can reuse)
- packages/engine/src/ (where shared logic lives; a pure scoring module belongs here)

## Files to create or change

- `packages/cli/src/main.ts`
- `packages/cli/src/improve/`
- `packages/engine/src/improve/`
- `packages/cli/test/improve.test.ts`
- `packages/engine/test/improve.test.ts`
- `docs/improve.md`
- `docs/improve-runbook.md`
- `improve/program.md`
- `improve/protected.json`

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Non-goals

- No change to run-build.ps1 or the queue runner.
- No new editable surface beyond the configured target area.
- No network calls other than grok itself.
- No auto-merge, no push, no deploy.

## Steps

1. Verify first. Before editing, read the current code and the later prompts and once-over/review notes (hh-build-plan/reviews/, hh-build-plan/prompts/159-once-over.md, git log). Decide per must_have whether the defect still exists. If a must_have is already satisfied by the current code and has a test, change nothing for it and record "already fixed: <evidence>" in the summary. Do only what is still needed. If everything is already satisfied, make no code change, write the summary, and commit it with the commit line below.
2. Check whether any improve command, branch tooling, or protected-path list already exists. Reuse it.
3. Engine module (pure, no I/O where possible): front matter parse for program.md, score(evalResult), decide(score, best) strict greater-than, protectedPaths matcher (glob list from improve/protected.json: approval gate sources, the evaluation runner and its tests, DECISIONS.md, context/, .hh-driver/, hh-build-plan/prompts/, any .env or key file), and a results.tsv row formatter.
4. CLI module: hh improve --program improve/program.md --max-experiments N [--branch name] [--minutes M] [--turns T] [--dry-run]. It refuses to start on main, on a dirty tree, or with a missing program.md. It creates or checks out the improve branch, records the baseline score as experiment 0, then loops.
5. Violation check: after each grok session, diff against the prior commit. If any changed path matches protected paths, or the evaluation files' hash differs from the baseline hash, discard (reset to the prior commit), log status violation, and continue. Hash the evaluation inputs before the loop and verify before each score.
6. Budget: kill the grok process tree at the minute limit (log crash). Pass the turn cap through the same grok flag the driver uses; read run-build.ps1 for the flag name.
7. Always-authorize mode: document --always-approve for the unattended run (the build driver already uses it). The runbook section must list the deny rules that stay on even then: no edits to protected paths, no git push of any kind, no force push, no checkout of main, no deploy, no package publish, no reading or printing secrets, no edits outside the target area, no network installs of new dependencies. Implement the protected path and branch checks in the runner so they hold even when grok approves everything; list any rule that only grok-side config can enforce and say which.
8. Write docs/improve.md (what and why, flags, files, results.tsv format, how to review and merge the branch by hand) and docs/improve-runbook.md (a step by step script for Grok 4.7: preflight, baseline, one hypothesis per experiment, small diffs, read results.tsv before choosing the next idea, never repeat a discarded idea, stop conditions, what to write in the note column, what to do on a violation). Also write improve/program.md and improve/protected.json as the shipped defaults.
9. Tests with fakes only (no grok, no network): decide is strict; a score regression resets; a protected path change is a violation and resets; a main branch start is refused; a dirty tree is refused; max-experiments caps the loop and the ceiling of 50 is enforced; results.tsv gets one row per experiment with the right columns; a stop file halts the loop. Use a temporary git repo fixture for the reset tests.
10. As a checkpoint prompt, finish by reviewing your own work as Zaphod would: re-read each truth below against the code, run the full suite, fix at most one defect in a ix(review): commit. Do not add features during the review.

## Acceptance criteria

- [ ] `hh improve` exists, is listed in the command table from prompt 162, and refuses to run on main or a dirty tree.
- [ ] A commit is kept only when the score strictly improves; otherwise the branch resets to the prior commit.
- [ ] Protected paths (approval gates, evaluation, DECISIONS.md, context/, .hh-driver, prompt files, secrets) cannot change: a diff touching one is discarded and logged as violation.
- [ ] The evaluation inputs are hashed before the loop and verified before every score.
- [ ] Every experiment appends one row to improve/results.tsv.
- [ ] The loop stops at --max-experiments (default 5, ceiling 50) or when the stop file exists.
- [ ] The loop never pushes, force pushes, or deploys.
- [ ] The runbook teaches the run step by step and lists the deny rules that stay on in --always-approve mode.
- [ ] No approval gate behavior changed anywhere in the repo.

## must_haves

truths:

- `hh improve` exists, is listed in the command table from prompt 162, and refuses to run on main or a dirty tree.
- A commit is kept only when the score strictly improves; otherwise the branch resets to the prior commit.
- Protected paths (approval gates, evaluation, DECISIONS.md, context/, .hh-driver, prompt files, secrets) cannot change: a diff touching one is discarded and logged as violation.
- The evaluation inputs are hashed before the loop and verified before every score.
- Every experiment appends one row to improve/results.tsv.
- The loop stops at --max-experiments (default 5, ceiling 50) or when the stop file exists.
- The loop never pushes, force pushes, or deploys.
- The runbook teaches the run step by step and lists the deny rules that stay on in --always-approve mode.
- No approval gate behavior changed anywhere in the repo.

artifacts:

- packages/cli/src/improve/
- packages/engine/src/improve/
- docs/improve.md
- docs/improve-runbook.md
- improve/program.md
- improve/protected.json
- tests for decide, protected paths, reset, caps, and results.tsv

key_links:

- Command table (162) lists improve.
- README links docs/improve.md.
- Protected list in improve/protected.json is the one the code enforces.

prohibitions:

- Do not push, deploy, or create a remote.
- Do not weaken an approval gate (brief approval, prompt approval, Elevate, Hostinger yes).
- Do not restyle: keep the cream editorial desk, the rust rule, and the Don't Panic wordmark.
- Do not start the next prompt.
- Do not run `hh improve` for real in this session; use fakes and --dry-run.
- Do not edit run-build.ps1.

## Verification

```powershell
pnpm --filter @hitchhiker/engine test
pnpm --filter @hitchhiker/cli test
pnpm -r test
pnpm exec tsc -b --pretty false
node --experimental-strip-types packages/cli/src/main.ts improve --dry-run --max-experiments 1
```

## Report back

Put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/173.md` if that directory exists. The summary names, per must_have, "already fixed" or "fixed now" with evidence, files changed, tests run, and anything assumed.

## Commit

```
feat(cli): add hh improve, a bounded self-improving loop
```
