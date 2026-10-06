---
id: "148"
kind: build
phase: so-long-and-thanks-for-all-the-fish
slice: NOTICE Board
title: "Package the CLI so npx and hh install work"
tier: Heart of Gold
effort: high
model: grok-4.7
depends_on: ["009"]
files: ["packages/cli/package.json", "packages/cli/src/install.ts", "packages/cli/test/install.test.ts"]
requirements: ["HH-SHIP-09"]
review_checkpoint_embedded: false
---

# 148. Package the CLI so npx and hh install work

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

Make the CLI installable as `hh` and add `hh install --project <dir>` which copies the plugin into `<dir>/.grok/` (skills as `.grok/skills/hh-<name>`, plus agents, hooks, and rules). The copy is a file operation. It does not publish to npm. It does not phone home.

## Why this prompt exists

Grok Build discovers skills in `.grok/skills`. If install is a manual copy, every project will drift.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 18 and 19
- packages/grok-plugin/skills/guide-persona/SKILL.md

## Files to create or change

- packages/cli/package.json
- packages/cli/src/install.ts
- packages/cli/test/install.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

installPlugin({ sourceDir, projectDir }) copies each skill to path.join(project, '.grok', 'skills', 'hh-<name>') so Grok Build discovers .grok/skills/*/SKILL.md one level deep, plus .grok/agents/hh-*.md, .grok/hooks/hh-*.json and .grok/rules/hh-*.md from packages/grok-plugin. Verify discovery with `grok inspect --json` when grok is on PATH (skip with a note otherwise). Also produce a Grok plugin manifest so `grok plugin install` works (read context/sources/xai/features_skills-plugins-marketplaces.md for the exact format; do not invent fields). packages/cli package.json is publishable ("private": false, name "hitchhikers-guide", bin hh, repository kr8tiv-ai). npx hitchhikers-guide starts the 034 server. Do not run npm publish. Refuse to copy if the destination escapes the project after realpath. Refuse to delete unrelated skills. Overwrite only paths under that hitchhiker folder. The test uses a temp project and a temp skill fixture. package.json bin stays `hh`. files field includes dist or src so a future publish has the entry. Do not run npm publish. Add a root script only if useful. Zero telemetry: the install function does not call fetch. The test scans install.ts for `fetch(`.

## Interfaces and data shapes

```ts
export function installSkills(input: { sourceDir: string; projectDir: string }): Promise<{ copied: number }>;
```

## Steps

1. Copy `.md` files preserving relative paths.

2. A skill outside the source dir is not copied. The walker starts at sourceDir.

3. Destination traversal throws. Test with a mocked path if needed, or by checking the resolved path prefix.

4. Second install overwrites the hitchhiker folder contents and leaves a sibling `other-skill.txt` in `.grok/skills` alone.

5. No network.

6. Do not publish.

7. Export installSkills and wire `hh install` to it.

8. Test the CLI parser for install.

## Edge cases

- Missing source dir throws.
- Empty source copies zero files and does not delete the destination.

## Acceptance criteria

- [ ] Skills land in the project's .grok folder.
- [ ] Unrelated skills are kept.
- [ ] Nothing is published and nothing is fetched.

## must_haves

truths:

- Install is a local copy.
- The bin name is hh.

artifacts:

- packages/cli/src/install.ts

key_links:

- hh install copies packages/grok-plugin/skills.

prohibitions:

- Do not npm publish.
- Do not add telemetry.
- Do not delete unrelated skills.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/cli test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/148.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(cli): install Guide skills into .grok
```

