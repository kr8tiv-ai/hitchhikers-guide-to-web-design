---
id: "101"
kind: build
phase: improbability-drive
slice: Vogon Constructor Fleet
title: "Route effort, bump it once on retry, and gate the worktrees flag"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["096", "006", "098"]
files: ["packages/orchestrator/src/effort.ts", "packages/orchestrator/test/effort.test.ts", "packages/orchestrator/src/worktrees.ts", "packages/orchestrator/test/worktrees.test.ts"]
requirements: ["HH-DRIVE-04", "HH-DRIVE-12"]
review_checkpoint_embedded: false
---

# 101. Route effort, bump it once on retry, and gate the worktrees flag

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

Map a site prompt's tier to an effort flag. On a failed attempt, bump effort one step and no further than xhigh. Forty-Two starts at xhigh and stays there. Do not invent an effort above xhigh.

Merged scope (formerly a separate prompt, "Keep parallel worktrees off unless config says otherwise"): Expose a function that returns the directory a prompt should run in. The default is the project directory. When config.worktrees is true, return a sibling path and a planned git command, but do not run git in the unit test. The default config remains false.

## Why this prompt exists

Retrying a hard prompt at the same effort wastes a loop. Retrying forever at a made-up ultra effort is not a real flag.

Parallel worktrees are a power tool. Turning them on by default will have two prompts editing the same site.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 5.3 and 11
- packages/orchestrator/src/runner.ts
- hh-build-plan/CONTEXT-PACKAGE.v2.md section 11 and config worktrees default
- packages/engine/src/config.ts

## Files to create or change

- packages/orchestrator/src/effort.ts
- packages/orchestrator/test/effort.test.ts
- packages/orchestrator/src/worktrees.ts
- packages/orchestrator/test/worktrees.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

Towel and Cup of Tea start at medium. Gargle Blaster starts at high. Heart of Gold starts at high. Forty-Two starts at xhigh. bump(effort) goes medium to high, high to xhigh, xhigh stays xhigh and sets capped true. The runner reads this helper. A test asserts three failures do not produce a fourth effort name.

Merged scope, "Keep parallel worktrees off unless config says otherwise": resolveWorkdir({ projectDir, config, promptId }) returns `{ dir, command }`. command is null when worktrees are off. When on, command is the argv `['git','worktree','add', dir, '-b', branch]` and dir is outside the project, using path.join(dirname(projectDir), `.hh-wt-${promptId}`). The function does not execute it. A test with defaultConfig() expects the project dir and a null command.

## Interfaces and data shapes

```ts
export function effortForTier(tier: string): "medium" | "high" | "xhigh";
export function bumpEffort(effort: "medium" | "high" | "xhigh"): { effort: "medium" | "high" | "xhigh"; capped: boolean };
```

```ts
export function resolveWorkdir(input: { projectDir: string; worktrees: boolean; promptId: string }): { dir: string; command: string[] | null };
```

## Steps

1. Implement the map. Unknown tier throws.

2. bump from medium is high uncapped. From high is xhigh uncapped. From xhigh is xhigh capped.

3. A loop in the test bumps five times from medium and the last is xhigh capped.

4. Do not read the network.

5. Export both.

6. Add a table test for all five tiers.

7. Comment that `--effort` is the CLI flag from the xAI docs in the repo, not a custom protocol.

8. Do not change the runner's argv beyond a call you add: buildArgv already takes effort. A test shows Forty-Two produces xhigh in argv via buildArgv.

9. Default path returns the project dir.

10. worktrees true returns a command that evaluateCommand would allow. git worktree add is not push. Do not special-case it into a deny.

11. promptId with a slash throws.

12. Do not call spawn.

13. Assert defaultConfig().worktrees is still false.

14. Export the function.

15. Use node:path.

16. No network.

## Edge cases

- Tier comparison is exact, including spaces in `Cup of Tea`.
- null tier throws.
- Empty promptId throws.
- projectDir is not created here.

## Acceptance criteria

- [ ] Each tier maps to a legal effort.
- [ ] Bumping never leaves the three-value set.
- [ ] xhigh is capped.
- [ ] The default is a single directory.
- [ ] The worktree command is returned, not run.
- [ ] Config default remains false.

## must_haves

truths:

- Retries escalate effort once per step and then stop escalating.
- The flag values are ones the CLI knows.
- Parallel checkouts are opt-in.
- The unit test does not create a worktree.

artifacts:

- packages/orchestrator/src/effort.ts
- packages/orchestrator/src/worktrees.ts

key_links:

- effortForTier feeds runPrompt's effort field.
- worktrees reads the boolean from GuideConfig.

prohibitions:

- Do not invent effort `ultra` or `max`.
- Do not call grok.
- Do not enable worktrees by default.
- Do not run git worktree in the test.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/orchestrator test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/101.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(orchestrator): route and bump effort
```
