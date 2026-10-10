---
id: "176"
kind: build
phase: so-long-and-thanks-for-all-the-fish
slice: Forty-Two
title: "UI beauty pass without a new visual system"
tier: Heart of Gold
effort: xhigh
model: grok-4.7
depends_on: ["175"]
files: ["packages/app/src/design/", "packages/app/src/client/", "packages/app/e2e/polish.spec.ts"]
review_checkpoint_embedded: false
---

# 176. UI beauty pass without a new visual system

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

- Fix root causes. Never weaken, skip, delete, or loosen a test or an assertion to get green. A test may change only when it asserts something the product intentionally changed, and then the new assertion must be at least as strict and the summary must say why.
- The driver pushes after checkpoints. You do not push, and you do not run `gh` against the network.
- Playwright runs use the existing app e2e setup in packages/app/e2e/. Fixtures and cassettes only. No live xAI or other paid API call in any test or script.
- The anti-slop rulebook in RULES applies to every string and style this prompt touches.
- No new visual system. Keep the cream editorial desk, the rust rule, and the Don't Panic wordmark. Change spacing, rhythm, hierarchy, transitions, and states only, through the existing tokens in packages/app/src/design/.
- Every transition respects prefers-reduced-motion.
- No new heavy dependency. No new font family, no new animation library.

## Goal

Make the Guide desk look better without replacing its look. Improve spacing scale use, type rhythm (size, weight, leading, measure), visual hierarchy (one clear primary action per screen), transitions (short, purposeful, off under reduced motion), buttons (rest, hover, focus, active, disabled, loading), empty states, dark mode (contrast and surfaces), and mobile (375 first). Follow the anti-slop rulebook in RULES. Check by screenshots at 375, 768, and 1440 in light and dark through the existing polish e2e.

## Why this prompt exists

The desk works but reads as uneven in places. A disciplined pass on the existing tokens lifts it to agency grade without a redesign or new dependency.

## Read first

- packages/app/src/design/ (tokens, type, motion, components)
- packages/app/src/client/ (screens and states)
- packages/app/e2e/polish.spec.ts (screens, ready marker, overflow, contrast, focus, motion checks)
- DECISIONS.md and context/matt-answers.md (authority)

## Files to create or change

- packages/app/src/design/ (token values and component styles)
- packages/app/src/client/ (markup only where hierarchy needs it)
- packages/app/e2e/polish.spec.ts (extend, never loosen)
- packages/app/test/ for any token or component test

## Non-goals

- No new visual system, palette, wordmark, or font.
- No new dependency.
- No change to approval gates, copy meaning, or flows.
- No loosening of any polish check.
- Do not touch the Suggest behavior from 175 except to keep its tests green.

## Steps

1. Verify first. Before editing, read the current code and the git log. Decide per must_have whether the defect still exists. If a must_have is already satisfied by the current code and has a test, change nothing for it and record "already fixed: <evidence>" in the summary. Do only what is still needed. If everything is already satisfied, make no code change, write the summary, and commit it with the commit line below.
2. Capture a baseline: run the polish e2e and save screenshots of every screen at 375, 768, and 1440 in light and dark. Write a short list of the ten worst issues you see (cramped spacing, weak hierarchy, inconsistent buttons, bare empty states, poor dark contrast, mobile overflow or tap targets under 44px).
3. Fix them through tokens first, then components, then markup. Use the existing spacing and type scales; add a token only when none fits. Keep one primary next action per screen.
4. Transitions: use the motion tokens, keep them under 250ms for UI state, and guard all of them with prefers-reduced-motion. Add a reduced-motion assertion to the polish e2e if missing.
5. Buttons and empty states: one consistent set of states across the app; every empty plate gets a calm headline, one line of plain copy, and one action. No exclamation marks, no banned words.
6. Dark mode: check contrast of text, borders, rules, focus rings, and the assumed marker; the polish contrast check must pass with the same thresholds.
7. Re-capture screenshots at 375, 768, and 1440 in light and dark, compare with the baseline, and list what improved in the summary. Run the full verification list.

## Acceptance criteria

- [ ] Spacing, type rhythm, and hierarchy are visibly improved on every screen at 375, 768, and 1440.
- [ ] Buttons share one consistent state set and empty states follow one pattern.
- [ ] Dark mode passes the polish contrast and focus checks.
- [ ] Transitions are guarded by prefers-reduced-motion and tested.
- [ ] The polish e2e passes in light and dark with no check loosened.
- [ ] No new dependency, no new visual system, no anti-slop violation.

## must_haves

truths:

- The cream editorial desk, rust rule, and Don't Panic wordmark are unchanged in identity.
- Every screen at 375, 768, and 1440 in light and dark passes the polish e2e.
- Reduced motion disables non-essential transitions.
- No new dependency was added.

artifacts:

- Updated tokens and components in packages/app/src/design/
- Updated polish.spec.ts (stricter or equal)
- Before and after screenshot notes in the summary

key_links:

- Polish e2e covers every screen in both themes and three widths.
- All colors and spacing come from design tokens.

prohibitions:

- Do not push, deploy, or create a remote.
- Do not weaken an approval gate (brief approval, prompt approval, Elevate, Hostinger yes).
- Do not restyle: keep the cream editorial desk, the rust rule, and the Don't Panic wordmark.
- Do not weaken, skip, or delete a test.
- Do not start the next prompt.
- Do not edit run-build.ps1.

## Verification

```powershell
pnpm lint
pnpm typecheck
pnpm -r test
pnpm exec tsc -b --pretty false
pnpm --filter @hitchhiker/app e2e
```

## Report back

Put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/176.md` if that directory exists. The summary names, per must_have, "already fixed" or "fixed now" with evidence, files changed, tests run, and anything assumed.

## Commit

```
feat(app): beauty pass on spacing, type rhythm, states, and dark mode
```
