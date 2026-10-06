---
id: "006"
kind: build
phase: dont-panic
slice: Towel Check
title: "Validate .hitchhiker config.json"
tier: Cup of Tea
effort: medium
model: grok-4.7
depends_on: ["002"]
files: ["packages/engine/src/config.ts", "packages/engine/test/config.test.ts", "packages/engine/templates/gsd/config.json"]
requirements: ["HH-STATE-01"]
review_checkpoint_embedded: false
---

# 006. Validate .hitchhiker config.json

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

Parse and validate the project config that /hh-doctor and the orchestrator will read. Invalid effort, a negative budget, or a deploy target outside the known set throws a ConfigError that names the field. Defaults match the template. The schema does not contain API keys.

## Why this prompt exists

A free-form JSON file becomes a place where a typo silently turns off the phone gate. Validation here is the contract later prompts bind to.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 10.1, 11, 15.2, and 20
- packages/engine/templates/gsd/config.json
- hh-build-plan/RESEARCH-ADDENDUM.md sections on Grok CLI flags and Imagine prices (do not hardcode a price in the schema)

## Files to create or change

- packages/engine/src/config.ts
- packages/engine/test/config.test.ts
- packages/engine/templates/gsd/config.json

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

GuideConfig fields: model string default `grok-4.7`; effort enum `medium | high | xhigh`; interviewDepth enum `express | standard | deep` default `deep`; voiceEngine enum `local | xai` default `local`; sessionIdMode enum `unknown | uuid | alias` default `unknown`; deployTarget enum `hostinger | vercel | netlify | cloudflare | undecided` default `undecided`; worktrees boolean default false; imagineBudgetUsd number default 0; tokenBudget number default 200000; gates object with phonePerfMin 90, a11yMin 90, bestPracticesMin 90, seoMin 90, desktopFpsMin 30. Budgets are caps, not prices. Do not store a dollar estimate for a Grok run. imagineBudgetUsd 0 means DIY until the user raises it. Unknown keys are rejected, not stripped silently, so a typo surfaces. Use a hand-written parser. Do not add zod unless you record the license in NOTICE. A 40-line parser is enough and keeps the dependency at zero.

## Interfaces and data shapes

```ts
export type Effort = "medium" | "high" | "xhigh";
export type InterviewDepth = "express" | "standard" | "deep";
export type VoiceEngine = "local" | "xai";
export type SessionIdMode = "unknown" | "uuid" | "alias";
export type DeployTarget = "hostinger" | "vercel" | "netlify" | "cloudflare" | "undecided";

export interface GuideConfig {
  model: string;
  effort: Effort;
  interviewDepth: InterviewDepth;
  voiceEngine: VoiceEngine;
  sessionIdMode: SessionIdMode;
  deployTarget: DeployTarget;
  worktrees: boolean;
  imagineBudgetUsd: number;
  tokenBudget: number;
  gates: {
    phonePerfMin: number;
    a11yMin: number;
    bestPracticesMin: number;
    seoMin: number;
    desktopFpsMin: number;
  };
}

export function parseConfig(raw: unknown): GuideConfig;
export function defaultConfig(): GuideConfig;
```

## Steps

1. Implement defaultConfig() with the defaults in the context. parseConfig accepts a JSON object, fills missing keys from defaults, and throws ConfigError on the wrong type or an unknown key.

2. Reject effort `low`. The Guide's prompt schema does not use it. Reject imagineBudgetUsd below 0 or above 1000 in this validator so a stray decimal cannot authorize a huge spend. A later settings prompt can raise the hard ceiling only by editing this constant and its test.

3. Reject tokenBudget above 200000. v2 says stay under 200k tokens per request.

4. gates values must be integers from 0 to 100 for the Lighthouse fields, and desktopFpsMin from 1 to 120. phonePerfMin default stays 90.

5. loadConfig(dir) reads path.join(dir, '.hitchhiker', 'config.json'). A missing file returns defaultConfig() and does not create the directory. The caller creates directories under the lock in a later prompt.

6. Update the template config.json so its keys match GuideConfig. sessionIdMode is `unknown`. worktrees is false.

7. config.test.ts covers: empty object becomes defaults; effort `low` throws; unknown key `gsapFallback` throws; imagineBudgetUsd -1 throws; a serialized defaultConfig round-trips.

8. Export parseConfig, defaultConfig, and loadConfig from the engine index.

9. Do not read environment variables inside parseConfig. Key presence is a doctor concern.

## Edge cases

- JSON null for a field throws, rather than becoming the default, so a user who wrote null did not mean 'please guess'.
- Numeric gates passed as strings throw.
- deployTarget `aws` throws with the allowed list in the message.

## Acceptance criteria

- [ ] defaultConfig().worktrees is false and voiceEngine is local.
- [ ] parseConfig rejects gsapFallback, effort low, and a token budget over 200000.
- [ ] The template file parses through parseConfig.
- [ ] No API key field exists on GuideConfig.

## must_haves

truths:

- Config cannot silently enable a GSAP fallback or a worktree fleet.
- The phone performance floor defaults to 90.
- Missing config.json is defaults, not a crash, and does not write a file.

artifacts:

- packages/engine/src/config.ts
- packages/engine/templates/gsd/config.json

key_links:

- config.test.ts parses the template file with parseConfig.
- GuideConfig is exported from packages/engine/src/index.ts.

prohibitions:

- Do not add an API key, bearer token, or email field.
- Do not add a `motionFallback` or `replaceGsap` key.
- Do not install zod just for this object.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/006.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(engine): validate .hitchhiker config.json
```
