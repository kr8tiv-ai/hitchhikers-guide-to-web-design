---
id: "065"
kind: build
phase: babel-fish
slice: The Brand Brain
title: "Render the brand kit as an approval page with optional social frames"
tier: Heart of Gold
effort: high
model: grok-4.7
depends_on: ["059", "030", "055", "010", "063", "051"]
files: ["packages/app/src/brand-kit.ts", "packages/app/src/brand-kit.css", "packages/app/test/brand-kit.test.ts", "packages/templates/src/social.ts", "packages/templates/test/social.test.ts"]
requirements: ["HH-BRAND-09", "HH-BRAND-10"]
review_checkpoint_embedded: false
---

# 065. Render the brand kit as an approval page with optional social frames

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

Render the Babel Fish reveal: a designed brand-kit page (using the 010 design system for the frame and the user's proposed brand for the content) with purpose and why, archetype, positioning, three story lengths, palette with roles and contrast, type specimen with the user's headline, logo set (master, one-colour, reversed, favicon), imagery rules with approved images, voice kit items (traits, vocabulary, banned words, slogans, microcopy), and optional social frames. Every item has Approve and Redo. It exports brand-kit.html and a print PDF for agencies.

Merged scope (formerly a separate prompt, "Add optional social frames that use the voice file"): Render three social captions and a plain SVG frame at 1080 by 1080 that uses the paper and ink tokens. Captions must pass the truth linter and the voice bans. This is optional output. compileBrand does not require it.

## Why this prompt exists

The user approves a brand by looking at it. A markdown file alone will get a yes they did not mean.

Some users want a launch post. The frame should not become a second brand system with different colors and an exclamation mark.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 9 first look and section 14
- packages/engine/src/brand/brain.ts
- packages/app/src/shell.css
- hh-build-plan/CONTEXT-PACKAGE.v2.md section 9 (optional social templates)
- packages/engine/src/brand/voice.ts

## Files to create or change

- packages/app/src/brand-kit.ts
- packages/app/src/brand-kit.css
- packages/app/test/brand-kit.test.ts
- packages/templates/src/social.ts
- packages/templates/test/social.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

renderBrandKit(model) returns HTML. model includes the compiled sections as already escaped text plus palette hex values. Swatches are divs with background set from the hex after a validator. Reject a hex that is not three or six digits so a prompt cannot inject CSS. Approve buttons are data-approve=<section>. The page is not the client site. It is the Guide's desk. No three-card feature grid, no gradient, no lorem, no exclamation marks. Include a banner `Draft. Not approved.` Contrast of the page's own UI still uses the shell ink and paper, while the swatches display the proposed brand colors. Do not set body text to a failing brand ink.

Merged scope, "Add optional social frames that use the voice file": renderSocial(input) returns `{ captions: string[], svg: string }`. Three captions, each under 40 words, ending in a period. They may use the first tagline and the offer. They may not claim a sale, a star rating, or a follower count. The SVG is a rectangle in the paper color, a smaller rectangle in signal, and a text element for the brand name. Social SVG may use `<text>` because it is not the logo. Do not use the logo tracer here. No platform API. No posting.

## Interfaces and data shapes

```ts
export interface BrandKitModel {
  why: string;
  archetype: string;
  stories: { s25: string; s100: string; s300: string };
  voiceItems: Array<{ id: string; text: string }>;
  logoSet: { master: string; oneColor: string; reversed: string; favicon: string } | null;
  images: string[];
  purpose: string;
  positioning: string;
  taglines: string[];
  palette: { paper: string; ink: string; signal: string };
  typeNames: string[];
  logoSvg: string | null;
}

export function renderBrandKit(model: BrandKitModel): string;
```

```ts
export function renderSocial(input: {
  name: string;
  tagline: string;
  offer: string;
  palette: { paper: string; ink: string; signal: string };
  evidence: Evidence;
}): { captions: string[]; svg: string };
```

## Steps

1. Escape every text field. Test a purpose containing `<script>`.

2. Validate hex before putting it in a style attribute. Invalid hex throws.

3. If logoSvg is non-null, run the same checks as assertLogoSvg by duplicating the small forbidden-substring check here or by importing a shared function. App may import engine. It may not import assets if that breaks the boundary. Duplicate the substring check in the app to avoid a new dependency edge, unless assets is already allowed. It is not. Keep the check local.

4. Five taglines render as a list. Zero taglines render `No taglines yet.`

5. Each of purpose, palette, type, taglines, logo has a data-approve button. Logo slot says `No logo yet` when null.

6. CSS uses the shell variables. No indigo classes.

7. The draft banner is an h1's sibling, not a cookie banner.

8. Test the string `Draft. Not approved.` is present.

9. Do not add a live server.

10. Build three captions from the inputs using fixed templates. Run lintClaims on the join. Throw if not ok.

11. Reject a caption that contains an exclamation mark.

12. SVG width and height are 1080. Text uses the ink hex after validation.

13. Test a tagline `5 stars` with empty evidence throws.

14. Test the happy path returns three captions.

15. Do not import a social network SDK.

16. Export from the templates package index.

17. Add the templates test script if it is still a stub.

18. Keep copy free of the word elevate.

## Edge cases

- More than two type names throws. The compiler promised two.
- An SVG with `<image` is dropped and the slot shows `Logo rejected by the SVG check.`
- Tagline with `!` throws before render.
- Empty tagline uses the offer only.
- Name longer than 24 characters is truncated in the SVG text.
- Captions do not include hashtags. A hashtag in the offer is stripped.

## Acceptance criteria

- [ ] Script in the purpose is escaped.
- [ ] Approve controls exist per section.
- [ ] Invalid hex is rejected.
- [ ] The draft banner is present.
- [ ] Every voice item and every tagline has its own approve control (Q15).
- [ ] brand-kit.html and brand-kit.pdf are written under .hitchhiker/brand/.
- [ ] 375 and 1440 screenshots in the summary.
- [ ] Three captions, no exclamation marks, linter clean.
- [ ] SVG is 1080 square and uses the palette.
- [ ] A fake rating cannot be posted into the caption.

## must_haves

truths:

- The kit is a draft until each section is approved.
- Brand colors are swatches, not untested body text.
- The page is the Guide UI, not the client's homepage.
- Social copy obeys the same truth gate as the brand brain.
- Nothing is published to a network.

artifacts:

- packages/app/src/brand-kit.ts
- packages/templates/src/social.ts

key_links:

- The model is filled from compileBrand output by a later approval command.
- renderSocial calls lintClaims from the engine. Templates may depend on engine. Add the workspace dependency if it is missing.

prohibitions:

- Do not present the kit as the finished website.
- Do not use a purple gradient.
- Do not embed untrusted SVG without the substring check.
- Do not post to X or any network.
- Do not invent follower counts.
- Do not treat this SVG as the logo.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/app test
pnpm --filter @hitchhiker/templates test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/065.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(app): render the brand kit for approval
```
