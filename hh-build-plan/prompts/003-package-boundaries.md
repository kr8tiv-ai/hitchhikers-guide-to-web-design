---
id: "003"
kind: build
phase: dont-panic
slice: Towel Check
title: "Lock package boundaries and project references"
tier: Cup of Tea
effort: medium
model: grok-4.7
depends_on: ["001"]
files: ["tsconfig.json", "packages/engine/tsconfig.json", "packages/orchestrator/tsconfig.json", "packages/orchestrator/src/index.ts", "packages/cli/tsconfig.json", "packages/cli/src/index.ts", "packages/app/tsconfig.json", "packages/app/src/index.ts", "packages/voice/tsconfig.json", "packages/voice/src/index.ts", "packages/crawler/tsconfig.json", "packages/crawler/src/index.ts", "packages/assets/tsconfig.json", "packages/assets/src/index.ts", "packages/qa/tsconfig.json", "packages/qa/src/index.ts", "packages/deploy/tsconfig.json", "packages/deploy/src/index.ts", "packages/knowledge/tsconfig.json", "packages/knowledge/src/index.ts", "packages/templates/tsconfig.json", "packages/templates/src/index.ts", "packages/grok-plugin/tsconfig.json", "packages/grok-plugin/src/index.ts", "packages/engine/test/boundaries.test.ts", "eslint.config.js"]
requirements: ["HH-REPO-02"]
review_checkpoint_embedded: true
---

# 003. Lock package boundaries and project references

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

Make illegal imports fail at compile time. Each package exposes only src/index.ts. The orchestrator may depend on engine. The CLI may depend on engine. The app may depend on engine. Voice, crawler, assets, qa, deploy, knowledge, and templates do not depend on each other. A test greps source for deep imports such as `@hitchhiker/engine/src/workspace` and fails.

## Why this prompt exists

Without a boundary, the dashboard will import Marvin's internals and the next refactor will break three packages. Project references make the cycle obvious on day one.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 19
- packages/engine/package.json
- tsconfig.base.json

## Files to create or change

- tsconfig.json
- packages/engine/tsconfig.json
- packages/orchestrator/tsconfig.json
- packages/orchestrator/src/index.ts
- packages/cli/tsconfig.json
- packages/cli/src/index.ts
- packages/app/tsconfig.json
- packages/app/src/index.ts
- packages/voice/tsconfig.json
- packages/voice/src/index.ts
- packages/crawler/tsconfig.json
- packages/crawler/src/index.ts
- packages/assets/tsconfig.json
- packages/assets/src/index.ts
- packages/qa/tsconfig.json
- packages/qa/src/index.ts
- packages/deploy/tsconfig.json
- packages/deploy/src/index.ts
- packages/knowledge/tsconfig.json
- packages/knowledge/src/index.ts
- packages/templates/tsconfig.json
- packages/templates/src/index.ts
- packages/grok-plugin/tsconfig.json
- packages/grok-plugin/src/index.ts
- packages/engine/test/boundaries.test.ts
- eslint.config.js

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

Root tsconfig.json uses references, not a single merged program. Each package extends tsconfig.base.json, sets composite true, rootDir src, and outDir dist. exports in package.json is `.` to `./src/index.ts` for now so tests run without a build step. TypeScript references still point at the package tsconfig. eslint.config.js is a flat config with one rule the test also enforces in pure TypeScript, so the repo does not depend on eslint being installed to pass tests. The boundary test is the gate. Allowed dependency edges: cli to engine, app to engine, orchestrator to engine, qa to engine, deploy to engine, assets to engine. No edge into cli from anywhere. grok-plugin has no TypeScript dependency on other packages. It may later hold markdown only. Do not add runtime libraries.

## Interfaces and data shapes

```ts
export interface PackageBoundary {
  name: string;
  allowDeps: readonly string[];
}

export const BOUNDARIES: readonly PackageBoundary[];

export function findDeepImports(root: string): { file: string; specifier: string }[];
```

## Steps

1. Add a root tsconfig.json whose files array is empty and whose references array lists every package tsconfig.

2. Set composite, rootDir, and outDir on each package tsconfig. Add references only for the allowed edges in the context.

3. Declare those edges again in each package.json dependencies using `workspace:*`. Do not depend on packages that are not in the allow list.

4. Implement findDeepImports by walking packages/*/src and packages/*/test for the regex `@hitchhiker\/[a-z-]+\/`. A match is a deep import and a failure.

5. BOUNDARY data lives in packages/engine/src/boundaries.ts and is exported from the engine index. The test imports it from `@hitchhiker/engine` only.

6. Add a second check: no file under packages/ imports from `vendor/gsd-core` or from a relative path that escapes the package (`../` that leaves the package root). Implement that as findEscapes(root).

7. Write boundaries.test.ts covering a fixture string that contains a deep import, using a temp dir under os.tmpdir(), and covering the real repo returning an empty list.

8. Run `pnpm exec tsc -b --pretty false` from the root. Fix any reference cycle it reports. Do not silence errors with skipLibCheck as the only fix. skipLibCheck may be true in the base config because Node types vary, but a cycle is still an error.

9. Export the public functions from each package index. Empty packages export a const PACKAGE_NAME string so the reference graph typechecks.

## Edge cases

- A test file may import its own package source via a relative path. It may not deep-import another package.
- Comments that mention `@hitchhiker/engine/src` as prose should not be scanned inside markdown. Scan only .ts files.
- Windows temp dirs in the fixture test must be removed in a finally block.

## Acceptance criteria

- [ ] `tsc -b` exits 0.
- [ ] findDeepImports on the repo returns an empty array.
- [ ] orchestrator/package.json depends on @hitchhiker/engine and not on @hitchhiker/app.
- [ ] No package imports vendor/gsd-core.

## must_haves

truths:

- Public API of a package is its index.ts.
- The dependency graph matches the allow list in this prompt.
- A deep import is a failing test, not a lint warning someone can skip.

artifacts:

- tsconfig.json
- packages/engine/src/boundaries.ts
- packages/engine/test/boundaries.test.ts

key_links:

- boundaries.test.ts imports findDeepImports from @hitchhiker/engine.
- Each package tsconfig references only allowed dependencies.

prohibitions:

- Do not add a barrel file that re-exports another package's internals.
- Do not turn off composite to hide a cycle.
- Do not import from vendor/.

## Verification

Run from the repo root:

```powershell
pnpm exec tsc -b --pretty false
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/003.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
chore: lock package boundaries with project references
```

## REVIEW CHECKPOINT

This build closes a review group. After this commit, the driver runs the fresh-session reviewer prompt `004-review-001-003.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `001` Scaffold the MIT monorepo and NOTICE (Towel Check, Towel, medium)
- `002` Port GSD spine templates into the engine (Towel Check, Cup of Tea, medium)
- `003` Lock package boundaries and project references (Towel Check, Cup of Tea, medium)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.
