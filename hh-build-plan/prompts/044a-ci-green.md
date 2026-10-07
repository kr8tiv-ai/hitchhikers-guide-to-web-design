---
id: "044a"
kind: build
phase: dont-panic
slice: Towel Check
title: "Get GitHub CI checks green"
tier: Cup of Tea
effort: high
model: grok-4.7
depends_on: ["044"]
files: ["packages/app/tsconfig.json", "packages/app/package.json", "packages/app/src/motion-previews/previews/shader-ogl.ts", "packages/app/src/motion-previews/previews/theatre-sequence.ts", "packages/app/src/motion-previews/previews/three-hero.ts", "packages/app/src/motion-previews/index.ts", ".github/workflows/audit.yml", ".github/workflows/e2e.yml", "packages/engine/test/ci-workflows.test.ts", "docs/ci.md", "pnpm-lock.yaml"]
requirements: ["HH-CI-01"]
review_checkpoint_embedded: false
---

# 044a. Get GitHub CI checks green

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

- This is a CI green-up between phase-1 checkpoint 044 and phase-2 prompt 045. Fix only the failures listed below. Do not start 045 work.
- Keep secret scanning ON. Do not disable the Audit secret-scan job.
- Do not add a `GITLEAKS_LICENSE` secret or any `secrets.` reference. CI must stay secret-free.
- Do not force-push. Do not rewrite history. Do not touch `.hh-driver/`.
- Use PowerShell for terminal commands (`;` not `&&`).

## Goal

Make the three GitHub Actions workflows (CI, Audit, E2E) pass on `main` after this commit. The failures were observed on checkpoint 040 (commit `1254c16`) and earlier; they still apply.

## Why this prompt exists

Phase 1 ends at 044. Phase 2 must start green. Matt Haynes approved a single Grok Build prompt to clear the red checks before 045.

## Read first

- `.github/workflows/ci.yml`, `.github/workflows/audit.yml`, `.github/workflows/e2e.yml`
- `docs/ci.md`
- `packages/engine/test/ci-workflows.test.ts`
- `packages/app/tsconfig.json` and `tsconfig.base.json`
- `packages/app/package.json` (three `0.186.0`, ogl `1.0.11`, `@theatre/core` `0.7.2`, `@playwright/test` `1.63.0`)
- `packages/app/src/motion-previews/index.ts` (lines around the `querySelectorAll` for-of loops)
- `packages/app/src/motion-previews/previews/shader-ogl.ts`
- `packages/app/src/motion-previews/previews/theatre-sequence.ts`
- `packages/app/src/motion-previews/previews/three-hero.ts`

## Failures to fix

### 1. CI workflow — typecheck (windows / macos / linux)

**A. `NodeListOf<Element>` not iterable (TS2488)** in `packages/app/src/motion-previews/index.ts` around lines 127 and 179 (`for ... of root.querySelectorAll(...)`).

Fix: add `"DOM"` and `"DOM.Iterable"` to the `lib` array used by `packages/app`. Prefer overriding `compilerOptions.lib` in `packages/app/tsconfig.json` to `["ES2022", "DOM", "DOM.Iterable"]` (base only has `ES2022`). `Array.from(...)` is an acceptable fallback if you must avoid touching tsconfig, but prefer the lib fix so DOM types stay consistent.

**B. ogl namespace misuse** in `packages/app/src/motion-previews/previews/shader-ogl.ts` lines ~46/54/55/60: `Property 'Renderer'/'Triangle'/'Program'/'Mesh' does not exist` on the dynamic `import("ogl")` result.

Fix: use named imports from `ogl` (static or dynamic). Example pattern:

```ts
const { Renderer, Triangle, Program, Mesh } = await import("ogl");
const renderer = new Renderer({ dpr, alpha: false, antialias: false });
const geometry = new Triangle(gl);
const program = new Program(gl, { ... });
const mesh = new Mesh(gl, { geometry, program });
```

Do not invent a default export. ogl@1.0.11 exposes named exports.

**C. Theatre typing** in `packages/app/src/motion-previews/previews/theatre-sequence.ts` (~line 127): local `TheatreApi` / `createRafDriver` typing disagrees with `@theatre/core` 0.7.2 (`IRafDriver` missing `type`, `name`, `id`).

Fix: align the local types with the real `@theatre/core` exports. Prefer importing `IRafDriver` (or the actual exported driver type) from `@theatre/core`, or widen the local return type so `sequence.play({ rafDriver })` accepts the real driver. Do not pin `@latest`. Do not add `@theatre/studio`.

**D. Missing `three` types (TS7016)** in `packages/app/src/motion-previews/previews/three-hero.ts` (~line 23).

Fix: add `@types/three` as a `devDependency` of `packages/app`, version matching `three` 0.186.x (use the DefinitelyTyped release that tracks 0.186). Update `pnpm-lock.yaml` with `pnpm install` (or `pnpm add -D @types/three@... --filter @hitchhiker/app`). Confirm the license is MIT-compatible and note it in NOTICE if NOTICE lists new packages.

### 2. Audit workflow — gitleaks license

`gitleaks/gitleaks-action` fails on org repos with "missing gitleaks license".

Fix: replace the action with the free gitleaks CLI. In the `secret-scan` job:

