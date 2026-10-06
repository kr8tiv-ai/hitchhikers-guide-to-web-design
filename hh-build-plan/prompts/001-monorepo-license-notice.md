---
id: "001"
kind: build
phase: dont-panic
slice: Towel Check
title: "Scaffold the MIT monorepo and NOTICE"
tier: Towel
effort: medium
model: grok-4.7
depends_on: []
files: ["package.json", "pnpm-workspace.yaml", "tsconfig.base.json", "LICENSE", "NOTICE", ".gitignore", "packages/engine/package.json", "packages/engine/tsconfig.json", "packages/engine/src/index.ts", "packages/engine/src/workspace.ts", "packages/engine/test/workspace.test.ts", "packages/orchestrator/package.json", "packages/grok-plugin/package.json", "packages/app/package.json", "packages/cli/package.json", "packages/voice/package.json", "packages/crawler/package.json", "packages/assets/package.json", "packages/qa/package.json", "packages/deploy/package.json", "packages/knowledge/package.json", "packages/templates/package.json"]
requirements: ["HH-REPO-01"]
review_checkpoint_embedded: false
---

# 001. Scaffold the MIT monorepo and NOTICE

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

Create the pnpm workspace that later prompts compile against. The root is MIT, TypeScript strict, Node 22 or newer, and lists every package from v2 section 19. NOTICE credits vendored gsd-core by commit and states it is not a runtime dependency. A test reads the workspace and fails if a package name drifts.

## Why this prompt exists

Every later prompt needs a package to land in. Inventing folders ad hoc produces two engines and a missing license file. This prompt is only the skeleton: names, compiler defaults, license, and a test that locks the list.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 2, 19, and 23
- DECISIONS.md (D-001 is context only; this prompt does not add motion libraries)
- vendor/VENDORED.md for the gsd-core commit that NOTICE must cite

## Files to create or change

- package.json
- pnpm-workspace.yaml
- tsconfig.base.json
- LICENSE
- NOTICE
- .gitignore
- packages/engine/package.json
- packages/engine/tsconfig.json
- packages/engine/src/index.ts
- packages/engine/src/workspace.ts
- packages/engine/test/workspace.test.ts
- packages/orchestrator/package.json
- packages/grok-plugin/package.json
- packages/app/package.json
- packages/cli/package.json
- packages/voice/package.json
- packages/crawler/package.json
- packages/assets/package.json
- packages/qa/package.json
- packages/deploy/package.json
- packages/knowledge/package.json
- packages/templates/package.json

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

The Guide is a local Grok Build app, not a hosted builder and not a client website. Packages are @hitchhiker/engine, orchestrator, grok-plugin, app, cli, voice, crawler, assets, qa, deploy, knowledge, and templates. They are private. The engine is the only package with source in this prompt. Other packages get a package.json whose main points at a one-line src/index.ts that exports an empty object, so the workspace installs. Do not add React, GSAP, or a dev server. Do not create a git remote. .gitignore covers node_modules, dist, .env, .env.local, .hitchhiker-dev, and OS junk. tsconfig.base.json sets strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, module nodenext, moduleResolution nodenext, target ES2022. Root package.json is private, type module, packageManager pnpm, and engines.node >=22. Root and every package.json carry "repository": {"type": "git", "url": "git+https://github.com/kr8tiv-ai/hitchhikers-guide-to-web-design.git", "directory": "packages/<name>"} (the root omits directory), "homepage": "https://github.com/kr8tiv-ai/hitchhikers-guide-to-web-design#readme", "bugs": "https://github.com/kr8tiv-ai/hitchhikers-guide-to-web-design/issues", "license": "MIT". packages/cli is the only package that will be published: set "private": false and name it "hitchhikers-guide" (bin hh); all others stay private.

## Interfaces and data shapes

```ts
export interface WorkspacePackage {
  name: string;
  dir: string;
}

/** Read pnpm-workspace.yaml and each package.json. Throw if a name is not @hitchhiker/* (packages/cli is `hitchhikers-guide`) or if private is not true (packages/cli is the one exception). */
export function listWorkspacePackages(root: string): WorkspacePackage[];

export const EXPECTED_PACKAGES: readonly string[];
```

## Steps

1. Add the root package.json, pnpm-workspace.yaml globs `packages/*`, and tsconfig.base.json with the strict flags named in the context. Set the root name to `hitchhikers-guide` and `"private": true`.

2. Write LICENSE as MIT with copyright holder `The Hitchhiker's Guide to Web Design contributors`. Write NOTICE that names vendor/gsd-core, the commit in vendor/VENDORED.md, the MIT license, and the sentence `gsd-core is vendored source for templates. It is not an npm dependency.`

3. Create each package directory from the file list. Each package.json has name `@hitchhiker/<folder>`, private true, type module, and a test script `node --experimental-strip-types --test test/**/*.test.ts` except packages that have no tests yet, which use `node -e "process.exit(0)"` until a later prompt replaces it.

4. In packages/engine, implement listWorkspacePackages with node:fs and node:path. Parse the workspace yaml only enough to read the `packages/*` glob. Do not add a yaml dependency. Walk packages/*/package.json.

5. Export EXPECTED_PACKAGES as the twelve names in section 19. listWorkspacePackages throws WorkspaceError if the on-disk set differs.

6. Write workspace.test.ts that runs from the repo root via the engine test script, calls listWorkspacePackages, and asserts the set equality. A second assertion reads NOTICE and requires the substring `not an npm dependency`.

7. Add .gitignore entries listed in the context. Do not gitignore LICENSE, NOTICE, or source.

8. Run pnpm install and the engine test. If pnpm is missing, the summary says so and the test still runs with `node --experimental-strip-types --test packages/engine/test/workspace.test.ts` after a note. Do not commit node_modules.
9. EXPECTED_PACKAGES checks `private: true` for every package except packages/cli (published as `hitchhikers-guide`, private false). The test also asserts every package.json repository.url contains `kr8tiv-ai/hitchhikers-guide-to-web-design`.

## Edge cases

- Windows path separators: join with node:path, and compare package dirs with path.normalize.
- A package.json that is private false fails the test, except packages/cli.
- An extra folder under packages/ that has no package.json is ignored. An extra package.json fails.
- NOTICE must not paste the full gsd-core license text in this prompt. Attribution plus the commit is enough. A later audit prompt expands NOTICE.

## Acceptance criteria

- [ ] pnpm-workspace.yaml lists packages/* and twelve package.json files exist.
- [ ] LICENSE is MIT and NOTICE cites the vendored commit and denies a runtime dependency.
- [ ] workspace.test.ts passes and checks the package set.
- [ ] No motion library, no client site, and no git remote is added.

## must_haves

truths:

- The twelve package names match v2 section 19.
- TypeScript base config is strict and uses NodeNext resolution.
- gsd-core is credited and not installed from npm.

artifacts:

- package.json
- LICENSE
- NOTICE
- packages/engine/src/workspace.ts

key_links:

- workspace.test.ts calls listWorkspacePackages from packages/engine/src/workspace.ts.
- NOTICE names the commit recorded in vendor/VENDORED.md.

prohibitions:

- Do not add gsd-core, GSAP, Theatre, or any other runtime dependency.
- Do not create a GitHub repository or a git remote.
- Do not put secrets, tokens, or a personal email in LICENSE.

## Verification

Run from the repo root:

```powershell
pnpm install
pnpm --filter @hitchhiker/engine test
node --experimental-strip-types --test packages/engine/test/workspace.test.ts
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/001.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
chore: scaffold the hitchhiker monorepo and NOTICE
```
