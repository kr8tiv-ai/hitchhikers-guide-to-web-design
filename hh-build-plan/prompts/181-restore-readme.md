---
id: "181"
kind: build
phase: so-long-and-thanks-for-all-the-fish
slice: Forty-Two
title: "Restore the original README and fold in everything built since"
tier: Heart of Gold
effort: xhigh
model: grok-4.7
depends_on: ["180"]
files: ["README.md", "docs/assets/", "scripts/", "packages/engine/test/", ".github/workflows/"]
review_checkpoint_embedded: false
---

# 181. Restore the original README and fold in everything built since
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
- The driver pushes after checkpoints. You do not push, and you do not run `gh` against the network except read-only `gh run list` and `gh run view --log-failed` if `gh` is already authenticated. If it is not, work from the failure list below.

## Goal

Restore the user's original README as the base, keep its banner, badges, layout, voice, and every section, then fold in what is true now and was added since. The result must read as the same beautiful document, updated, with no claim the code cannot back.

## Why this prompt exists

The original README (commit b2c979e, 2026-10-06, "Add README (Don't Panic) and MIT LICENSE", 499 lines) had a centered banner (`docs/assets/banner.svg`), shields.io badges, the north-star quote, nav links, and sections for what it is, the six phases, the Guide, the motion toolkit, the anti-slop rules, quick start, roadmap, FAQ, and built on GSD. On 2026-10-08 commit 6169628 replaced it with a plain 77-line README, and 808b42b and c099e21 edited that. The plain version lost the voice and most of the content. The owner wants the original back.

## Read first

- `git show b2c979e:README.md` (the base), and `git show 6169628 --stat`, `git show 808b42b`, `git show c099e21` (what the plain version added)
- The current `README.md`
- `docs/assets/banner.svg`, `packages/app/src/design/wordmark.svg`, and `docs/` for existing assets
- `DECISIONS.md` (D-001 overrides the old motion wording) and `context/matt-answers.md`
- `package.json` (`engines`, `packageManager`), `.github/workflows/`
- `packages/cli/src/main.ts` (the command table), `packages/grok-plugin/` (COMMANDS and skill-only commands)
- `packages/app/src/` (settings screen, STT rate gate, progress counts, assumption marks), `packages/engine/` and `packages/qa/` as needed
- `hh-build-plan/INDEX.md` and the summaries of prompts 160 to 180 for what is built

## Files to create or change

- `README.md`: start from `git show b2c979e:README.md`, then edit.
- `docs/assets/`: keep `banner.svg`. Add imagery only if an asset already exists in the repo (for example `packages/app/src/design/wordmark.svg`, copied or referenced). Do not invent binary photos or add generated raster images.
- A README link and anchor check: a script under `scripts/` or a test under `packages/engine/test/`, whichever matches the repo's existing test layout, run by `pnpm -r test` or a root script that CI runs.
- A workflow file only if the README claims a CI badge and no workflow exists (a workflow exists today, so expect no change).

## What to fold in (verify each against the code before writing it)

1. Quick start from a git clone: Node >=22.18, corepack enable, pnpm 10.32.1, `pnpm install`, `pnpm exec hh doctor`, `pnpm exec hh app`. Confirm every version against `package.json`. `npx hitchhikers-guide` is a future note only, because the package is not on npm. Check the registry before saying so, and word it as planned.
2. The real `hh` command table, split into implemented CLI commands and skill-only commands, copied from the code, not from memory.
3. The settings screen, and the xAI speech-to-text rate gate: $0.10 per hour for REST and $0.20 per hour for streaming. Browser Web Speech is the free default. Confirm the numbers and the default in the code.
4. Usability changes: progress counts, and assumptions marked as assumptions.
5. `hh doctor` on first run.
6. The non-Windows queue runner.
7. `hh improve` and `hh improve supervise`, the self-improving loop (173, 179).
8. Roadmap and status: update to reflect what is built, using docs and `hh-build-plan/INDEX.md`. Do not overclaim. Anything unverified stays marked planned.
9. The CI badge, pointing at the existing workflow file name and the real repository URL.
10. Fix anything in the old README that is now false: "coming soon" items that exist now, and any motion wording that conflicts with D-001 (GSAP is the base engine and the whole toolkit ships, with no fallback paths).

