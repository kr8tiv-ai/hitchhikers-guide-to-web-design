---
id: "163"
kind: build
phase: so-long-and-thanks-for-all-the-fish
slice: Don't Panic Release
title: "Bring README Develop, CONTEXT-PACKAGE, and the once-over report in line with code"
tier: Heart of Gold
effort: xhigh
model: grok-4.7
depends_on: ["161"]
files: ["README.md", "hh-build-plan/CONTEXT-PACKAGE.md", "hh-build-plan/reviews/", "packages/qa/test/docs-truth.test.ts"]
review_checkpoint_embedded: false
---

# 163. Bring README Develop, CONTEXT-PACKAGE, and the once-over report in line with code

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

- DECISIONS.md D-001 wins over any older document. Edit docs to match the code and the decisions, not the reverse.

## Goal

Three doc fixes. (1) README Develop section says the root package has no test script; root package.json has `"test": "pnpm -r test"`. Fix it and keep the `pnpm --filter @hitchhiker/engine test` form. (2) CONTEXT-PACKAGE.md still carries withdrawn GSAP MIT-fallback language; align it with DECISIONS.md D-001 (GSAP is the base engine, no fallback paths) without deleting history that other docs cite. (3) The once-over report (find it under hh-build-plan/reviews/ or the 159 output) must match the code: list nothing as open that later files, commits, or reviews mark applied.

## Why this prompt exists

Docs that contradict the code or the decisions send builders and users the wrong way.

## Read first

- DECISIONS.md
- README.md
- package.json (root)
- hh-build-plan/CONTEXT-PACKAGE.md
- hh-build-plan/reviews/
- git log --oneline -40

## Files to create or change

- `README.md`
- `hh-build-plan/CONTEXT-PACKAGE.md`
- `hh-build-plan/reviews/`
- `packages/qa/test/docs-truth.test.ts`

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Non-goals

- No code changes.
- Do not rewrite DECISIONS.md.
- Do not touch the prompt files.

## Steps

1. Verify first. Before editing, read the current code and the later prompts and once-over/review notes (hh-build-plan/reviews/, hh-build-plan/prompts/159-once-over.md, git log). Decide per must_have whether the defect still exists. If a must_have is already satisfied by the current code and has a test, change nothing for it and record "already fixed: <evidence>" in the summary. Do only what is still needed. If everything is already satisfied, make no code change, write the summary, and commit it with the commit line below.
2. For each open item in the once-over report, check the code or later files. Mark applied items as applied with the evidence (file or commit). Leave truly open items open.
3. Edit README and CONTEXT-PACKAGE.md.
4. Add docs-truth.test.ts: README mentions the root test script and the engine filter form; CONTEXT-PACKAGE.md does not contain the phrases for a GSAP MIT fallback (find the exact phrases first and assert their absence).
5. Run verification.

## Acceptance criteria

- [ ] README Develop names the root `pnpm test` script and keeps `pnpm --filter @hitchhiker/engine test`.
- [ ] CONTEXT-PACKAGE.md has no GSAP fallback language and defers to D-001.
- [ ] The once-over report lists no item as open that a later file or commit marks applied.

## must_haves

truths:

- README Develop names the root `pnpm test` script and keeps `pnpm --filter @hitchhiker/engine test`.
- CONTEXT-PACKAGE.md has no GSAP fallback language and defers to D-001.
- The once-over report lists no item as open that a later file or commit marks applied.

artifacts:

- packages/qa/test/docs-truth.test.ts

key_links:

- Each report item moved to applied cites evidence.

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

Put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/163.md` if that directory exists. The summary names, per must_have, "already fixed" or "fixed now" with evidence, files changed, tests run, and anything assumed.

## Commit

```
docs: align README, context package, and once-over report with the code
```
