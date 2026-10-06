---
id: "086"
kind: build
phase: deep-thought
slice: Infinite Monkeys
title: "Site starter templates, feature recipes, tracking"
tier: Forty-Two
effort: xhigh
model: grok-4.7
depends_on: ["072", "074", "080", "081"]
files: ["packages/templates/astro-default/", "packages/templates/next-app/", "packages/templates/vite-react-world/", "packages/templates/shared/motion.ts", "packages/templates/shared/webgl.ts", "packages/templates/shared/theatre-loader.ts", "packages/templates/shared/qa.spec.ts", "packages/templates/shared/optimize-media.ts", "packages/templates/shared/fetch-assets.ts", "packages/templates/recipes/", "packages/templates/src/index.ts", "packages/templates/test/templates.test.ts", "NOTICE"]
requirements: ["HH-TPL-01"]
review_checkpoint_embedded: true
---

# 086. Site starter templates, feature recipes, tracking

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

Ship the starters generated sites begin from: packages/templates/astro-default, next-app, and vite-react-world. Each installs and wires the full D-001 toolkit with per-effect imports (motion.ts ticker, Lenis to ScrollTrigger, webgl.ts single context, Theatre core state loader, CSS scroll-driven helpers, a Motion island, a scoped anime.js helper, vanilla helpers), a qa.spec.ts, optimize-media, fetch-assets, and a credits page. Add feature recipes: contact and email intake (Web3Forms, Formspree, or host forms), Resend, newsletter adapters (Kit, Mailchimp, MailerLite, Beehiiv, Brevo, Klaviyo, Hostinger Reach), Stripe Payment Links, Shopify Buy Button, Cal.com and Calendly, a content-collections blog with a Keystatic option, portfolio and video collections, and analytics (Plausible, Umami, or GA4 with consent) with KPI events from KPIS.md (Q16, Q23, D-001).

## Why this prompt exists

Site prompts need a strong, tested starting point, or every site re-invents scroll wiring and breaks phone budgets. Real integrations are what turn a pretty site into a business tool.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- DECISIONS.md D-001
- packages/templates/src/motion-contract.ts (074)
- packages/knowledge/packs/motion/ (080) and the stack packs (081)
- context/research/06-library-stack.md and context/research/11-integrations.md
- context/matt-answers.md Q16, Q21, Q23
- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 12, 15, and 17
- context/matt-answers.md and DECISIONS.md (authority; they override this prompt)

## Files to create or change

- packages/templates/astro-default/
- packages/templates/next-app/
- packages/templates/vite-react-world/
- packages/templates/shared/motion.ts
- packages/templates/shared/webgl.ts
- packages/templates/shared/theatre-loader.ts
- packages/templates/shared/qa.spec.ts
- packages/templates/shared/optimize-media.ts
- packages/templates/shared/fetch-assets.ts
- packages/templates/recipes/
- packages/templates/src/index.ts
- packages/templates/test/templates.test.ts
- NOTICE

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

Each template is a complete, buildable project with its own package.json (pinned versions), README, and `pnpm build` that passes. shared/motion.ts: one gsap.ticker drives Lenis (lenis.raf) and ScrollTrigger.update; exports registerEffect(name, loader) so pages import only what they use. shared/webgl.ts: one canvas, one WebGL2 context, shared by Three.js and OGL scenes, paused off-screen, with a poster fallback on low-power devices. theatre-loader.ts plays a checked-in state JSON with @theatre/core only. CSS scroll-driven helpers use animation-timeline with @supports fallbacks and never run on Lenis pages. qa.spec.ts (Playwright) checks console errors, failed requests, 375/768/1440 screenshots, and reduced motion. optimize-media converts images to AVIF/WebP with sizes and encodes scroll video (H.264 + WebM, keyframe interval for scrubbing) via ffmpeg when present. fetch-assets pulls CREDITS.json assets. Recipes live under packages/templates/recipes/<name>/ with README, code for each stack where it differs, env var names (never values), and a test or a dry-run check. Analytics recipes fire KPI events named in KPIS.md and respect a consent banner where GA4 is used. A blank page in each template must score Lighthouse mobile >= 90 in all four categories; the bundle analyzer shows only used libraries.

## Interfaces and data shapes

```ts
export type TemplateId = "astro-default" | "next-app" | "vite-react-world";
export function listTemplates(): Array<{ id: TemplateId; dir: string; stack: "astro" | "next" | "vite-react" }>;
export function listRecipes(): Array<{ id: string; stacks: TemplateId[]; env: string[]; licence: string }>;
export function scaffold(id: TemplateId, outDir: string, opts: { recipes: string[] }): Promise<string[]>;
```

## Steps

1. Create the three templates with pinned dependencies and a passing build each.

2. Write the shared motion, webgl, theatre, CSS scroll, Motion island, anime, and vanilla helpers with per-effect imports; unit-test the ticker wiring and the single WebGL context.

3. Write qa.spec.ts, optimize-media, and fetch-assets.

4. Write each recipe with README, env names, and a dry-run test; the newsletter adapters share one interface.

5. Write analytics recipes with KPI events and consent.

6. Write scaffold() and templates.test.ts that scaffolds each template into a temp dir and runs its build (skippable with HH_SKIP_TEMPLATE_BUILD=1 for slow CI legs).

7. Run Lighthouse mobile on each blank template's built output with @lhci/cli (mobile preset, 3 runs) and record the scores in the summary; fix until all four are at least 90.

8. Record every dependency and licence in NOTICE.

## Edge cases

- ffmpeg missing: optimize-media skips video with a clear message.
- A recipe needs a paid account: README says so plainly; no keys in code.
- Next.js and Lenis on the app router: use a client component boundary for the motion root.

## Acceptance criteria

- [ ] Each template builds.
- [ ] Lighthouse mobile is at least 90 in all four categories on each blank template.
- [ ] Bundles show only the libraries a page uses.
- [ ] Every recipe has a README and a dry-run test.

## must_haves

truths:

- Generated sites start from tested templates with the full toolkit wired per effect.
- Integrations are real recipes, not mentions.
- Blank templates already meet the phone gate.

artifacts:

- packages/templates/astro-default/
- packages/templates/shared/motion.ts
- packages/templates/recipes/

key_links:

- scaffold() is called by the site prompts' setup entry (090, 092).
- shared/motion.ts implements the 074 coexistence contract.

prohibitions:

- Do not load every motion library on every page.
- Do not commit API keys or real env values.
- Do not bundle @theatre/studio.

## Verification

Run from the repo root:

```powershell
pnpm install
pnpm --filter @hitchhiker/templates test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/086.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(templates): three site starters with the full toolkit and real integration recipes
```
## REVIEW CHECKPOINT

This build closes a review group. After this commit, the driver runs the fresh-session reviewer prompt `087-review-084-086.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `084` Write SEO, sales, and award-site packs without fake numbers (Reference Library, Gargle Blaster, high)
- `085` 3D sourcing: CC0 GLBs and Tripo/Meshy tools (Earth Mk II Blueprints, Heart of Gold, high)
- `086` Site starter templates, feature recipes, tracking (Infinite Monkeys, Forty-Two, xhigh)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.
