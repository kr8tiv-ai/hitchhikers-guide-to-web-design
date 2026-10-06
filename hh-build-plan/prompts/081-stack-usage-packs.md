---
id: "081"
kind: build
phase: deep-thought
slice: Reference Library
title: "Write stack usage notes for Astro, Next, and Vite"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["072", "076"]
files: ["packages/knowledge/packs/stack-astro/SKILL.md", "packages/knowledge/packs/stack-next/SKILL.md", "packages/knowledge/packs/stack-vite-react/SKILL.md", "packages/knowledge/test/stack-packs.test.ts"]
requirements: ["HH-KNOW-04"]
review_checkpoint_embedded: false
---

# 081. Write stack usage notes for Astro, Next, and Vite

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

Document how a generated site uses Astro, Next.js, or Vite plus React with the motion contract. Versions are not pinned. React islands are the exception on Astro, not the default. R3F is mentioned only for the React stacks, with a note to smoke-test against the installed Three version and to fall back to driving objects from Theatre core.
Scope also covers the v1 §17 stack-usage-specs list: deploy-hostinger, deploy-vercel, deploy-netlify, deploy-cloudflare, imagine-prompting, 3d-asset-sourcing, and scroll-video-encode, one pack file each.

## Why this prompt exists

Stack packs that pin last year's version will fail the install. Stack packs that put R3F on every Astro page will fight the Astro default.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 10.4 and 15.6
- hh-build-plan/RESEARCH-ADDENDUM.md version baseline
- packages/knowledge/src/pack.ts
- context/research/06-library-stack.md
- context/research/11-integrations.md

## Files to create or change

- packages/knowledge/packs/stack-astro/SKILL.md
- packages/knowledge/packs/stack-next/SKILL.md
- packages/knowledge/packs/stack-vite-react/SKILL.md
- packages/knowledge/test/stack-packs.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

Each pack has description, when-to-use, and paths. Astro pack: content collections, islands, `src/scripts/motion.ts`, no React unless the decision record says so. Next pack: app router is not mandated if you are unsure of the template you will add later. Say `follow the template's router` rather than inventing a file tree you will not create in this prompt. Vite pack: single page, level 10, client-side router is optional. All three say re-resolve versions at install and point at STACK-DECISION.md. All three say do not import `@theatre/studio`. Mention `@react-three/fiber` only in Next and Vite packs.

## Interfaces and data shapes

```ts
export const STACK_PACKS: readonly string[];
```

## Steps

1. Write the three skills. Test parsePack on each.

2. Astro file does not contain `@react-three/fiber`.

3. Next and Vite files do contain a smoke-test sentence for R3F.

4. None contain a precise version like `7.3.5` presented as a requirement. The phrase `re-resolve at install` appears in each.

5. Each names `src/scripts/motion.ts` or an equivalent path you choose consistently.

6. No effort frontmatter.

7. No exclamation marks.

8. Do not create the actual Astro project.

## Edge cases

- SvelteKit is a paragraph in the Astro pack's alternatives, not its own pack, and it says the 3D ecosystem is thinner.
- No pack tells the user to npm install with a floating latest tag as the only instruction. Say the lockfile pins what install resolved.

## Acceptance criteria

- [ ] Three packs parse.
- [ ] Astro does not pull R3F by default.
- [ ] Versions are re-resolved, not frozen in the pack.

## must_haves

truths:

- Stack usage follows the decision record.
- Theatre studio is excluded in every pack.

artifacts:

- packages/knowledge/packs/stack-astro/SKILL.md

key_links:

- Packs point at STACK-DECISION.md and the motion module path.

prohibitions:

- Do not pin an unverified version as a requirement.
- Do not add @theatre/studio.
- Do not make React the Astro default.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/knowledge test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/081.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(knowledge): add Astro, Next, and Vite usage packs
```
