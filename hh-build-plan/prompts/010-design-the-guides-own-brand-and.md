---
id: "010"
kind: build
phase: dont-panic
slice: Don't Panic Desk
title: "Design the Guide's own brand and design system"
tier: Forty-Two
effort: xhigh
model: grok-4.7
depends_on: ["001"]
files: ["packages/app/src/design/README.md", "packages/app/src/design/tokens.css", "packages/app/src/design/tokens.ts", "packages/app/src/design/type.css", "packages/app/src/design/components.css", "packages/app/src/design/motion.ts", "packages/app/src/design/voice.md", "packages/app/src/design/wordmark.svg", "packages/app/public/fonts/OFL.md", "packages/app/src/design/comps/desk.html", "packages/app/src/design/comps/dashboard.html", "packages/app/src/design/comps/brand-kit.html", "packages/app/src/design/comps/screens/README.md", "packages/app/scripts/screenshot-comps.ts", "packages/app/test/design-tokens.test.ts", "packages/app/test/design-contrast.test.ts", "packages/app/package.json", "NOTICE"]
requirements: ["HH-DS-01"]
review_checkpoint_embedded: false
---

# 010. Design the Guide's own brand and design system

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

Create packages/app/src/design/, the Guide's own identity and design system, before any screen is built. Don't Panic in large, friendly letters as the wordmark, set from an OFL display face (no book art, no cover pastiche). A display plus text type pair (both SIL OFL-1.1, self-hosted). Colour tokens for light and dark that pass WCAG AA. A spacing and radius scale. Motion tokens and a small motion layer for the app (GSAP on native scroll, no Lenis in the app, full reduced-motion support). Component styles for the question card, example-site card, Guide map, status line, buttons (at least 44 px), approval rows, and dashboard tables. Voice rules for UI copy. Reference comps as HTML at 375, 768, and 1440 with screenshots. The result must look agency-grade with Don't Panic energy: warm, confident, witty, never a default template.

## Why this prompt exists

