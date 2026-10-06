# 004 Review — prompts 001, 002, 003

Verdict: **PASS**

Reviewed: 2026-10-06. Fresh session. No fix commits. No source changes in this review.

HEAD reviewed: `86d1fef` (`chore: lock package boundaries with project references`).

This verdict is the nine must-have truths below, each with a test name or a file line, plus the verification commands. It is not a general impression of the tree.

## History

Three build commits, in order, on top of `85ac878`. Messages match the prompt commit lines. They are not squashed. History was not rewritten. `origin` already pointed at `https://github.com/kr8tiv-ai/hitchhikers-guide-to-web-design.git` (D-002). Prompt 001 did not create it.

| Order | Commit | Message | Prompt commit line |
| --- | --- | --- | --- |
| 1 | `1d65c61` | `chore: scaffold the hitchhiker monorepo and NOTICE` | same |
| 2 | `42a3611` | `feat(engine): port GSD spine templates into .hitchhiker shape` | same |
| 3 | `86d1fef` | `chore: lock package boundaries with project references` | same |

## 001 Scaffold the MIT monorepo and NOTICE

### Truths

- The twelve package names match v2 section 19. `EXPECTED_PACKAGES` in `packages/engine/src/workspace.ts` lists `@hitchhiker/engine`, `orchestrator`, `grok-plugin`, `app`, `voice`, `crawler`, `assets`, `qa`, `deploy`, `knowledge`, `templates`, and `hitchhikers-guide` for `packages/cli`. That is section 19's twelve folders, with the cli publish name prompt 001 requires. Test `workspace package set matches EXPECTED_PACKAGES` asserts set equality against the on-disk manifests, `private: false` only for the cli, and `repository.url` containing `kr8tiv-ai/hitchhikers-guide-to-web-design`.
- TypeScript base config is strict and uses NodeNext resolution. `tsconfig.base.json` sets `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `module: nodenext`, `moduleResolution: nodenext`, and `target: ES2022`. Prompt 001 did not require a unit test that reads this file. `pnpm exec tsc -b --pretty false` loads it and exits 0.
- gsd-core is credited and not installed from npm. Test `NOTICE states gsd-core is not an npm dependency` requires `vendor/gsd-core`, commit `13d37238ba08377929e4850fd6ae4b8db49a22ca` (the commit in `vendor/VENDORED.md`), and the sentence `not an npm dependency`. Root `package.json` has no `dependencies`. `pnpm-lock.yaml` has no `gsd-core`, `gsap`, or `theatre` entry. No package manifest depends on gsd-core.

### Also checked

- Root is private, `type: module`, `packageManager: pnpm@10.32.1`, `engines.node: >=22`, license MIT.
- `pnpm-workspace.yaml` glob is `packages/*`.
- `LICENSE` copyright holder is `The Hitchhiker's Guide to Web Design contributors`. No personal email.
- `packages/cli` is `hitchhikers-guide`, `private: false`, bin `hh`.
- Other packages are private and use `node -e "process.exit(0)"` until they have tests. The engine test script is `node --experimental-strip-types --test test/**/*.test.ts`.

## 002 Port GSD spine templates into the engine

### Truths

- The Guide does not runtime-import gsd-core. Test `the repo has no deep imports and no package escapes` calls `findEscapes` on the repo and expects `[]`. Test `relative imports inside a package are allowed; escapes and vendor imports are not` plants a `vendor/gsd-core` import in a temp dir and expects a hit. `packages/engine/src/templates.ts` reads the copied files with `node:fs` from `import.meta.url`. A search of `packages/**/*.ts` finds no import of `vendor/gsd-core`. gsd-core is not in any `package.json`.
- Roadmap and state shapes survive the port. Test `renderTemplate fills project and state and strips host wording` requires roadmap sections Overview, Phases, Phase Details, and Progress, the phase-detail labels Goal, Depends on, Requirements, Success Criteria, and Plans, and the progress columns `Phase | Plans Complete | Status | Completed`. `packages/engine/templates/gsd/roadmap.md` keeps those, and puts the six locked phase names only in an HTML comment (Don't Panic, Babel Fish, Deep Thought, Improbability Drive, Mostly Harmless, So Long and Thanks for All the Fish), not as a filled client roadmap. `packages/engine/templates/gsd/state.md` keeps current phase, slice, prompt id, last good commit, blockers, and next action, and uses `.hitchhiker/` in path examples. The same test renders state with `Towel & Tea` and the date.
- Host-specific Claude and `.planning` wording is gone from the ten files. Test `every spine file is free of host paths and Claude slash commands` renders all ten and fails on `.planning`, `Claude`, `Claude Code`, `copilot` (any case), `~/.claude`, or a `/gsd:` / `/gsd-` slash command. A direct search of `packages/engine/templates/gsd/` finds none of those strings. `.planning` in the vendor originals is `.hitchhiker/` in the port (33 path hits). Claude Code slash-command blocks are the line `Commands for this project are /hh-* as defined by the Guide.`

### Also checked

- Ten files, each first line `Adapted from vendor/gsd-core` plus commit `13d37238ba08377929e4850fd6ae4b8db49a22ca`. Test `listSpineTemplates returns the ten spine files with attribution`.
- `{{project_name}}` and `{{date}}` are filled in project and state. A missing variable throws `TemplateError` and does not return the token. Test `a missing variable throws and does not return the token`.
- `config.json` keys are model, effort, budgets, gates, deployTarget, voiceEngine, interviewDepth, and `sessionIdMode: "unknown"`. Test `a template with no tokens still renders`.
- NOTICE has a paragraph for the adapted templates and says gsd-core is not imported at runtime.
- `vendor/` was not edited in `85ac878..HEAD`.

## 003 Lock package boundaries and project references

### Truths

- Public API of a package is its index.ts. Every package `exports` map is only `".": "./src/index.ts"`, with `main` the same path. Root `tsconfig.json` has an empty `files` array and references all twelve package tsconfigs. Each package tsconfig sets `composite: true`, `rootDir: src`, `outDir: dist`. Test `tsconfig references follow the same allow list` locks composite, rootDir, and outDir.
- The dependency graph matches the allow list in prompt 003. `BOUNDARIES` in `packages/engine/src/boundaries.ts` allows only cli (`hitchhikers-guide`), app, orchestrator, qa, deploy, and assets to depend on `@hitchhiker/engine`. Voice, crawler, knowledge, templates, grok-plugin, and engine have empty allow lists. Nothing may depend on the cli. Test `package.json dependencies match BOUNDARIES` requires those edges as `workspace:*` and no others. The tsconfig test requires a reference to `../engine` only on that same allow list. Orchestrator depends on `@hitchhiker/engine` and not on `@hitchhiker/app`.
- A deep import is a failing test, not a lint warning someone can skip. Test `a fixture deep import fails, including a .ts comment, and markdown is ignored` writes `@hitchhiker/engine/src/workspace` under `os.tmpdir()`, expects two `.ts` hits (import and comment), and ignores a markdown file. The repo scan test expects an empty list. `eslint.config.js` repeats the rule, and ESLint is not installed. The test is the gate. Cleanup is in a `finally` block.

### Also checked

- `boundaries.test.ts` imports `findDeepImports`, `findEscapes`, and `BOUNDARIES` from `@hitchhiker/engine`, not from a deep path.
- `pnpm exec tsc -b --pretty false` exits 0. `skipLibCheck` is true in the base config, which prompt 003 allows. It is not hiding a cycle: the build reported no reference cycle.
- No `any` in `packages/**/*.ts`.

## File list

`git diff --name-only 85ac878..HEAD` stays inside the three prompts plus files the steps required and the commits named:

- `pnpm-lock.yaml` from `pnpm install`.
- One-line `src/index.ts` stubs. Prompt 001's context requires them so the workspace installs. Prompt 003's file list includes them and replaces the empty export with `PACKAGE_NAME`.
- `packages/engine/src/boundaries.ts`. Prompt 003's steps and artifacts require it. The YAML `files` array omitted it.
- `dependencies` on the package manifests (prompt 003 step 3) and root `devDependencies` so `tsc -b` exists: `typescript` 5.9.3 (Apache-2.0) and `@types/node` 22.20.5 (MIT), recorded in NOTICE.
- `*.tsbuildinfo` added to `.gitignore` so declaration emit is not committed.

No extra feature. Nothing to revert. No motion library, no client site, no new remote.

## UI

No UI changed. `packages/app/` gained `package.json`, `tsconfig.json`, and `src/index.ts`. That index is `import "@hitchhiker/engine"` and `export const PACKAGE_NAME = "@hitchhiker/app"`. There is no screen, no stylesheet, and no `packages/app/src/design/`. Screenshots at 375 and 1440 were not taken. This is not a visual pass.

## Live Grok

Prompts 001, 002, and 003 do not call a model. There is no scripted stub standing in for a live call. The 011 adapter does not exist yet, and these prompts do not need it.

## Authority

No conflict with `context/matt-answers.md` or `DECISIONS.md`. D-001 and D-008 (motion toolkit) are out of scope and were not implemented. D-002's repo URL is the URL in every manifest. D-003's live-call rule does not apply to these three prompts.

## Notes for later prompts

These are not failed truths.

- `packages/engine/templates/gsd/config.json` starts with the attribution HTML comment, then the JSON object. Prompt 002 step 8 requires that first line on every spine file. `JSON.parse` of the whole render throws. The test slices from the first `{`. A later reader has to do the same.
- `renderTemplate`, `listSpineTemplates`, and `TemplateError` are exported from `packages/engine/src/templates.ts`. They are not re-exported from `packages/engine/src/index.ts`. Prompt 002's test imports the module by relative path. Prompt 003 allows that inside the same package. Another package cannot reach them through `@hitchhiker/engine` until a later prompt adds the barrel export. A deep import would fail `findDeepImports`.
- The port still names GSD roles: `gsd-planner`, `gsd-verifier`, `agents/gsd-planner.md`, `agents/gsd-verifier.md`, and `gsd_state_version`. Those are not `.planning` paths and not Claude slash commands. The host-wording test does not treat them as failures, and the files match the truth as written.

## Verification

Run from the repo root on 2026-10-06. All exited 0.

| Command | Result |
| --- | --- |
| `pnpm install` | Already up to date. Lockfile unchanged. |
| `pnpm --filter @hitchhiker/engine test` | 13 passed, 0 failed. |
| `node --experimental-strip-types --test packages/engine/test/workspace.test.ts` | 2 passed, 0 failed. |
| `pnpm exec tsc -b --pretty false` | Exit 0. No diagnostics. |

Node printed `NO_COLOR` / `FORCE_COLOR` warnings. They did not fail the runs.

## Scope

No new feature. Prompt 005 was not started. Nothing was pushed, deployed, or published.
