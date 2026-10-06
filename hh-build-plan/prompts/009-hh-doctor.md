---
id: "009"
kind: build
phase: dont-panic
slice: Towel Check
title: "Add the hh binary and /hh-doctor probes"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["006", "007"]
files: ["packages/cli/package.json", "packages/cli/src/main.ts", "packages/cli/src/doctor.ts", "packages/cli/src/session-probe.ts", "packages/cli/test/doctor.test.ts", "packages/cli/test/session-probe.test.ts", "packages/engine/src/index.ts"]
requirements: ["HH-CLI-01"]
review_checkpoint_embedded: false
---

# 009. Add the hh binary and /hh-doctor probes

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

Ship a `hh` command whose `doctor` subcommand reports node, git, and whether `grok` is on PATH, and probes how this machine's Grok CLI treats session ids. The probe must not assume a human alias is a legal `--session-id`. It writes the discovered mode into config only when a project directory is passed. Missing optional tools are warnings, not crashes.

## Why this prompt exists

The orchestrator will pass `--session-id` and `--effort` on every site prompt. The docs disagree about whether the id is a UUID. Doctor is the one place that learns the answer on this computer.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 18
- hh-build-plan/RESEARCH-ADDENDUM.md section on Grok CLI flags and the session-id conflict
- context/sources/xai/cli_reference.md (--session-id typed as UUID, --effort, grok doctor is not a subcommand)
- context/sources/xai/cli_headless-scripting.md (`-s` named session)
- packages/engine/src/config.ts

## Files to create or change

- packages/cli/package.json
- packages/cli/src/main.ts
- packages/cli/src/doctor.ts
- packages/cli/src/session-probe.ts
- packages/cli/test/doctor.test.ts
- packages/cli/test/session-probe.test.ts
- packages/engine/src/index.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

Implement `hh` as a Node bin pointing at packages/cli/src/main.ts with a shebang `#!/usr/bin/env node`. Subcommands in this prompt: `doctor` only. Other names print the one-line help and exit 2. doctor checks: node version >= 22, git version by spawning `git --version`, grok by spawning `grok --version` or, if that fails, `where.exe grok` on Windows and `which` is not required because `where.exe` and `command -v` differ. Use `node:child_process` spawnSync and PATH. Do not require playwright, whisper, or pdftotext. Report them as `not installed` if absent, exit code still 0. session probe: do not hit the network. Read `grok --help` output if grok exists. If the help text contains a UUID example for session-id, record mode `uuid`. If grok is missing, mode stays `unknown` and the report says the probe was skipped. Add a pure function classifyHelp(helpText): SessionIdMode so the test does not need the binary. A fixture help string that says `UUID` maps to `uuid`. A fixture that says `session name` and does not say UUID maps to `alias`. A fixture that mentions both maps to `unknown` and the report tells the user to pass an explicit flag later. `--effort` presence in help is a boolean on the report, not a failure if absent. `hh doctor --project <dir>` loads config and, if mode is not unknown, writes sessionIdMode through saveState's project dir. Writing config must go through a new saveConfig in the engine that uses the state lock and temp-rename. You may add saveConfig to packages/engine/src/config.ts in this prompt because the CLI cannot persist the probe without it. List that file in your summary if you touch it. The file list includes the engine index export.

## Interfaces and data shapes

```ts
export interface DoctorReport {
  nodeOk: boolean;
  nodeVersion: string;
  gitOk: boolean;
  grokOnPath: boolean;
  grokVersion: string | null;
  sessionIdMode: "unknown" | "uuid" | "alias";
  effortFlag: boolean;
  warnings: string[];
}

export function classifyHelp(helpText: string): {
  sessionIdMode: "unknown" | "uuid" | "alias";
  effortFlag: boolean;
};

export function saveConfig(projectDir: string, config: GuideConfig): Promise<void>;
```

## Steps

1. Add the bin entry `hh` in packages/cli/package.json and implement main.ts argv parsing without a CLI framework. `hh doctor` and `hh doctor --project <dir>` are the only successful forms.

2. Implement the tool checks with spawnSync, shell false, and timeouts of 10 seconds. A missing git sets gitOk false and adds a warning. Exit 0 unless node is older than 22, which exits 1.

3. classifyHelp is pure. UUID detection is a case-insensitive search for `uuid` in the same paragraph as `session`. If you cannot see session and uuid in the same help, and you can see `name` next to session, return alias. Both or neither returns unknown.

4. Tests feed three fixture strings: uuid-only help, alias-only help, and a string that contains both words. Assert the three modes. A fourth test asserts effortFlag true only when `--effort` appears.

5. Add saveConfig next to loadConfig. It takes withStateLock, writes config.json via temp file and rename, and refuses to write a key that parseConfig would reject. Round-trip test it.

6. doctor --project updates sessionIdMode only when classifyHelp returns uuid or alias. unknown leaves the file unchanged. If config.json is missing, write defaultConfig() with the discovered mode.

7. The human output is plain text lines, one fact per line, no emoji, no exclamation mark. Example keys: `node: 22.0.0 ok`, `grok: not on PATH`, `session-id: unknown`.

8. Do not spawn `grok` with a prompt, an API call, or `--always-approve`. Version and help only.

9. Wire `pnpm --filter @hitchhiker/cli test`. Export classifyHelp from the cli index for tests. Engine exports saveConfig.

## Edge cases

- grok --help that exits non-zero still passes its stdout and stderr into classifyHelp, then adds a warning.
- A project dir without `.hitchhiker` gets the directory created before saveConfig takes the lock.
- Do not treat the string `session` inside `sessionStorage` as evidence. Require the flag spelling `--session-id` or `-s` in the help fixture logic, and document the rule in the function comment.

## Acceptance criteria

- [ ] Three classifyHelp fixtures return uuid, alias, and unknown respectively.
- [ ] Old Node logic is unit-tested by passing a version string into a pure function `nodeIsSupported(version)`.
- [ ] saveConfig round-trips and uses the lock.
- [ ] doctor does not require whisper, playwright, or pdftotext.

## must_haves

truths:

- Session-id mode is probed, not assumed.
- A missing grok binary is a warning.
- Config writes go through the state lock.

artifacts:

- packages/cli/src/doctor.ts
- packages/cli/src/session-probe.ts
- packages/engine/src/config.ts

key_links:

- doctor.ts calls classifyHelp and, with --project, saveConfig.
- session-probe.test.ts covers uuid, alias, and both.

prohibitions:

- Do not call the xAI API.
- Do not document a `grok doctor` subcommand. It is not in the CLI reference.
- Do not fail the process because whisper.cpp is absent.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/cli test
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/009.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(cli): add hh doctor and session-id probe
```

