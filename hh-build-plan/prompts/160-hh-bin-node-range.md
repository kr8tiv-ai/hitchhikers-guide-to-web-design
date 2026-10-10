---
id: "160"
kind: build
phase: so-long-and-thanks-for-all-the-fish
slice: Don't Panic Release
title: "Make the hh bin runnable on the stated Node range"
tier: Heart of Gold
effort: xhigh
model: grok-4.7
depends_on: ["159"]
files: ["packages/cli/src/main.ts", "packages/cli/test/shebang.test.ts", "README.md", "packages/cli/package.json"]
review_checkpoint_embedded: false
---

# 160. Make the hh bin runnable on the stated Node range

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

- Ship-path fix. No command behavior change.
- Keep TypeScript imports erasable (no enums, namespaces, parameter properties) so node strip-types runs the file.

## Goal

Make the `hh` bin start on every Node version the repo claims to support. Preferred fix: the first line of packages/cli/src/main.ts is `#!/usr/bin/env -S node --experimental-strip-types`. Alternative, only if the shebang cannot work on a supported platform: raise `engines.node` to `>=22.18` (where type stripping is on by default) and say so in README.

## Why this prompt exists

A bare `#!/usr/bin/env node` shebang fails on Node 22 releases before type stripping is default, so `hh` can crash on the very Node range the docs promise.

## Read first

- DECISIONS.md and context/matt-answers.md (authority)
- README.md
- package.json (root) and packages/cli/package.json
- packages/cli/src/main.ts and packages/cli/test/

## Files to create or change

- `packages/cli/src/main.ts`
- `packages/cli/test/shebang.test.ts`
- `README.md`
- `packages/cli/package.json`

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Non-goals

- No change to any command output, flags, or exit codes.
- No build step or bundler added.
- No change to the quick start text beyond the Node range note (prompt 161 owns the quick start).

## Steps

1. Verify first. Before editing, read the current code and the later prompts and once-over/review notes (hh-build-plan/reviews/, hh-build-plan/prompts/159-once-over.md, git log). Decide per must_have whether the defect still exists. If a must_have is already satisfied by the current code and has a test, change nothing for it and record "already fixed: <evidence>" in the summary. Do only what is still needed. If everything is already satisfied, make no code change, write the summary, and commit it with the commit line below.
2. Read the current shebang, engines fields, and README Node statement. Pick the shebang fix unless engines already says >=22.18 and README agrees.
3. Apply the fix.
4. Add packages/cli/test/shebang.test.ts: read main.ts, assert line 1 contains --experimental-strip-types (or, for the engines route, assert engines.node is >=22.18 and README names it). Add an assertion that main.ts and its relative imports contain no TS-only runtime syntax (enum, namespace, constructor parameter properties).
5. Run the verification commands.

## Acceptance criteria

- [ ] Line 1 of packages/cli/src/main.ts is a shebang that enables type stripping, or engines.node is >=22.18 and README says so.
- [ ] A test fails if the shebang loses the flag (or the engines floor drops).
- [ ] A test fails if the CLI entry graph uses non-erasable TypeScript syntax.
- [ ] No command behavior changed.

## must_haves

truths:

- Line 1 of packages/cli/src/main.ts is a shebang that enables type stripping, or engines.node is >=22.18 and README says so.
- A test fails if the shebang loses the flag (or the engines floor drops).
- A test fails if the CLI entry graph uses non-erasable TypeScript syntax.
- No command behavior changed.

artifacts:

- packages/cli/test/shebang.test.ts

key_links:

- README Node range matches package.json engines.

prohibitions:

- Do not push, deploy, or create a remote.
- Do not weaken an approval gate (brief approval, prompt approval, Elevate, Hostinger yes).
- Do not restyle: keep the cream editorial desk, the rust rule, and the Don't Panic wordmark.
- Do not start the next prompt.

## Verification

```powershell
pnpm --filter @hitchhiker/cli test
node --experimental-strip-types packages/cli/src/main.ts doctor
pnpm exec tsc -b --pretty false
```

## Report back

Put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/160.md` if that directory exists. The summary names, per must_have, "already fixed" or "fixed now" with evidence, files changed, tests run, and anything assumed.

## Commit

```
fix(cli): run the hh bin with type stripping enabled
```
