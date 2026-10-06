# Research addendum (2026-10-06)

Cited notes for the v2 spec and the build prompts. This file does not replace `context/research/00`–`12`. Those reports remain the 2026-10-05 baseline. Where this addendum disagrees with them, the addendum wins for planning, and `CONTEXT-PACKAGE.v2.md` carries the decision.

Rules: no invented stats, APIs, or flags. "Not verified" means this pass did not open a primary page that states the claim. Local docs in `context/sources/` are primary for the Grok Build snapshot in this repo.

## 1. How to read v1 §21 now

| v1 §21 item | Status on 2026-10-06 |
|---|---|
| 1. GSAP | **Closed by Matt (D-001).** GSAP is the base engine with all free plugins. Not a risk, not an open question. |
| 2. Imagine access via SuperGrok vs API key | **Unresolved on the official plan page.** API prices are real and separate. Design for API key **and** DIY. See §4. |
| 3. Grok Voice STT needs an API key | **Supported.** STT is on the API price card. Local whisper.cpp stays the default. See §4 and §7. |
| 4. X API pay-per-use and media auth | **Not re-verified this pass.** Keep `context/research/11-integrations.md` as the note, and keep posting in v2. Do not hard-code the dollar examples from that report into UI copy without a fresh fetch at build time. |
| 5. gsd-core is not Grok-native | **Stands.** Port templates. Do not npm-depend on gsd-core. `context/research/01`. |
| 6. Hooks fail open | **Confirmed** in the local doc. See §5. |
| 7. Content rights and trademark | **Answered by Matt (D-005).** AntiHero prompts may be used word for word with credit; guide PDFs stay in the repo. Name stays. No Douglas Adams book text. See §10. |
| 8. Gallery crawling | **Tightened.** Curated pack is the default. See §8. |
| 9. Facebook-group assets | **Still absent.** Evals use Towel & Tea. |
| 10. Cozy Lake Cabin URL | **Still unknown.** Not found in `context/research/03`. |
| 11. `--effort` maps to grok-4.7 low/medium/high/xhigh | **Partly confirmed.** The model supports those four efforts (`context/research/10`, citing docs.x.ai grok-4.7). The CLI flag exists (`context/sources/xai/cli_reference.md`: `--effort <LEVEL>`). This pass did not run `grok --help` to see the accepted strings. `/hh-doctor` records `grok --help` output for the flag. Do not invent a fifth level. |

## 2. Grok Build features that the orchestrator should actually use

Primary: local snapshots in `context/sources/xai/`, which match the public docs URLs listed in v1 §22.

