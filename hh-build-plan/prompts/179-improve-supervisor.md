---
id: "179"
kind: checkpoint
phase: so-long-and-thanks-for-all-the-fish
slice: Forty-Two
title: "Standing auto-improve supervisor with spawned test agents"
tier: Heart of Gold
effort: xhigh
model: grok-4.7
depends_on: ["178"]
files: ["packages/cli/src/improve/", "packages/engine/src/improve/", "packages/cli/test/", "packages/engine/test/", "docs/improve.md", "docs/improve-runbook.md", "improve/program.md", "improve/protected.json"]
review_checkpoint_embedded: false
---

# 179. Standing auto-improve supervisor with spawned test agents

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
- Read docs/improve.md, docs/improve-runbook.md, improve/program.md, and improve/protected.json first. Extend prompt 173; do not rewrite it. Reuse its decide, protected-path, hash, and results code.
- Node built-ins only. No new dependencies. Windows, macOS, and Linux.
- Tests use fakes only: no grok, no network, no real push. Do not run the supervisor for real in this session; use fakes and --dry-run.
- The supervisor enforces its rules in code, so they hold even in always-approve mode.

## Goal

Extend the `hh improve` loop from prompt 173 into a background supervisor (`hh improve supervise`). It spawns test agents (fresh `grok -p ... -m grok-4.7 --effort xhigh` sessions) that exercise the desk app and the CLI, find bugs, and loop fixes keep-or-revert against the protected evaluation from 173. After each kept fix commit it verifies the commit reaches origin main by a normal push only, and fails loudly (nonzero exit, a FAILED line in results, and a notice file) if the push did not happen or origin/main does not contain the commit. It checks that commands run inside agent sessions and git hooks do not fail, recording exit codes and hook output. It writes `improve/results.tsv`, has a max-experiment cap, protected paths (evals, approval gates, DECISIONS.md, context/, secrets, .hh-driver, hh-build-plan/prompts), and runs in always-approve mode with the driver deny rules kept: no force push, no `reset --hard` outside its own experiment rollback, no deploys, no package publish, no secret reads. UX improvement is one of its scored goals alongside tests, typecheck, anti-slop, and bug count. It includes a runbook teaching Grok 4.7 to operate it. It reviews itself at the end with at most two fix commits.

## Why this prompt exists

173 gives a bounded loop on a side branch with a human merge. The user now wants a standing supervisor that finds bugs with spawned agents, lands fixes on main with a verified push, and watches hooks and command exit codes, without giving up the protected evaluation or the deny rules.

## Read first

- docs/improve.md and docs/improve-runbook.md (from 173)
- improve/program.md and improve/protected.json
- packages/cli/src/improve/ and packages/engine/src/improve/ (decide, score, protected matcher, hash, results formatter)
- .hh-driver/run-build.ps1 (how grok is spawned, --always-approve, deny rules, push logic, stall kill) read-only
- packages/qa/ (anti-slop checks) and packages/app/e2e/ (UX and polish checks the score can reuse)
- DECISIONS.md and context/matt-answers.md (authority)

## Files to create or change

- packages/cli/src/improve/supervisor.ts, agents.ts, pushcheck.ts, hooks.ts (new modules) and main.ts command table entry for `improve supervise`
- packages/engine/src/improve/ pure additions: extended score with a ux term and a bug-count term, results row for the new columns, push-verify decision, caps
- improve/program.md (add supervisor goals, test-agent briefs, UX goal) and improve/protected.json (only to add paths, never remove)
- docs/improve.md and docs/improve-runbook.md (supervisor sections)
- packages/cli/test/ and packages/engine/test/ for each rule below

## Non-goals

- No edit to run-build.ps1 or the queue runner.
- No force push, no push to any branch other than main by the normal `git push origin main`, no deploy, no publish.
- No weakening or removal of any protected path, the evaluation, or the hash check.
- No new dependency, no network call other than grok and `git push` to origin.
- No change to approval gate behavior.

## Steps

