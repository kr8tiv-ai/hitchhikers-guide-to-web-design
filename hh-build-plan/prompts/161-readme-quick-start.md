---
id: "161"
kind: build
phase: so-long-and-thanks-for-all-the-fish
slice: Don't Panic Release
title: "Fix the README quick start for a git clone"
tier: Heart of Gold
effort: xhigh
model: grok-4.7
depends_on: ["160"]
files: ["README.md", "packages/qa/test/readme-quickstart.test.ts"]
review_checkpoint_embedded: false
---

# 161. Fix the README quick start for a git clone

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

- Docs must not claim what the code does not do. Verify every command against package.json before writing it.

## Goal

Rewrite the README quick start so a person who clones the repo gets a working desk: Node >=22.18; `corepack enable`; `corepack prepare pnpm@10.32.1 --activate`; `pnpm install`; `pnpm exec hh doctor`; `pnpm exec hh app --project <dir> --no-open`. Mention `npx hitchhikers-guide` only as a future note (the name is not on npm and returns 404 today). Do not claim the desk starts from a lone CLI install: `hh app` and `hh install` resolve the sibling packages/app and packages/grok-plugin, so they need the clone.

## Why this prompt exists

The current quick start sends users to a package that does not exist and omits the pnpm pin, so first run fails.

## Read first

- README.md
- package.json (root; packageManager field)
- packages/cli/src/ (how app and install resolve sibling packages)

## Files to create or change

- `README.md`
- `packages/qa/test/readme-quickstart.test.ts`

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Non-goals

- No publishing to npm.
- No change to CLI code.
- No change to the Develop section (prompt 163 owns it).

## Steps

1. Verify first. Before editing, read the current code and the later prompts and once-over/review notes (hh-build-plan/reviews/, hh-build-plan/prompts/159-once-over.md, git log). Decide per must_have whether the defect still exists. If a must_have is already satisfied by the current code and has a test, change nothing for it and record "already fixed: <evidence>" in the summary. Do only what is still needed. If everything is already satisfied, make no code change, write the summary, and commit it with the commit line below.
2. Check the packageManager pin, engines, and that each command exists.
3. Rewrite the quick start. Keep it to numbered commands plus one sentence on why the clone is required.
4. Add a test that reads README.md and asserts the six commands appear in order, that 
px hitchhikers-guide appears only inside a line that says future/not yet published, and that the pnpm version matches package.json packageManager.
5. Run verification.

## Acceptance criteria

- [ ] README quick start lists the six commands in order with the pnpm version matching packageManager.
- [ ] npx hitchhikers-guide appears only as a future note.
- [ ] README does not say the desk runs from a lone CLI install.

## must_haves

truths:

- README quick start lists the six commands in order with the pnpm version matching packageManager.
- npx hitchhikers-guide appears only as a future note.
- README does not say the desk runs from a lone CLI install.

artifacts:

- packages/qa/test/readme-quickstart.test.ts

key_links:

- Quick start commands match real scripts and CLI subcommands.

prohibitions:

- Do not push, deploy, or create a remote.
- Do not weaken an approval gate (brief approval, prompt approval, Elevate, Hostinger yes).
- Do not restyle: keep the cream editorial desk, the rust rule, and the Don't Panic wordmark.
- Do not start the next prompt.

## Verification

```powershell
pnpm --filter @hitchhiker/qa test
```

## Report back

Put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/161.md` if that directory exists. The summary names, per must_have, "already fixed" or "fixed now" with evidence, files changed, tests run, and anything assumed.

## Commit

```
docs(readme): fix the quick start for a git clone
```