| Feature | What the doc says | What the app should do |
|---|---|---|
| Headless | `grok -p`, `--output-format streaming-json`, `--no-auto-update` for scripts. Sessions live in `~/.grok/sessions`. | One fresh session per build prompt. Parse streaming JSON for stall detection. Always pass `--no-auto-update` from the orchestrator. Source: `context/sources/xai/cli_headless-scripting.md`. |
| Session id | Headless page: `-s, --session-id <ID>` "Create or resume a named headless session." CLI reference table: `-s, --session-id <UUID>`. | Store the human alias and the id the process returns. Doctor probes both shapes. Do not assume a slug is legal on every build. |
| Effort | `--effort <LEVEL>`. grok-4.7 efforts are low, medium, high, xhigh, default high (`context/research/10`). | Route from the prompt's `effort` field. On retry, bump one step: medium → high → xhigh. Do not bump past xhigh. |
| ACP | `grok agent stdio`. JSON-RPC: `initialize` → `authenticate` → `session/new` → `session/prompt`. Updates are `session/update` chunks. | Companion app uses ACP. The headless runner uses `-p` so CI can simulate it with a fake. Source: `cli_headless-scripting.md` and `context/research/10`. |
| Hooks | `PreToolUse` is the only blocking event. Exit 0 allows, exit 2 denies. "Everything else — timeouts, crashes, malformed output — is fail-open." | Watchdog listens. It does not trust hooks as the only gate. Source: `context/sources/xai/features_hooks.md`. |
| Permissions | `--always-approve` still respects deny rules and PreToolUse hooks. | Sandbox profile plus deny rules for push, deploy, and destructive deletes. Source: `features_permissions.md`, `cli_reference.md`. |
| Skills | `paths` hides a skill until a matching file is touched. Grok reads Claude-style skills too. Frontmatter keys `model`, `effort`, `license`, `compatibility` are accepted and **not applied**. | Knowledge packs use `when-to-use` and `paths`. Do not expect skill frontmatter to change the model. Source: `features_skills-plugins-marketplaces.md`. |
| Plugins | `grok plugin` and `grok plugin marketplace`. | The Guide ships as a plugin the installer drops into the user's project (`.grok/`), not as a marketplace dependency on gsd-core. |
| Subagents | Child sessions, own context, summary returned. Custom agents in `.grok/agents/`. | Reviewer and researchers can be subagents inside an interactive session. The default drive loop still uses a fresh headless session so context cannot leak. Source: `features_subagents.md` via `research/10`. |
| Worktrees | `-w/--worktree`, `grok worktree list\|show\|rm\|gc`. | Default off. A config flag may run independent prompts in worktrees later. Not in the v1 loop. |
| Loops and monitors | `/loop` minimum interval 60s, expire after 7 days, at most 50 active. Monitors should print only actionable lines. | Interactive mode only. The headless loop does not use `/loop`. Source: `features_background-tasks.md` via `research/10`. |
| Plan mode | `/plan` approval screen. | Deep Thought's approval UI is our own. Plan mode is a hint for humans driving Grok by hand, not the orchestrator's gate. |
| Models command | `grok models`, `grok inspect`, `grok doctor` is **not** a documented subcommand. Our `/hh-doctor` is ours. | Doctor shells out to `grok version`, `grok inspect --json`, and a login check. It must tolerate a missing binary with a plain message. |

`grok dashboard` in the CLI reference opens xAI's Agent Dashboard. Our `/hh-dashboard` is the local Guide dashboard. The commands must not be confused in the docs.

## 3. Motion toolkit (D-001), versions and licenses

Planning baseline for generated-site starters is `context/research/06-library-stack.md` (npm registry, 2026-10-05), except where this section corrects a pin. The stack-lock prompt re-resolves versions at install time and writes `stack-lock.json`. Do not invent newer version numbers in prompts.

| Library | Baseline pin from research 06, unless noted | License | Role under D-001 |
|---|---|---|---|
| `gsap` | 3.15.0 | Free. All plugins in the package, including ScrollTrigger and SplitText. | Base engine (D-001). |
| `lenis` | 1.3.26 | MIT | Smooth scroll. Package name `lenis`, not `@studio-freight/lenis`. |
| `three` | 0.186.1 | MIT | 3D / WebGL. |
| `@react-three/fiber` | 9.8.1 | MIT | Only when the stack record picks React islands or a Next/Vite React app. |
| `@react-three/drei` | 10.7.9 | MIT | Helpers, lazy. |
| `ogl` | 1.0.11 | Unlicense (research 06) | Raw-WebGL-style scenes when Three is not already on the page. |
| `motion` | 14.0.0 | MIT | motion.dev, formerly Framer Motion. `framer-motion` is the same generation per research 06. |
| `animejs` | 4.5.0 | MIT | Second timeline engine. Not a GSAP fallback. One owner per element. |
| `@theatre/core` | **0.7.2, pinned, do not float** | Apache-2.0 | Cinematic timelines. |
| `@theatre/studio` | do not ship | **AGPL-3.0** | Design-time editor. Out of the MIT app and out of generated sites. |
| CSS scroll-driven animations | platform | n/a | `animation-timeline: scroll()` / `view()`. Native scroll only. |
| Vanilla JS | platform | n/a | Small effects where a library is heavier than the effect. |

