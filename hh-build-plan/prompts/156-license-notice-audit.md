---
id: "156"
kind: build
phase: so-long-and-thanks-for-all-the-fish
slice: Don't Panic Release
title: "Audit licenses and keep GPL and Theatre studio out"
tier: Heart of Gold
effort: high
model: grok-4.7
depends_on: ["001", "055", "080"]
files: ["packages/qa/src/licenses.ts", "packages/qa/test/licenses.test.ts", "NOTICE"]
requirements: ["HH-SHIP-11"]
review_checkpoint_embedded: false
---

# 156. Audit licenses and keep GPL and Theatre studio out

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

Read each package.json in the workspace and fail if a dependency is licensed GPL or AGPL, or if the name is `@theatre/studio` or `potrace`. Allow MIT, Apache-2.0, BSD, ISC, Unlicense, Zlib, and MPL-2.0. MPL and Zlib must be named in NOTICE. The test can use a fixture graph so it does not depend on a full install of optional native modules.

## Why this prompt exists

The Guide is MIT. One GPL dependency changes what users can ship. Studio and potrace are the known traps.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- DECISIONS.md
- hh-build-plan/RESEARCH-ADDENDUM.md license notes
- NOTICE
- package.json

## Files to create or change

- packages/qa/src/licenses.ts
- packages/qa/test/licenses.test.ts
- NOTICE

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

auditDeps(entries) where an entry is `{ name, license }`. Missing license fails. SPDX expressions with OR are allowed if every side is allowed, except you should still record them. AND fails if any side is not allowed. `@theatre/core` with Apache-2.0 passes. `@theatre/studio` fails even if the license field were wrong. Write a NOTICE section `Third-party` if it is missing, listing gsd-core MIT and any package the audit saw. Do not invent packages that are not installed. The fixture test is the gate. A second test reads the real workspace package.json files if present and audits their declared license fields only when the field exists. If a dependency has no license field, the test reports it as a failure for direct dependencies you added. Optional: skip the live tree if node_modules is absent and say so in the test output by asserting the fixture only.

## Interfaces and data shapes

```ts
export function auditDeps(entries: Array<{ name: string; license: string | null }>): { ok: boolean; problems: string[] };
```

## Steps

1. Implement the SPDX subset. Test `MIT OR Apache-2.0` passes.

2. Test `GPL-3.0-only` fails.

3. Test `@theatre/studio` with `MIT` still fails.

4. Test `potrace` fails.

5. Test MPL-2.0 passes the function and the problems list is empty, and a helper noticeNeedsMention returns true for MPL and Zlib.

6. Update NOTICE with a Third-party heading if missing, without removing the gsd-core lines.

7. Do not npm install theatre studio to test the failure. Use the fixture.

8. Export auditDeps.

## Edge cases

- Empty license fails.
- License `UNLICENSED` fails. That SPDX value means proprietary, not Unlicense. Unlicense must be the word `Unlicense`.

## Acceptance criteria

- [ ] GPL, AGPL, studio, and potrace fail.
- [ ] MIT OR Apache passes.
- [ ] NOTICE still credits gsd-core.

## must_haves

truths:

- The license gate is automated.
- Known-bad packages fail by name.

artifacts:

- packages/qa/src/licenses.ts
- NOTICE

key_links:

- auditDeps is the legitimacy check's license half.

prohibitions:

- Do not add @theatre/studio.
- Do not add potrace.
- Do not weaken the test to pass a GPL package.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/qa test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/156.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(qa): audit dependency licenses
```
