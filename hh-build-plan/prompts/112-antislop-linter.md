---
id: "112"
kind: build
phase: improbability-drive
slice: Zaphod
title: "Lint generated copy for slop and allow Elevate only as a product name"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["078"]
files: ["packages/qa/src/antislop.ts", "packages/qa/test/antislop.test.ts"]
requirements: ["HH-REVIEW-04"]
review_checkpoint_embedded: false
---

# 112. Lint generated copy for slop and allow Elevate only as a product name

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

Lint site copy for banned patterns: lorem, exclamation marks, em dashes, indigo utility classes, purple gradients, magnetic button code, and hype words. The word Elevate is a hit in site body copy and not a hit when the line is an hh command or the product name in Guide docs. The mode is `site` or `guide`.

## Why this prompt exists

The pack describes the rule. The linter enforces it. Without the mode switch, the Guide cannot mention its own Elevate command.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 14
- packages/knowledge/packs/anti-slop/SKILL.md

## Files to create or change

- packages/qa/src/antislop.ts
- packages/qa/test/antislop.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

lintSlop(text, mode) returns hits with line numbers. site mode flags `elevate` case-insensitive. guide mode flags it only when it is used as a verb in a sentence that also contains `your brand`, which is a heuristic. Simpler and testable: guide mode ignores lines that contain `/hh-elevate` or `The Hitchhiker's Guide`. Other lines still flag elevate. Test both. Magnetic is flagged when `magnetic` and `pointer` appear in the same file. Do not flag the anti-slop pack's own discussion if mode is guide. This linter is for site output and Guide UI strings the caller passes in.

## Interfaces and data shapes

```ts
export function lintSlop(text: string, mode: "site" | "guide"): Array<{ line: number; rule: string }>;
```

## Steps

1. Implement the rules as a list of checkers so a new ban is one function.

2. Test lorem fails in both modes.

3. Test an exclamation mark fails.

4. Test `/hh-elevate` in guide mode does not fail, and `elevate your brand` in site mode does.

5. Test a purple gradient string `linear-gradient(#4f46e5, #7c3aed)` fails.

6. Test a normal sentence without bans returns an empty list.

7. Line numbers are 1-based.

8. Export lintSlop.

## Edge cases

- Empty text returns no hits.
- An em dash character fails. A hyphen does not.
- The word `elevation` does not match the word elevate. Use a word boundary.

## Acceptance criteria

- [ ] Site mode catches elevate and lorem.
- [ ] Guide mode allows the command name.
- [ ] Gradients in the banned palette fail.

## must_haves

truths:

- The linter encodes the rulebook.
- Elevate is context-sensitive.

artifacts:

- packages/qa/src/antislop.ts

key_links:

- Rules match the anti-slop knowledge pack.

prohibitions:

- Do not flag /hh-elevate in guide mode.
- Do not ignore lorem.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/qa test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/112.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(qa): lint slop with an Elevate exception
```

