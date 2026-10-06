---
id: "149"
kind: build
phase: so-long-and-thanks-for-all-the-fish
slice: NOTICE Board
title: "Grok Build plugin command set"
tier: Heart of Gold
effort: high
model: grok-4.7
depends_on: ["148", "138", "009", "034"]
files: ["packages/grok-plugin/skills/", "packages/grok-plugin/agents/", "packages/grok-plugin/hooks/hh-deny.json", "packages/grok-plugin/rules/hh-rules.md", "packages/grok-plugin/src/commands.ts", "packages/grok-plugin/test/commands.test.ts", "packages/grok-plugin/package.json"]
requirements: ["HH-PLUGIN-02"]
review_checkpoint_embedded: false
---

# 149. Grok Build plugin command set

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

Write every v2 §18 command as a `user-invocable: true` skill: /hh-new, /hh-dont-panic, /hh-import, /hh-babel-fish, /hh-logo, /hh-assets, /hh-deep-thought, /hh-drive, /hh-review, /hh-fix, /hh-mostly-harmless, /hh-elevate, /hh-so-long, /hh-progress, /hh-pause, /hh-resume, /hh-undo, /hh-budget, /hh-settings, /hh-doctor, /hh-dashboard, /hh-help. Side-effecting ones (/hh-drive, /hh-so-long, /hh-assets, /hh-undo) set `disable-model-invocation: true`. Each calls the hh CLI. Add agents (Guide, Deep Thought, Zaphod, Marvin, Eddie), hooks (the deny list), and rules (Q2).

## Why this prompt exists

Grok Build is where Matt's users live (Q2). The plugin is the front door: typing /hh-new should start the Guide, and side-effecting commands must never fire because the model guessed.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- context/sources/xai/features_skills-plugins-marketplaces.md, features_hooks.md, features_subagents.md, features_project-rules.md (exact formats; do not invent fields)
- hh-build-plan/CONTEXT-PACKAGE.v2.md section 18
- packages/cli/src/main.ts (every hh subcommand)
- packages/cli/src/install.ts (148)
- packages/orchestrator/src/policy.ts (097)
- context/matt-answers.md and DECISIONS.md (authority; they override this prompt)

## Files to create or change

- packages/grok-plugin/skills/
- packages/grok-plugin/agents/
- packages/grok-plugin/hooks/hh-deny.json
- packages/grok-plugin/rules/hh-rules.md
- packages/grok-plugin/src/commands.ts
- packages/grok-plugin/test/commands.test.ts
- packages/grok-plugin/package.json

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

Each skill lives at packages/grok-plugin/skills/hh-<name>/SKILL.md with frontmatter name, description (one line, plain), user-invocable: true, and disable-model-invocation: true for the four side-effecting commands. The body tells Grok exactly which hh command to run, what to show the user, and what never to do (push, deploy, or spend without the user's yes). commands.ts exports the command table (name, cli, sideEffect) generated from packages/cli so the README (150) can list real commands. Agents are markdown files under agents/ (guide.md, deep-thought.md, zaphod.md, marvin.md, eddie.md) with a role, tools allowed, and handoff rules. hooks/hh-deny.json encodes the 097 deny list (git push, deploy commands, rm -rf outside the project, reading credential files) in the documented hook format. rules/hh-rules.md is the short project rule set. 148's installer copies these into a project's .grok/.

## Interfaces and data shapes

```ts
export interface HhCommand { name: string; skillDir: string; cli: string[]; sideEffect: boolean }
export const COMMANDS: readonly HhCommand[];
export function validateSkill(md: string): string[];
```

## Steps

1. Write COMMANDS from the CLI's real subcommands; a test fails if a command has no matching CLI subcommand.

2. Write the 22 SKILL.md files with valid frontmatter; side-effecting ones carry disable-model-invocation: true.

3. Write the five agents, the deny hook, and the rules file in the documented formats.

4. Write validateSkill and a test over every skill.

5. If grok is on PATH, install into a temp project with 148's installer and run `grok inspect --json`; assert all skills are listed. Otherwise skip with a note.

## Edge cases

- A doc format differs from this prompt: follow the doc and record the difference.
- A command without a CLI implementation yet: the skill says so plainly and points to /hh-help.
- Windows paths in hook commands use node-resolved paths, not POSIX literals.

## Acceptance criteria

- [ ] All 22 skills exist with valid frontmatter.
- [ ] The four side-effecting skills disable model invocation.
- [ ] grok inspect --json lists all skills when grok is available.

## must_haves

truths:

- Every Guide command is reachable as a Grok Build skill.
- Side-effecting commands only run when the user invokes them.
- The deny list is enforced by a hook as well as the orchestrator.

artifacts:

- packages/grok-plugin/skills/
- packages/grok-plugin/hooks/hh-deny.json
- packages/grok-plugin/src/commands.ts

key_links:

- COMMANDS mirrors packages/cli subcommands.
- 148's installer copies the plugin into .grok/.

prohibitions:

- Do not let the model invoke /hh-drive, /hh-so-long, /hh-assets, or /hh-undo on its own.
- Do not invent frontmatter fields the docs do not define.
- Do not include push or deploy steps without the yes gate.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/grok-plugin test
grok inspect --json
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/149.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(plugin): the full /hh command set as Grok Build skills
```
