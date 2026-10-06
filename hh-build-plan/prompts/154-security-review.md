---
id: "154"
kind: build
phase: so-long-and-thanks-for-all-the-fish
slice: Don't Panic Release
title: "Scan for secrets, deny-list gaps, and keychain notes"
tier: Heart of Gold
effort: high
model: grok-4.7
depends_on: ["097", "148"]
files: ["packages/qa/src/secrets.ts", "packages/qa/test/secrets.test.ts", "docs/secrets.md"]
requirements: ["HH-SHIP-10"]
review_checkpoint_embedded: true
---

# 154. Scan for secrets, deny-list gaps, and keychain notes

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

Add a secret scanner that flags xai- keys, Bearer tokens, and private key blocks in text. Document that real keys belong in the OS keychain or .env.local, which is gitignored. Wire the scanner as a test over a fixture, not as a network service. Confirm the command policy still denies push and deploy.

## Why this prompt exists

A local MIT tool that leaks a key in a fixture is worse than no tool. The scanner is the release check.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 16 and 19
- packages/orchestrator/src/policy.ts
- packages/orchestrator/src/git-flow.ts

## Files to create or change

- packages/qa/src/secrets.ts
- packages/qa/test/secrets.test.ts
- docs/secrets.md

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

scanText(text) returns hits. Patterns: `xai-` followed by alphanumerics, `Bearer ` followed by a token, and `BEGIN PRIVATE KEY`. Do not flag the documentation that mentions the prefix `xai-` if you require at least 8 following characters. docs/secrets.md explains keychain or .env.local and says the repo must not contain a real key. The test runs scanText on docs/secrets.md and expects zero hits. A second test feeds a fake key.

## Interfaces and data shapes

```ts
export function scanText(text: string): Array<{ rule: string; index: number }>;
```

## Steps

1. Implement the three patterns with the length floor so the docs can name the prefix.

2. Test a fake `xai-abcdef12` hits.

3. Test docs/secrets.md does not hit. Write it carefully.

4. Test BEGIN PRIVATE KEY hits.

5. Add an engine or qa test that reads policy.ts source is unnecessary if policy tests already deny push. Call evaluateCommand in this test for `git push` and expect deny.

6. No network.

7. Export scanText.

8. Do not print the fake key in an assertion message if it fails. It is fine in the fixture.

## Edge cases

- Empty text returns no hits.
- A short `xai-abc` does not hit.

## Acceptance criteria

- [ ] Realistic key shapes are detected.
- [ ] The docs file is clean.
- [ ] git push remains denied.

## must_haves

truths:

- Secrets are scanned as text.
- The documented storage location is outside git.

artifacts:

- packages/qa/src/secrets.ts
- docs/secrets.md

key_links:

- The test also calls evaluateCommand.

prohibitions:

- Do not commit a real key to prove the scanner.
- Do not add telemetry.
- Do not allow git push.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/qa test
pnpm --filter @hitchhiker/orchestrator test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/154.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(qa): scan for secrets and document key storage
```
## REVIEW CHECKPOINT

This build closes a review group. After this commit, the driver runs the fresh-session reviewer prompt `155-review-152-154.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `152` Reveals and agency exports (Share and Enjoy, Heart of Gold, high)
- `153` Agency-grade polish pass on the Guide app (Don't Panic Release, Forty-Two, xhigh)
- `154` Scan for secrets, deny-list gaps, and keychain notes (Don't Panic Release, Heart of Gold, high)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.