1. Verify first. Before editing, read the current code and the git log. Decide per must_have whether the defect still exists. If a must_have is already satisfied by the current code and has a test, change nothing for it and record "already fixed: <evidence>" in the summary. Do only what is still needed. If everything is already satisfied, make no code change, write the summary, and commit it with the commit line below.
2. Design the score. Extend the 173 score with: a UX term (the polish e2e and anti-slop check pass counts from the existing suites, never a new unprotected metric) and a bug term (open findings in docs/bug-scan.md or a test-agent findings file lower the score). Keep the rule that any red test or typecheck failure scores below baseline. The evaluation runner and its tests stay protected and hashed.
3. Test agents: define two or more agent briefs in improve/program.md (desk explorer through Playwright with fixtures, CLI explorer in a temporary HOME). Each agent writes findings to a findings file in a fixed format and may only change files in the configured target area when asked to fix. Agents run with a wall-clock and turn budget and are killed as a process tree at the limit.
4. Loop: baseline, then for each experiment spawn an agent, run the fixed evaluation, keep only on strict improvement, otherwise roll back that experiment commit only (reset to the prior commit of the supervisor work, never `git reset --hard` on any other state, never on a dirty human tree). Refuse to start on a dirty tree or detached HEAD. Append one row per experiment to improve/results.tsv with the 173 columns plus pushed and hooks_ok.
5. Push verification: after a keep, run a normal `git push origin main`; then run `git fetch origin main` and confirm `git merge-base --is-ancestor <commit> origin/main`. If the push is rejected or the ancestor check fails, do not retry with force, stop the loop, write `improve/PUSH-FAILED.txt` with the git output, mark the row, and exit nonzero. Enforce in code that no argument list containing `--force`, `-f`, `--force-with-lease`, or `+refs` is ever passed to git push.
6. Command and hook checks: wrap every command the supervisor runs, and parse each agent session log for tool command exit codes. Record nonzero exits and git hook output (pre-commit, commit-msg, pre-push) in `improve/hook-log.tsv` with columns n, command, exit, hook, note. A failing hook counts as a failed experiment and is discarded; the supervisor never uses `--no-verify`.
7. Caps and stops: `--max-experiments` default 5, ceiling 50, enforced in code; stop file `improve/STOP`; a per-run wall-clock cap; a consecutive-failure cap (default 3) that stops loudly. Protected paths and the evaluation hash are checked before every score, as in 173; a violation discards and logs status violation.
8. Always-approve mode: document `--always-approve` for the unattended run and list the deny rules that stay on: protected paths, no force push, no `reset --hard` beyond its own experiment rollback, no deploy, no publish, no secret reads or prints, no edits outside the target area, no new dependency installs, no checkout away from the supervisor branch or main as configured. Say which rules only grok-side config can enforce.
9. Runbook: extend docs/improve-runbook.md with a step by step script for Grok 4.7 as operator: preflight, baseline, start the supervisor, read results.tsv, hook-log.tsv, and findings between experiments, pick one hypothesis per experiment, never repeat a discarded idea, what to do on violation, push failure, and hook failure, how UX improvement is scored, and when to stop.
10. Tests with fakes: push rejection stops the loop loudly and writes the notice file; ancestor check failure is treated as failure; a force flag in a push argument list is refused; a failing hook discards the experiment and writes a hook-log row; a protected path change is a violation; the cap and the ceiling of 50 hold; the consecutive-failure cap stops; the STOP file halts; results.tsv has the new columns; the UX and bug terms change the score as designed; a dirty tree is refused. Use a temporary git repo with a bare local remote as the origin fixture.
11. As a checkpoint prompt, finish by reviewing your own work as Zaphod would: re-read each truth below against the code, run the full suite and `node --experimental-strip-types packages/cli/src/main.ts improve supervise --dry-run --max-experiments 1`, and fix at most two defects, each in its own `fix(review):` commit. Do not add features during the review.

## Acceptance criteria

- [ ] `hh improve supervise` exists, is in the command table, and refuses a dirty tree.
- [ ] Test agents are spawned with a budget and killed at the limit; findings are written in a fixed format.
- [ ] A fix is kept only on strict score improvement against the protected, hashed evaluation; otherwise rolled back.
- [ ] Every kept commit is pushed to origin main with a normal push and verified as an ancestor of origin/main; any failure is loud and stops the loop.
- [ ] Command exit codes and git hook output are recorded in improve/hook-log.tsv; a failing hook discards the experiment; --no-verify is never used.
- [ ] improve/results.tsv gets one row per experiment with the new columns.
- [ ] Caps hold: max-experiments (default 5, ceiling 50), STOP file, wall-clock, consecutive failures.
- [ ] Protected paths are never edited and no force push, hard reset beyond rollback, deploy, or publish is possible.
- [ ] UX improvement is one scored goal.
- [ ] The runbook teaches Grok 4.7 to operate it.
- [ ] No approval gate behavior changed anywhere.

## must_haves

truths:

- The supervisor never passes a force flag to git push and verifies origin/main contains each kept commit.
- The protected paths list and the evaluation hash hold in always-approve mode.
- Hook and command failures are recorded and discard the experiment.
- UX is scored through existing protected suites.
- Caps and the STOP file halt the loop.

artifacts:

- packages/cli/src/improve/ supervisor modules
- packages/engine/src/improve/ pure score and push-verify logic
- improve/results.tsv format, improve/hook-log.tsv format
- docs/improve-runbook.md supervisor section

key_links:

- Command table lists `improve supervise`.
- README still links docs/improve.md.
- improve/protected.json is the list the code enforces.

prohibitions:

- Do not push, deploy, or create a remote.
- Do not weaken an approval gate (brief approval, prompt approval, Elevate, Hostinger yes).
- Do not restyle: keep the cream editorial desk, the rust rule, and the Don't Panic wordmark.
- Do not weaken, skip, or delete a test.
- Do not start the next prompt.
- Do not edit run-build.ps1.

## Verification

```powershell
pnpm --filter @hitchhiker/engine test
pnpm --filter @hitchhiker/cli test
pnpm lint
pnpm typecheck
pnpm -r test
pnpm exec tsc -b --pretty false
node --experimental-strip-types packages/cli/src/main.ts improve supervise --dry-run --max-experiments 1
```

## Report back

Put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/179.md` if that directory exists. The summary names, per must_have, "already fixed" or "fixed now" with evidence, files changed, tests run, and anything assumed.

## Commit

```
feat(cli): add hh improve supervise, a verified background improve supervisor
```