Matt asked for an app that feels like a two-hour meeting with the best brand agency on the planet (Q34). Every later screen (030, 026, 033, 065, 116, 046, 049, 050) imports these tokens and components, so the look is decided once, on purpose, by the strongest model at the highest effort. A plain document or a purple Tailwind dashboard is a failed product, not a style choice.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 2, 4, 14, and 18
- CONTEXT-PACKAGE.md (v1) sections 2, 6, 14, and 18.2 (voice, persona, anti-slop rulebook, UI copy)
- context/matt-answers.md (Q8, Q11, Q33, Q34, Q36: not AntiHero-branded, not about Matt)
- context/research/03-awwwards-anatomy.md and context/research/05-inspiration-galleries.md (what agency-grade means in 2026)
- context/research/04-motion-taxonomy.md (motion vocabulary for the app's own micro-interactions)
- DECISIONS.md D-001 (motion toolkit)
- context/matt-answers.md and DECISIONS.md (authority; they override this prompt)

## Files to create or change

- packages/app/src/design/README.md
- packages/app/src/design/tokens.css
- packages/app/src/design/tokens.ts
- packages/app/src/design/type.css
- packages/app/src/design/components.css
- packages/app/src/design/motion.ts
- packages/app/src/design/voice.md
- packages/app/src/design/wordmark.svg
- packages/app/public/fonts/OFL.md
- packages/app/src/design/comps/desk.html
- packages/app/src/design/comps/dashboard.html
- packages/app/src/design/comps/brand-kit.html
- packages/app/src/design/comps/screens/README.md
- packages/app/scripts/screenshot-comps.ts
- packages/app/test/design-tokens.test.ts
- packages/app/test/design-contrast.test.ts
- packages/app/package.json
- NOTICE

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

The Guide app is local, framework-free TypeScript plus CSS (030 renders HTML strings). This prompt does not build screens; it builds the system and three static reference comps that later prompts must match. Identity: the product name is The Hitchhiker's Guide to Web Design; the hero mark is DON'T PANIC in large, friendly letters (a typographic wordmark exported to wordmark.svg as outlined paths from the chosen display font, so it renders without the font). It is an affectionate homage: no book text, no cover art, no towel clip-art, not AntiHero-branded, not about Matt.

Type: choose one OFL display face and one OFL text face (for example from the google/fonts repository on GitHub, which ships each family with OFL.txt). Record the choice and the reason in README.md. Download only the weights you use as woff2 into packages/app/public/fonts/ with their OFL.txt, and list them in NOTICE and fonts/OFL.md. No font CDN at runtime.

Tokens: tokens.css defines custom properties for colour (surface, ink, muted, accent, accent-ink, success, warning, danger, focus), light and dark via prefers-color-scheme plus a data-theme override; space scale (4 px base); radius scale; shadow scale; type scale using clamp() for 375 to 1440; motion durations and easings. tokens.ts exports the same values as typed constants for tests and for components that compute styles. No indigo, no violet, no purple-to-blue gradient, no gray #999 on white.

Motion layer (motion.ts): a tiny API over GSAP core for the app's own micro-interactions (card enter, answer accepted, map progress, toast), with prefersReducedMotion() returning instant transitions. Native scroll only in the app. GSAP is imported per function so unused code tree-shakes.

Components (components.css): question card, example-site card (screenshot, title, one-line note, love/meh/hate controls), Guide map rail, status line, primary/secondary/ghost buttons (min 44 px, visible focus ring), approval row (Approve, Redo), dashboard table, empty state, error state. Class names are BEM-like and documented in README.md.

Voice (voice.md): UI copy rules from v1 §2, §6, §18.2: plain, warm, precise, a little funny; no exclamation marks; banned words list from the anti-slop rulebook; empty and error states have a line of personality and a next step.

Comps: desk.html (conversation desk: transcript, one question card, Guide map rail on wide screens, status), dashboard.html (the Drive dashboard skeleton), brand-kit.html (reveal frame). Each comp links only tokens.css, type.css, components.css. scripts/screenshot-comps.ts uses @playwright/test's chromium (dev dependency, Apache-2.0) to write PNGs at 375, 768, and 1440 under comps/screens/. Commit the PNGs only if each is under 400 KB; otherwise commit README.md with the command and keep PNGs out of git.

## Interfaces and data shapes

```ts
export const color: Record<"surface" | "ink" | "muted" | "accent" | "accentInk" | "success" | "warning" | "danger" | "focus", { light: string; dark: string }>;
export const space: readonly number[];
export const radius: Record<"sm" | "md" | "lg" | "pill", string>;
export const motion: { durations: Record<"fast" | "base" | "slow", number>; easings: Record<"out" | "inOut" | "spring", string> };
export function contrastRatio(fg: string, bg: string): number;
export function prefersReducedMotion(): boolean;
export function enter(el: Element, opts?: { delay?: number }): Promise<void>;
export function confirmPulse(el: Element): Promise<void>;
```

## Steps

1. Research briefly: read the gallery and anatomy research and write three candidate directions (name, type pair, palette, one sentence of character) in README.md. Pick one and say why it fits Don't Panic energy and agency-grade craft.

2. Download the chosen OFL fonts (woff2, only the weights used) with OFL.txt. Record family, version or commit, and licence in NOTICE and public/fonts/OFL.md.

3. Write tokens.css and tokens.ts with identical values. Add a test that parses tokens.css and asserts every token in tokens.ts exists with the same value.

4. Write contrastRatio and design-contrast.test.ts: ink on surface and accent-ink on accent are at least 4.5:1 in light and dark; muted on surface at least 4.5:1 for body text sizes; focus ring at least 3:1 against surface.

5. Write type.css (font-face declarations with font-display swap, the clamp() scale, headline and body styles) and components.css for every component in the context.

6. Write motion.ts over GSAP core with per-function imports and a reduced-motion path that resolves immediately. Add gsap as a dependency of @hitchhiker/app and record it in NOTICE.

7. Draw the DON'T PANIC wordmark: outline the display font glyphs to paths (opentype.js, MIT, dev dependency) and save wordmark.svg with a viewBox and title.

8. Build the three comps with real Guide copy (no lorem). The desk comp shows a real question from the tree (DP-1.1) with Answer, Suggest, Skip, and a filled Guide map.

9. Write screenshot-comps.ts and run it. Look at every screenshot at 375, 768, and 1440 yourself. Fix spacing, hierarchy, and rhythm until the comps would pass an agency design review. Note what you changed in README.md.

10. Write voice.md and a test that scans the comps for exclamation marks, lorem, banned words, indigo/violet hex ranges, and purple-to-blue gradients.

## Edge cases

- Fonts that fail to download: stop and report; do not fall back to system-ui silently.
- Dark mode must be designed, not inverted: check every comp in both themes.
- Reduced motion: every motion.ts function has an instant path and a test.
- Long German or Spanish strings in the question card must wrap without overflow at 375.

## Acceptance criteria

- [ ] packages/app/src/design/ contains tokens, type, components, motion, voice, wordmark, and README with the chosen direction and reasons.
- [ ] Contrast tests pass in light and dark.
- [ ] Comps exist at 375, 768, and 1440 with screenshots reviewed and described in the summary.
- [ ] No default Tailwind look, no indigo or violet, no purple gradient, no exclamation marks, no lorem.
- [ ] Not AntiHero-branded and not about Matt; no book art.

## must_haves

truths:

- The Guide has its own deliberate identity and design system before any screen exists.
- Every token passes WCAG AA where it carries text.
- Motion respects prefers-reduced-motion.

artifacts:

- packages/app/src/design/tokens.css
- packages/app/src/design/components.css
- packages/app/src/design/motion.ts
- packages/app/src/design/README.md

key_links:

- tokens.ts and tokens.css hold identical values, enforced by design-tokens.test.ts.
- Later screens import tokens.css and components.css instead of defining raw colours.

prohibitions:

- Do not use a font CDN or a non-OFL font.
- Do not ship Tailwind defaults, indigo, violet, or purple-to-blue gradients.
- Do not use book cover art, AntiHero branding, or Matt's likeness.

## Verification

Run from the repo root:

```powershell
pnpm install
pnpm --filter @hitchhiker/app test
pnpm --filter @hitchhiker/app exec node --experimental-strip-types scripts/screenshot-comps.ts
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/010.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(design): the Guide's own Don't Panic design system and comps
```