1. Keep `actions/checkout` with `fetch-depth: 0`, pinned by SHA.
2. Download a pinned gitleaks release binary for linux_x64 (use a specific version tag and verify with checksum if practical).
3. Run `gitleaks detect` (or `gitleaks git`) against the repo with redact on. Prefer config already in the repo if `.gitleaks.toml` / `.gitleaksignore` exists; otherwise use defaults.
4. Do not use `gitleaks/gitleaks-action`. Do not reference `GITLEAKS_LICENSE` or any `secrets.*`.
5. Keep `permissions: contents: read`.
6. Update `packages/engine/test/ci-workflows.test.ts`: it currently asserts the pinned `gitleaks/gitleaks-action@e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e` use. Change that assertion to require a CLI install/run (e.g. a `run:` step that mentions `gitleaks detect` or `gitleaks git`) and still assert no `secrets.`, no `GITLEAKS_LICENSE`, and pinned `uses:` SHAs for remaining actions.
7. Update `docs/ci.md` secret-scan section to describe the CLI approach (docs already mention local `gitleaks detect`).

### 3. E2E workflow — Playwright browser missing

Playwright fails with `Executable doesn't exist ... chromium_headless_shell`.

The workflow already tries `pnpm exec playwright install --with-deps chromium`, but Playwright lives in `packages/app` (`@playwright/test`), so a root `pnpm exec playwright` can miss it.

Fix:

- Install browsers from the package that owns Playwright, e.g. `pnpm --filter @hitchhiker/app exec playwright install --with-deps chromium` (or `cd packages/app` then install). Keep `--with-deps` on Ubuntu.
- Prefer caching Playwright browsers when practical (for example `actions/cache` pinned by SHA, keyed on the Playwright version from the lockfile / `packages/app/package.json`). Cache is nice-to-have; correct install path is must-have.
- Keep `pnpm -r run --if-present e2e`.
- Update `ci-workflows.test.ts` if the install command string changes so the test still finds a `playwright install --with-deps chromium` run step.
- Update `docs/ci.md` local equivalent if the filter/`--filter` path changes.

## Files to create or change

Expected touch list (add more only if forced by lockfile / NOTICE / types):

- `packages/app/tsconfig.json`
- `packages/app/package.json`
- `pnpm-lock.yaml`
- `packages/app/src/motion-previews/previews/shader-ogl.ts`
- `packages/app/src/motion-previews/previews/theatre-sequence.ts`
- `packages/app/src/motion-previews/previews/three-hero.ts` (only if needed beyond `@types/three`)
- `packages/app/src/motion-previews/index.ts` (only if you choose `Array.from` instead of lib)
- `.github/workflows/audit.yml`
- `.github/workflows/e2e.yml`
- `packages/engine/test/ci-workflows.test.ts`
- `docs/ci.md`
- `NOTICE` (only if a new package needs a line)

Do not modify `.hh-driver/`, do not start prompt 045 files, do not change interview/engine brand code.

## Steps

1. Reproduce locally: from the repo root, run typecheck the same way CI does (`pnpm exec tsc -b` or whatever `ci.yml` uses). Confirm the TS2488 / ogl / Theatre / three errors.
2. Fix the four typecheck issues.
3. Replace gitleaks-action with free CLI in `audit.yml`; update the structure test and docs.
4. Fix Playwright install path (and optional cache) in `e2e.yml`; update the structure test and docs if needed.
5. Run locally before commit (PowerShell):
   - `pnpm install` if the lockfile changed (prefer frozen after lockfile is updated once)
   - `pnpm exec tsc -b` (or the exact CI typecheck command)
   - `pnpm -r lint` if present
   - `pnpm -r test` with `HH_CASSETTE=replay` if that is what CI uses
   - `pnpm -C packages/engine test` at least for `ci-workflows.test.ts`
6. Leave the working tree clean except for this fix. Commit with the message below.
7. Do not push (the steward / outer driver pushes).

## Edge cases

- `assertNoSecretsOrRelease` fails if any workflow text contains `secrets.` — avoid that substring entirely.
- Org gitleaks-action needs a paid license; CLI does not. Prefer a pinned release URL, not `@latest`.
- `@types/three` must track three 0.186; do not upgrade `three` itself in this prompt.
- Theatre: if importing real types forces a small cast, prefer a typed cast of the driver over `any`.
- Windows PowerShell: chain with `;`, not `&&`.

## Acceptance criteria

- [ ] `pnpm exec tsc -b` (CI-equivalent) passes locally with no errors in packages/app motion-previews.
- [ ] `packages/engine/test/ci-workflows.test.ts` passes after the workflow and assertion updates.
- [ ] Audit secret-scan uses free gitleaks CLI, keeps scanning on, and has no license/secret refs.
- [ ] E2E installs Chromium from the package that has Playwright before the e2e step.
- [ ] One commit with the message below; tree clean; no push.

## must_haves

truths:

- Typecheck is green for the motion-previews failures listed above.
- Secret scanning still runs in CI without a gitleaks license secret.
- Playwright Chromium is installed before e2e on the Ubuntu runner.
- The ci-workflows structure tests match the new workflow text.

## Commit

```
ci: get checks green (types, gitleaks CLI, playwright browsers)
```