## Non-goals

- Do not rewrite the voice, drop a section, or flatten the layout into the plain version.
- No new binary photos, no generated images, no new dependencies.
- Do not change product code, tests for product behavior, run-build.ps1, or the queue runner.
- Do not weaken an approval gate or restyle the app.
- Do not start the next prompt.

## Steps

1. Verify first. Run `git show b2c979e:README.md` and confirm it is 499 lines and starts with the banner. Compare against the current README. If the current README already equals the restored base plus the folded-in items below, change nothing for those and record "already fixed: <evidence>". Do only what is still needed.
2. Write `README.md` from the b2c979e base. Keep the centered banner, badges, north-star quote, nav links, and every section in order.
3. Verify `docs/assets/banner.svg` renders: it is well-formed XML, has a viewBox, references no missing fonts or external files, and renders in Chromium through Playwright at 1x (screenshot it, and confirm it is non-blank). Fix the SVG only if it is broken.
4. Fold in each item from the list above after checking it against the code. Record each as verified, with the file you checked, in the summary.
5. Anti-slop pass on the prose: no banned words from the rulebook, and no exclamation marks beyond what the original already used in its established style. Scan with the repo's existing banned-word list if one exists.
6. Add the link and anchor check. It must resolve every relative link and image path in README.md to an existing file, and every `#anchor` to a heading using GitHub's slug rules (lowercase, spaces to hyphens, punctuation stripped, duplicates suffixed). Include a negative test proving it fails on a broken link and a broken anchor. Wire it into `pnpm -r test` or a root script that CI runs.
7. Run the verification list on Windows.

## Acceptance criteria

- [ ] README.md is built on b2c979e with banner, badges, layout, voice, and every original section intact.
- [ ] `docs/assets/banner.svg` renders and is referenced.
- [ ] Every folded-in fact was checked against code or docs, and unverified items are marked planned.
- [ ] The false statements in the old README are fixed, with motion wording matching D-001.
- [ ] The CI badge points at an existing workflow.
- [ ] The link and anchor check passes on README.md and fails on a deliberately broken fixture.
- [ ] No banned words, no stray exclamation marks, no overclaim.

## must_haves

truths:

- The README keeps the original banner, badges, north-star quote, nav links, and all original sections.
- Every command, version, price, and status in the README matches the code or docs at commit time.
- `npx hitchhikers-guide` appears only as a planned future path.
- The relative links and anchors in README.md all resolve, and a test enforces it.
- `pnpm lint`, `pnpm typecheck`, and `pnpm -r test` pass locally on Windows.

artifacts:

- Restored and updated `README.md`
- `docs/assets/banner.svg` (kept, verified)
- README link and anchor check with a negative test
- Verification notes in the commit body

key_links:

- The README command table matches the CLI command table and the plugin COMMANDS list.
- The README quick start matches `package.json` engines and packageManager.
- The CI badge matches a file in `.github/workflows/`.

prohibitions:

- Do not push, deploy, or create a remote.
- Do not weaken an approval gate (brief approval, prompt approval, Elevate, Hostinger yes).
- Do not restyle: keep the cream editorial desk, the rust rule, and the Don't Panic wordmark.
- Do not weaken, skip, or delete a test.
- Do not start the next prompt.
- Do not edit run-build.ps1.

## Verification

```powershell
pnpm lint
pnpm typecheck
pnpm -r test
pnpm exec tsc -b --pretty false
```

## Report back

Put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/181.md` if that directory exists. The summary names what was restored, what was folded in with the file that proves each item, what was fixed as false, the banner render check, tests run, and anything assumed.

## Commit

```
docs(readme): restore the original README and fold in everything built since
```