### Theatre.js maintenance

- npm `@theatre/core@0.7.2` published 19 May 2024. Source: Snyk version list, https://security.snyk.io/package/npm/%40theatre%2Fcore/versions (0 critical/high/medium/low noted there for that version; this is not a full audit).
- Release notes still describe v0.7.0 (10 Aug 2023) as "the latest" on https://www.theatrejs.com/docs/latest/releases and require `three >= 0.155.0` and `@react-three/fiber >= 8.13.6` for `@theatre/r3f`. Our baseline Three is 0.186. The bridge is a smoke test, not an assumption.
- GitHub `theatre-js/theatre` README: core is Apache-2.0; studio is AGPL-3.0; "Your project's final bundle only includes `@theatre/core`." The same README says 1.0 development was temporarily moved to a private repo. Source: https://github.com/theatre-js/theatre (fetched 2026-10-06).
- Docs for core: https://www.theatrejs.com/docs/latest and https://github.com/theatre-js/theatre/tree/main/packages/core

### Coexistence (engineering conclusion, sources named)

- CSS scroll-driven animations advance with the scrollport's scroll position. MDN, updated 2026-03-29: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll-driven_animations/Timelines
- Lenis is a smooth-scroll library that owns the scroll. Official wiring used throughout v1 and research 04/06 is `lenis.on('scroll', ScrollTrigger.update)` driven by `gsap.ticker`. Lenis site: https://lenis.darkroom.engineering
- A Lenis GitHub thread (discussion 342, May 2024) shows Lenis fighting CSS `scroll-behavior: smooth`. That is a different property than `animation-timeline`, but it is evidence the two scroll models do not stack by accident. https://github.com/darkroomengineering/lenis/discussions/342
- This pass did **not** find an official Lenis page that says "incompatible with animation-timeline." The spec rule (one scroll owner) is our engineering rule from the two mechanisms, not a quote.

Reduced motion: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion and GSAP's notes at https://gsap.com/resources/a11y/ (cited in research 04).

OGL: https://github.com/oframe/ogl (research 06: Unlicense, 1.0.11, last publish noted there as 2025-01). Re-check the license field at install.

## 4. xAI prices (fetched 2026-10-06)

Official price card: https://docs.x.ai/developers/pricing (page dated 2026-09-29 in the fetch). Also summarized at https://x.ai/api (dated 2026-09-21 in the fetch). Use the docs page if they ever disagree.

**Text, per 1M tokens, short context (under 200k prompt tokens):**

| Model | Input | Cached | Output | Context | At or above 200k prompt tokens |
|---|---|---|---|---|---|
| grok-4.7 | $2.00 | $0.50 | $6.00 | 500k | $4.00 / $1.00 / $12.00, and the higher rate applies to every token in that request |
| grok-build-0.1 | $1.00 | $0.20 | $2.00 | 256k | $2.00 / $0.40 / $4.00 |

These match `context/research/10` for grok-4.7. A third-party page (https://notcheapai.com/guides/grok-supergrok-cost-pricing-2026/, 2026-09-25) says the US regional endpoint is about 10% higher and that a SuperGrok subscription does not replace API billing. **The regional upcharge and the SuperGrok sentence were not on the official price card in this fetch.** Treat them as unverified against x.ai's plan page. The official card is enough to justify "API billing is its own meter."

**Imagine (official card):**

| Model | Output price as listed |
|---|---|
| `grok-imagine-image` | $0.02 / image at 1K and 2K |
| `grok-imagine-image-2.0` | from $0.04 / image (1K, low) through $0.08 / image (2K, medium). Media input $0.01 / image. |
| `grok-imagine-image-quality` | from $0.05 / image |
| `grok-imagine-video-1.5-lite` | $0.02 / s at 480p, $0.03 / s at 720p, $0.14 / s at 1080p |
| `grok-imagine-video` | from $0.05 / s at 480p, $0.07 / s at 720p |
| `grok-imagine-video-1.5` | $0.08 / s at 480p, $0.14 / s at 720p, $0.25 / s at 1080p |

v1's Module 7 example that priced 10 seconds of `video-1.5` at $0.08/s is only true at 480p. 1080p is $0.25/s ($2.50 per 10 seconds, before retries). v2 comfort tiers must name resolution.

**Voice API (same card):**

- Speech to text: $0.10 / hour REST, $0.20 / hour streaming. Matches research 11.
- Text to speech: $15 / 1M characters. The interviewer does **not** use TTS (Matt Q8).
- Speech to speech (`grok-voice-think-fast-2.0`): $0.08 / minute. Not the interview path.

Local docs for request shapes: `context/sources/xai/model-capabilities_images_generation.md`, `model-capabilities_video_generation.md`, `model-capabilities_audio_speech-to-text.md`.

DIY mode (Matt Q20) does not call these endpoints. It writes prompts the user runs in the Grok app.

## 5. Hooks, sandbox, and the watchdog

Confirmed locally, `context/sources/xai/features_hooks.md`:

> Exit code 0 allows, exit code 2 denies. Everything else — timeouts, crashes, malformed output — is fail-open: the failure is recorded in the session but the tool call proceeds. Only an explicit deny blocks.

So Marvin's sensors (streaming-json gap, exit code, `StopFailure`, `PostToolUseFailure`, build, Playwright) are the real gate. A hook that crashes does not stop a bad `git push`.

Deny list the orchestrator passes and also re-checks itself:

- `git push`, `git push --force`
- deploy CLIs (`vercel`, `netlify`, `wrangler`, Hostinger MCP deploy tools) unless the command is `/hh-so-long` and the user has approved
- `rm -rf` outside the repo, and any delete of `.hitchhiker/`
- package installs whose registry record fails the legitimacy gate (name mismatch, empty repo, brand-new package impersonating a known one). GSD's executor excludes package substitution from auto-fix: `vendor/gsd-core/agents/gsd-executor.md` as summarized in research 01.

Three strikes then escalate: pattern from `vendor/gsd-spec-build-loop` (research 01 §6).

## 6. Hostinger deploy (priority target)

Fetched 2026-10-06.

| Fact | Source |
|---|---|
| Official Connector (MCP) for editors. Hosted remote server `https://mcp.hostinger.com` with OAuth 2.1. Local server `npx -y @hostinger/mcp`. Docs say  the connector exposes website, domain, DNS, and other tools. | https://docs.hostinger.com/hostinger-connector/overview.md (last updated 2026-09-08 in the fetch) |
| Static websites deploy pre-built files. The doc's example: "HTML/CSS/JS, or the built output of frameworks like React, Vue, or Astro. Deploys pre-built files only. No build step runs." | https://docs.hostinger.com/hostinger-connector/using-the-connector (2026-09-08) |
| Node.js applications: archive capped at **50 MB**, exclude `node_modules` and build output, build runs on Hostinger. | same page |
| Node runtimes supported: 18, 20 (LTS), 22 (LTS), 24. Frameworks auto-detected include Astro, Next.js, SvelteKit. Output directory examples include `dist`. | https://docs.hostinger.com/node.js/creating-an-app (2026-09-23), https://docs.hostinger.com/node.js/overview |
| npm package `hostinger-api-mcp` 2.7.3, published 2026-10-05 (the day before this addendum). Agency-plan tool `agency-hosting_deploy-node-static-website` overwrites the site and "cannot be undone." | https://www.npmjs.com/package/hostinger-api-mcp |
| Older path still in v1: user-created API token, shown once (Matt's masterclass, research 09). MCP OAuth does not delete that path. | `context/research/11`, masterclass summary in research 09 |

Adapter rule: Astro/static → build locally, upload `dist/` as a static deploy. Next.js or other SSR → Node archive path, under 50 MB, never include `node_modules`. Always write `DEPLOY.md`. Always require an explicit yes. The Agency overwrite tool is never called without that yes repeated in the same turn as the deploy.

Not verified this pass: the exact JSON schema of every hosting tool. The build prompt must read the MCP tool schema at implementation time (`search` then the tool's input schema) rather than trust a remembered argument list. Hostinger's own note in this environment: a success response is often "queued." Poll the matching read. Do not re-send the write.

Vercel, Netlify, and Cloudflare remain as in research 11:

- Vercel CLI `vercel deploy` (not re-fetched; research 11 says the docs fetch was blocked).
- Netlify CLI `netlify deploy`. Pricing page was cited there: https://www.netlify.com/pricing/
- Cloudflare Workers static assets: https://developers.cloudflare.com/workers/static-assets/ via `wrangler deploy`.

## 7. Open-source pieces and licenses

| Piece | Use | License found this pass | Note |
|---|---|---|---|
| whisper.cpp | Default STT | MIT. Copyright 2023–2026 The ggml authors. | https://github.com/ggml-org/whisper.cpp/blob/master/LICENSE and README badge. Metal, Vulkan, AVX. Ship a per-OS binary or build step. Model weights: use an official Whisper model and record its card. `base.en` or `small` default, `large-v3-turbo` optional, as v1 said. |
| OpenAI Whisper weights | the model whisper.cpp runs | MIT for the openai/whisper repo, per the RealtimeSTT license survey dated 2026-05-21, which points at https://github.com/openai/whisper/blob/main/LICENSE | Confirm the exact file's card at download. Do not assume every Hugging Face conversion is MIT. |
| `@visioncortex/vtracer` | Raster symbol → SVG | MIT OR Apache-2.0 on the npm package. Repo LICENSE is MIT, copyright 2024 TSANG, Hao Fung. Tag observed: `1.0.0-alpha.4`. | https://github.com/visioncortex/vtracer . Wasm build, no native addon, which is the Windows-friendly path. Alpha: pin it. Research 06's `vtracer@1.0.8` ISC pin is **stale** and must not be used. |
| potrace | do not use | GPL-2.0 in research 06 | Stays out. |
| opentype.js | Wordmark to paths | MIT in v1 §9.4. Not re-fetched this pass. | Re-read at install. Imagine text is never traced into the wordmark. |
| SVGO | SVG optimize | MIT in v1. Not re-fetched. | Re-read at install. |
| Real-ESRGAN code | Optional upscale | BSD-3-Clause on the tree fetched via https://github.com/ai-forever/Real-ESRGAN/blob/main/LICENSE (copyright line there: 2021, Sberbank AI). The widely cited upstream is xinntao/Real-ESRGAN, also described as BSD-3 in v1. | **Upscaling on (D-007).** Weights are downloaded at first use and not committed. |
| pdfjs-dist | PDF text and page renders, no Poppler | Apache-2.0 is Mozilla's usual license for PDF.js. **Not re-opened this pass.** | Re-read at install. Chosen so Windows does not need `pdftotext`. |
| Playwright | Crawl, screenshots, QA | Apache-2.0, as commonly published. Research 06 pin `@playwright/test` 1.63.0. | Re-resolve at lock. |
| `@axe-core/playwright`, `axe-core` | A11y gate | MPL-2.0 is axe-core's usual license. **Not re-opened this pass.** | MPL-2.0 is file-level copyleft, not GPL. Allowed with NOTICE. Confirm at install. If a later audit wants only permissive licenses, swap the note, not the gate: the gate can shell out to the CLI without vendoring modified MPL files. |
| Lighthouse, `@lhci/cli` | Performance gate | Apache-2.0 typically. Research 06 pins lighthouse 13.5.0 and `@lhci/cli` 0.15.1. | Assertion shape in research 10 is from LHCI's configuration docs. |
| `sharp` | Image size, derivatives | Apache-2.0 typically. Research 06 pin 0.35.5. | Re-read. |
| gltf-transform | GLB optimize | MIT. Research 07 pin CLI 4.5.1. | `gltf-transform optimize`. |
| Poly Haven, ambientCG, Kenney, Quaternius | CC0 assets | As in research 07, with primary links there. | Poly Haven asks for attribution when their API is used in a product, even though CC0 does not require it. Do it. |
| `@theatre/core` | see §3 | Apache-2.0 | Pin 0.7.2. |
| `postprocessing` | bloom, grain | Zlib in research 06 (6.39.5). Permissive. | NOTICE. Not GPL. |
| Spline runtime | not in the default toolkit | research 06: no license field on npm | Do not bundle. |

Legitimacy check before any new dependency: registry name, license field, repository URL, and a sanity check that the repo exists and is the project we named. Record the result in NOTICE. No dependency in a prompt is pre-approved if its license comes back GPL, AGPL, or "unlicensed."

## 8. Galleries: Godly, Awwwards, and what "politely" means

**Awwwards scoring** (research 03, still the rubric): Design 40, Usability 30, Creativity 20, Content 10. https://www.awwwards.com/about-evaluation/

**SOTY as of 2026-10-06:**

- Site of the Year 2025 is **Lando Norris** by OFF+BRAND, also Users' Choice. Awwwards' own post on X, 2026-03-03: https://x.com/awwwards/status/2028869511311507570 pointing at https://www.awwwards.com/annual-awards-2025/site-of-the-year . The SOTY listing still leads with Lando Norris, then Messenger (2025), then Igloo Inc (2024). https://www.awwwards.com/websites/sites_of_the_year/
- A secondary page says SOTY is announced in February of the following year (https://stack.liuhuo.org/en/discover/awwwards, 2026-09-18). **That February rule is not from Awwwards' own about page in this pass.** Do not print it as fact in the product. Do print: there is no 2026 Site of the Year yet, because 2025's winner was announced in March 2026.
- A recent SOTD + Developer Award example: CoMinVi by Holographik, posted 2026-09-30. https://x.com/Holographikco/status/2105236852311568463 . Use it as a "current," not as a SOTY.

**Patterns that still match 2025–2026 winners and late-2026 SOTD chatter:** one signature moment, scroll as a timeline, type as image, a preloader that is part of the intro on heavy WebGL, real mobile fallbacks, opt-in sound. Research 03's tag counts (31 SOTY entries) stay the quantitative baseline. This pass did not re-count tags.

**Godly:** https://godly.website . Filtered routes such as https://godly.website/websites/webgl returned a server-rendered list of site titles on 2026-10-06 (Lusion, Opal Camera, and others). **No public API and no terms page were found in this pass.** Do not build a crawler that walks the whole catalog. Ship `knowledge/award-sites/` as a curated shortlist with outbound links. A live refresh, if implemented, is opt-in, cached for days, and limited to a handful of listing URLs.

**Awwwards listing pages** are the ones already saved under `context/sources/aww/` and `soty.html`. Prefer those snapshots plus outbound links over a live scraper.

**Codrops** remains the place an agent may borrow *code*, and only with the demo's license and a CREDITS entry. https://tympanus.net/codrops/demos/

## 9. Knowledge packs: what to encode, with sources

Packs are skills. Every non-obvious claim in a pack needs a link. The build prompts write the packs. This section is the source list they must start from, not the pack itself.

### Sales psychology

Teach principles, not tricks, and ban dark patterns.

- Robert Cialdini, *Influence* (reciprocity, commitment/consistency, social proof, authority, liking, scarcity). Primary is the book. A readable overview the pack may cite as secondary, not as a substitute for the definitions: the pack should paraphrase in our words and name the book.
- StoryBrand SB7 (customer is the hero, brand is the guide): https://storybrand.com/ and the workbook linked from research 08.
- Ethical line, already in v1: real proof only, no fake countdowns, no invented logos, urgency only when the deadline is real.
- NN/g on deceptive patterns is the guardrail to pair with persuasion. The pack prompt must fetch a current NN/g page at authoring time rather than invent a statistic about "conversion lifts."

**Do not invent** "this principle raises conversion by N%." If a source has no number, the pack has no number.

### SEO and answer engines

- Google's SEO starter and the Search Central docs are the baseline the pack should link. Not re-fetched URL-by-URL this pass. The pack prompt opens https://developers.google.com/search/docs and records the pages it used.
- Core Web Vitals thresholds used as the lab target: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 at the 75th percentile. https://web.dev/articles/vitals (cited in research 06 and 10). Re-check at pack authoring in case a threshold moved.
- Schema.org types by site type: `Organization`, `LocalBusiness`, `Product`, `BlogPosting`, `FAQPage` only when the page is actually a FAQ. https://schema.org/
- AI-search: v1's advice (clear entity facts, one H1, FAQ only if real, citeable sentences) is a practice, not a ranking promise. The pack must say that.

### Typography

- Two families maximum (Matt's brand guide, research 08).
- Fluid type with `clamp()`. Body size at least 16px, line-height about 1.4–1.6, measure about 45–75 characters (research 07 and 08).
- Sources: Google Fonts developer API (needs a key) https://developers.google.com/fonts/docs/developer_api ; Fontshare public API `GET https://api.fontshare.com/v2/fonts` (research 07, no key). Self-host woff2. `font-display: swap` or `optional`, preload the one file that paints the headline.
- WCAG contrast: 4.5:1 body text, 3:1 large text. https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html (research 08).

### Color

- 60-30-10 as a design rule, not a law of perception.
- Color psychology: research 08's caveat stands. The research is mixed. Standing out from competitors matters more than a hue chart. The pack must include that sentence.
- Tokens are CSS custom properties. Tailwind is opt-in and must not ship the default indigo look (anti-slop).

### UX and conversion

- One primary action per page (Prompt 01 and research 08).
- CTA names the outcome. "Learn More" is banned by the anti-slop list.
- Forms: visible labels, errors that say how to fix the field, `autocomplete` and `inputmode`, touch targets at least 44px (v1 §15.5).
- Funnel vs brand vs hybrid is a structural choice (research 08 §1), not a skin.

### Accessibility

- WCAG 2.2 AA is the target (v1 PRD). Contrast link above.
- Keyboard: menu focus trap, Escape closes, visible focus.
- `prefers-reduced-motion` kills Lenis, scrub, and autoplay. Content remains.
- axe serious and critical must be zero. Rule map comes from axe's docs at pack authoring time.

### Copy

- Voice file is the constitution. Banned list is v1 §14.3.
- No em dashes and no exclamation marks in generated site copy, overridable per brand in `VOICE.md`.
- Headlines are specific. The pack may show formula shapes as exercises, then say the formula is not the headline.

### Award sites by industry

- Seed the shortlist from research 03's groups A–E and research 05's deep links.
- Add Lando Norris (SOTY 2025) and note CoMinVi as a late-2026 SOTD example (§8).
- Each card: URL, style world, one "steal the thinking" line, motion ids from research 04. No screenshots redistributed in the git pack unless the license is clear. The app takes screenshots at runtime into the user's project, for that user.

### Motion pack (the D-001 pack)

Recipes, each with mobile and reduced-motion:

- GSAP + ScrollTrigger + Lenis on one ticker.
- SplitText masked line reveal. Stagger is a token, not a new value per section.
- CSS `animation-timeline: view()` for light reveals on pages that do **not** use Lenis, with an `@supports` fallback (see the 2026 notes on declaring `animation-timeline` after the `animation` shorthand: https://runebook.dev/en/docs/css/animation-timeline and MDN).
- Motion `whileInView` inside a React island only.
- anime.js for a self-contained SVG or DOM stagger that GSAP does not also own.
- OGL or raw WebGL2 fragment shader for grain, noise, displacement, and image transitions, one context.
- Three.js scene, paused offscreen, DPR cap 2, mobile still.
- Theatre core playing a checked-in state file on `gsap.ticker`.
- Vanilla: a single IntersectionObserver fade when the effect is one opacity change.

Taxonomy ids A1–H3 stay as in research 04. Magnetic buttons stay banned (D2).

### Brand frameworks

Golden Circle (Sinek, TED 2009, linked in research 08), 12 archetypes (Jung via Mark & Pearson, as used in Matt's guide), positioning statement template, NN/g four tone dimensions: https://www.nngroup.com/articles/tone-of-voice-dimensions/ . Our own words. Credit Matt's guide as inspiration.

### Stack usage specs

One skill per pairing, `paths` scoped:

- `gsap-scrolltrigger-lenis`
- `css-scroll-driven` (and the "not with Lenis" rule)
- `splittext-reveals`
- `motion-react-island`
- `anime-scoped`
- `astro-view-transitions-reinit` (kill and refresh ScrollTrigger after navigation)
- `ogl-shader-background`
- `webgl2-image-transition`
- `three-lazy-hero`
- `theatre-core-ticker` (no studio)
- `scroll-video-encode`
- `imagine-prompting`
- `3d-asset-sourcing`
- `deploy-hostinger`, `deploy-vercel`, `deploy-netlify`, `deploy-cloudflare`

## 10. Rights

- AntiHero guides are Matt's published teaching. The app is not an AntiHero product (Matt Q34, Q36). Method goes in, and his prompts may be used verbatim with credit (D-005). The guide PDFs stay in the repo.
- Hitchhiker's Guide to the Galaxy is a copyrighted book series and the title is trademark-sensitive. v1 already flags a name check. This pass did not pull a trademark registry record. Do not add book quotes, and do not generate cover-lookalike art for the app brand. Phase names that are short references stay, because Matt approved them (Q35).
- Award-site pages: store the URL and a short original note. Do not mirror HTML into the repo beyond the snapshots already in `context/sources/aww/`.

## 11. GSD files the app build copies

From `vendor/gsd-core` at commit `13d37238ba08377929e4850fd6ae4b8db49a22ca` (see `vendor/VENDORED.md`), MIT:

- `gsd-core/templates/project.md`
- `gsd-core/templates/requirements.md`
- `gsd-core/templates/roadmap.md`
- `gsd-core/templates/state.md`
- `gsd-core/templates/phase-prompt.md` (PLAN schema: `must_haves`, `<read_first>`, `<action>`, `<verify>`, `<acceptance_criteria>`)
- `gsd-core/templates/summary.md`
- `gsd-core/templates/verification-report.md`
- `gsd-core/templates/user-profile.md`
- `agents/gsd-executor.md` (deviation rules, package legitimacy)
- `agents/gsd-verifier.md` (goal-backward)
- `agents/gsd-ui-auditor.md` (six pillars)
- `agents/gsd-planner.md`
- `commands/gsd/` as the pattern for slash-command skills, not as commands we install

Port means: copy the structure into `packages/engine/templates/gsd/`, add an attribution header, then add our web files beside them (`BRAND.md`, `VOICE.md`, `MOTION.md`, and the rest of v2 §10). Do not import gsd-core at runtime.

Sibling repos, for ideas only, not as dependencies:

- `vendor/gsd-path` knows how to install skills for Grok (`research/01`).
- `vendor/gsd-spec-build-loop` is the three-strikes escalate pattern and the discover/spec/build/review split.

## 12. Claims this pass refused

- A dollar price for X API reads or posts. Research 11's numbers stay "verify at build."
- That SuperGrok login can call Imagine. Not on an official page we opened.
- A Godly API.
- A Pinterest API that returns board images without a partner key.
- That `@theatre/r3f@0.7.2` runs on Three 0.186. Untested here.
- axe-core's license SPDX, until install time. The usual MPL-2.0 is a hint, not a NOTICE line yet.
- Any conversion-rate percentage for a persuasion principle.
- A 2026 Site of the Year winner. There isn't one announced as of 2026-10-06.
