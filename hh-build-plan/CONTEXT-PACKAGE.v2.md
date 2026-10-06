# The Hitchhiker's Guide to Web Design: Master Context Package v2

> **v2, 2026-10-06.** Successor to `CONTEXT-PACKAGE.md` (v1, 2026-10-05). v1 is untouched. This file is the spec the build prompts implement.
>
> **Markers.** `[changed]` and `[added]` mark departures from v1. Unmarked sections restate v1 because the decision still stands.
>
> **Authority.** (1) `DECISIONS.md` at the repo root, especially D-001. (2) `context/matt-answers.md`. (3) This v2 file. (4) `hh-build-plan/RESEARCH-ADDENDUM.md` for facts checked on 2026-10-06. (5) `context/research/00`–`12` where the addendum is silent. (6) `vendor/gsd-core` for the shape of spec files.
>
> **Paths.** `context/…` and `vendor/…` are repo-relative. v1's old `/workspace/context-engine/` paths are retired. Write further planning files only under `hh-build-plan/`.

> **DON'T PANIC.**
> *Simple questions in. Very technical, award-level websites out.*

| | |
|---|---|
| **Document** | Master context package v2.0 |
| **Product** | The Hitchhiker's Guide to Web Design. Free, MIT, open source, independent. Not AntiHero-branded. Not about Matt. |
| **Runs on** | The user's machine, inside Grok Build, under their SuperGrok plan. Cloud later. |
| **Backbone** | GSD. `vendor/gsd-core` (MIT, v1.7.0, commit `13d37238`) is the source of the spec-file shapes and the workflow ideas. The app ports those templates. It does not depend on gsd-core at runtime. |
| **Public repo** | `github.com/kr8tiv-ai/hitchhikers-guide-to-web-design` (public, MIT, already exists). Build prompts never push; the steward pushes after review. |

---

## 0. How to use this document

Two products are described here.

- **The Guide (this app).** A Grok Build plugin, a CLI, a local companion app, and a dashboard. It interviews a person, builds a brand, writes a spec and 50–150 site prompts, drives Grok Build one fresh session at a time, reviews every three prompts, and launches the site.
- **The generated site.** The user's website. The Guide produces it. The Guide is not itself an Astro marketing site for a client.

"The user" is the person using the Guide. "Matt" is the product owner.

`[added]` IMP-19. Build **this app** from `hh-build-plan/prompts/` in index order. One prompt, one job, one fresh session. Do not start the app from this file alone.

## 1. Vision and north star

**North star (Matt, verbatim):** "Feels like a 2-hour meeting with the greatest brand agency on the planet, using the greatest AI on the planet."

**Mission:** help new entrepreneurs, and the agencies and designers who serve them, ship sites at Awwwards Site-of-the-Day standard, with or without 3D, without needing to know what ScrollTrigger is.

The user gets:

1. A long, warm, funny, precise interview they can talk through or type. Anything is skippable. Real example sites show up when taste is vague.
2. A brand with a why, an archetype, positioning, a voice guide, a palette, fonts, and a logo as a clean SVG. They can bring their own and be asked "happy with this?"
3. A PRD, a context document, and every build prompt, written for Grok 4.7, approved before the build.
4. An autopilot they can watch. A reviewer every three prompts. A watchdog that fixes ordinary errors before they notice.
5. Gates: Lighthouse on the phone, no console errors, accessible, SEO-ready, brand-approved. Then Elevate, as often as they like.
6. Deploy, Hostinger first, plus written instructions. Nothing deploys without a yes.

**What it is not:** a hosted builder, a drag-and-drop editor, a template store, or a paid SaaS.

`[added]` IMP-16. Speed is a competitor advantage (research 12). After the first mood or Suggest, Babel Fish may show a **provisional direction board** (palette, type, one headline). It is labeled provisional. It is not a website and it does not skip later approvals.

## 2. Product principles

1. **Don't Panic.** Plain words, visible progress, save and resume. Affectionate homage only. No book quotes, no cover pastiche (CRITIQUE Q-D).
2. **Simple questions in, very technical websites out.**
3. **Spec-driven, the GSD way.** State lives in files. Each step runs in fresh context. Plans have must-haves. Verification is goal-backward.
4. **Everything is skippable, nothing is blank.** Skip writes a smart default marked `ASSUMED`. The approval screen shows assumed fields in a different treatment from answered ones. `[added]` IMP-04. A required minimum cannot ship as an empty string (see §8.4).
5. **Brand is the constitution.** `BRAND.md`, `VOICE.md`, `MOTION.md`, and `RULES.md` are in force for every site prompt. The reviewer audits against them.
6. **No slop.** §14 is enforced. The Guide's own UI obeys it too.
7. **The phone is a first-class site.** Every heavy effect has a calm phone version and a reduced-motion version.
8. **Local-first and free.** SuperGrok for Grok Build. Imagine, Tripo/Meshy, and the X API spend money only after a budget answer and a per-batch yes.
9. **One prompt, one job, one commit.** Never "as before." Protected sections stay protected.
10. **Ask before irreversible actions.** Deploy, DNS, posting, purchases, unknown packages, unknown MCP servers.
11. **Token-efficient.** Stable prefix first. `@file` references. Path-scoped skills. Summaries of at most 150 words. Stay under 200k tokens per request so the long-context rate does not apply (addendum §4).
12. **Credit everything** in `CREDITS.json` and on a credits page, in the same commit as the borrow.
13. `[added]` IMP-05. **Three operating systems.** Windows, macOS, and Linux. Node path APIs. No hardcoded slash. No required Poppler or Homebrew.

## 3. Users

Audience is all three (Matt Q1).

| Segment | Adaptation |
|---|---|
| Beginner | Glossary on first use. More Suggest. Example sites for taste. |
| Agency | Import a brief or brand guide. Multi-project index. Client-ready PRD and brand-kit export. |
| Designer or developer | Framework, library, motion id, effort, and raw files are visible. They can edit prompts. |

`[added]` IMP-04. Module 0 picks a depth. The user can change it later.

| Depth | Default for | Shape |
|---|---|---|
| **Deep, "the full Guide" (default, recommended)** | Everyone, unless they ask to go faster. Matt wants a long interview. | Every id, Why Finder inside Don't Panic, up to 5 mood images get a why, gallery walk continues until 3–5 loved sites have a reason, glossary on first use. |
| **Standard** | Anyone who asks for a shorter walk after DP-0.7 | Every id still asked. Why Finder long form deferred to Babel Fish (one-sentence stub kept). Gallery walk stops at 3 loved sites. |
| **Express** | Developers, or anyone who asks for speed | Every id still exists. Ids the user does not see are written ASSUMED with the tree default, highlighted on the Site Brief, and re-asked in the next phase's Before-we-jump. Module 3 yes/no items may be batched. Taste, motion, and positioning stay one question at a time. |

Rule: no mode removes an id from the tree, the brief, or the PRD assumptions list. Modes change pacing and explanation depth only. Changing mode later is always allowed. Pushback holds the line twice on a vague answer before it is accepted and marked SOFT. (Matt, 2026-10-06, D-004.)

Turn ranges shown up front, as ranges: Deep (default) 80–120, Standard 50–80, Express 25–40. They are not a contract.

Continuous level detection still applies: technical vocabulary upgrades the gloss level; two "what's that?" replies downgrade it. Stored in `PROJECT.md` under User profile, mirroring `vendor/gsd-core/gsd-core/templates/user-profile.md`.

`[added]` IMP-06. Agency mode registers the project in the home index (`os.homedir()` + `/.hitchhiker/index.json`). The index stores name, path, and updated time. It does not copy `.hitchhiker/` out of the project.

## 4. Surfaces

Three surfaces, one engine, one on-disk state (`.hitchhiker/`).

1. **Grok Build plugin (primary).** `.grok/skills`, `.grok/agents`, `.grok/hooks`, `.grok/rules`, plus `AGENTS.md`. Commands in §18.
2. **Companion app.** Local web UI. Push-to-talk, uploads, example cards, Guide map, approvals. Talks to Grok through ACP (`grok agent stdio`) as documented in `context/sources/xai/cli_headless-scripting.md`.
3. **Dashboard.** Same app, its own route. Queue, screenshots, watchdog, gates, cost, pause, approve, elevate, deploy.

`[changed]` IMP-11. The CLI's own `grok dashboard` is xAI's Agent Dashboard. Ours is `/hh-dashboard` and must be named that way in the UI so the two are not confused.

**Voice.** Push-to-talk. The user may talk the whole way. The Guide replies in text only. No TTS.

- Default: whisper.cpp (MIT), local. Models `base.en` or `small`. `large-v3-turbo` optional. Per-OS binary or build. Weights from an official Whisper card, recorded in NOTICE.
- Optional: xAI speech-to-text, $0.10/hr REST or $0.20/hr streaming (addendum §4). Requires an API key. The settings screen shows the rate before enabling it.
- Most cost-effective wins. Local is the default.

**Save and resume.** `STATE.md` is the spine, written under a lockfile (`STATE.md.lock`, exclusive create, stale after a dead pid). `[added]` IMP-06. Progress is visible the whole time. Each phase ends with a reveal.

## 5. Phases, slices, tiers

### 5.1 The six phases (names locked, Matt Q35)

| # | Phase | Main outputs | Exit gate |
|---|---|---|---|
| 1 | **Don't Panic** | `INTERVIEW.md`, `SITE-BRIEF.md`, `PROJECT.md`, reference cards, upload index | User approves the Site Brief |
| 2 | **Babel Fish** | `BRAND.md`, `VOICE.md`, logo SVG set, tokens, graded assets, brand-kit page | User approves the kit, item by item |
| 3 | **Deep Thought** | `PRD.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `MOTION.md`, `VISUAL-DIRECTION.md`, `SECTION-PLAN.md`, `ASSETS.md`, `RULES.md`, `CONTEXT.md`, `prompts/NNN-*.md` (50–150) | User approves PRD, context doc, and prompt list |
| 4 | **Improbability Drive** | Commits, summaries, reviews, screenshots, watchdog log | All prompts done or explicitly deferred. No open BLOCKER |
| 5 | **Mostly Harmless** | `QA-REPORT.md`, `UI-REVIEW.md`, brand sign-off, Elevate rounds | Gates in §12 pass. User signs off |
| 6 | **So Long and Thanks for All the Fish** | Deploy, `DEPLOY.md`, `HANDOFF.md`, launch kit | User approved the deploy. Live URL is healthy |

**Before we jump.** Each phase starts with 3–8 skippable questions generated from the previous files: gaps, contradictions, ASSUMED items. Example: calm brand voice plus motion level 9 becomes "calm 9, or drop to 7?"

### 5.2 Slices

Hierarchy is **Phase → Slice → Prompt**. GSD's milestone is the site. GSD's plan is our prompt.

`[changed]` IMP-07. The name **Heart of Gold** belongs to Babel Fish only. The generated site's hero slice is **Infinite Improbability**.

**Generated-site slice catalog** (Deep Thought picks and may add):

| Phase | Slice | What it is |
|---|---|---|
| Don't Panic | Towel Check | Experience, prior sites, uploads |
| | Ford's Field Notes | Brand and assets |
| | The Question | Goals, KPIs, site type |
| | Vogon Neighbors | Competitors and SEO |
| | Point-of-View Gun | Taste, galleries |
| | Pan Galactic Gargle Blaster | Motion, 3D, movie or branching |
| | Bistromathics | Budgets, deadline, hosting |
| | Guide Entry | Site Brief and "what did I get wrong?" |
| Babel Fish | Deep Why | Golden Circle |
| | Heart of Gold | Archetype, positioning, story |
| | Sens-O-Matic | Palette, type, imagery |
| | Magrathean Logo Works | Imagine concepts, clean SVG |
| | Babel Voice | Voice, slogans |
| | Hyperspace Bypass | Grade and upscale collateral |
| | The Brand Brain | Compile and reveal |
| Deep Thought | Seven and a Half Million Years | PRD and requirements |
| | The Ultimate Question | KPIs and conversion |
| | Earth Mk II Blueprints | Sections, visual direction, motion spec |
| | Infinite Monkeys | The prompt package |
| Improbability Drive | Vogon Constructor Fleet | Scaffold, tokens, fonts |
| | Infinite Improbability | Hero and nav `[changed]` |
| | Milliways Menu | Sections and pages |
| | Somebody Else's Problem Field | Forms, email, Stripe, booking, CMS, analytics |
| | Pan Galactic Gargle Blaster | Motion, using the toolkit in §15 |
| | Magrathea | 3D, when the picker selects it |
| | Sub-Etha Signal | SEO, blog, performance, media |
| Mostly Harmless | Nutrimatic Test | Anti-slop |
| | Total Perspective Vortex | Jury and gates |
| | Slartibartfast's Fjords | Elevate detail |
| So Long… | Milliways at the End | Deploy |
| | Share and Enjoy | Launch kit and handoff |

**App-build slices** (the prompts in `hh-build-plan/prompts/`, which build the Guide itself) use the names in `ROADMAP.md`. They are not the same catalog. Do not reuse an id across the two.

**Agents in the UI:**

- **The Guide** interviews.
- **Deep Thought** plans.
- **Eddie** orchestrates and posts progress.
- **Marvin** is the watchdog.
- **Zaphod** reviews, desktop and mobile.

### 5.3 Tiers

| Tier | Name | Effort | Typical work |
|---|---|---|---|
| 1 | Towel | `medium` | Config, credits, copy placement, small fixes |
| 2 | Cup of Tea | `medium` | Simple sections, nav, forms, SEO tags |
| 3 | Gargle Blaster | `high` | Motion systems, Lenis, transitions, integrations |
| 4 | Heart of Gold | `high` or `xhigh` | Scroll video, 3D, shaders, hard layout |
| 5 | Forty-Two | `xhigh` | PRD, prompt package, once-over, Elevate, architecture |

Model is `grok-4.7` unless the user overrides. Recommend high or xhigh for build and finishing (Matt Q25). Easy work is medium (Matt Q39). `/hh-doctor` records the CLI's accepted `--effort` strings (addendum §1).

## 6. The Guide, persona

Funny, artsy, friendly, precise, a bit pushy. Text only.

`[added]` IMP-14. The "precise" trait is the whole of the neurodivergent note. The persona prompt must say: pattern-noticing, literal clarification, love of lists, info-dumps capped at three sentences. It must also say: never joke about autism, never diagnose the user, never perform a stereotype, never use the word as a bit.

Other rules, unchanged in spirit:

- One question at a time, except Express module-3 batching.
- Every card: Answer, Suggest for me, Skip.
- Suggest is grounded in known facts. Taste questions show real sites: 2 Godly + 2 Awwwards when live cards exist, otherwise the curated pack.
- Push back on empty adjectives, "everyone," contradictions, and illegal or invented proof. Twice, then accept and mark `SOFT`.
- Mirror every eight questions or so. Confirm at module end.
- Explanations are two sentences for beginners and absent for pros.
- Reply in the user's language. Content locale goes in `PROJECT.md`.
- "Happy with this?" on provided assets, plus an offer to improve them. Do not use the banned word "elevate" in sentences. The feature name Elevate is allowed in chrome (`[added]` IMP-15).
- One joke per three or four messages. No joke when the user is lost.
- The Guide itself obeys the banned-word list.

## 7. Inputs

| Input | How | Lands in |
|---|---|---|
| Voice | whisper.cpp or xAI STT | `INTERVIEW.md` |
| Text | Direct | `INTERVIEW.md` |
| PDF | `[changed]` IMP-05. `pdfjs-dist` for text and page images. Not `pdftotext`. | `uploads/` |
| Images | Grok vision plus deterministic grade | `uploads/`, `ASSETS.md` |
| URLs | Playwright. Robots.txt respected. Desktop and mobile screenshots, text, computed fonts and colors, stack sniff (`gsap`, `THREE`, Lenis, `__NEXT_DATA__`, Webflow). | `references/*.md` |
| Competitors | Same crawler plus title, meta, H1–H3, schema, word count, blog presence | `research/COMPETITORS.md` |
| Pinterest | `[changed]` IMP-12. Export or screenshot is the default. Playwright capture is off unless the user turns it on. | Mood folder |
| Brand guide | Parsed. Each field is `IMPORTED` until they reject it. | `BRAND.md` |
| X account | Optional OAuth 2.0 PKCE, read-only. Cost shown. Posting is v2. | Voice samples |
| Fonts, video, GLB | License check. GLB via gltf-transform inspect. | `ASSETS.md` |

Crawl stores principles, not copied assets.

`[added]` IMP-12. Godly and Awwwards: the curated pack is what the interview uses offline. Live fetch is optional, cached, and limited. No undocumented API is assumed (addendum §8).

## 8. Don't Panic, the interview

### 8.1 Miro

Boards in `context/miro/` are the skeleton. v1 §8.1's transcription matches them. Keep that mapping:

- Board 1 → Module 1, and it seeds Babel Fish.
- Board 2 → Modules 2, 3, and 4.
- Board 3 → Prompt 01's ten topics, spread across the modules, plus the gallery instruction (aura.build, godly, awwwards, ten likes, then why). Cap loved references at 3–5 with a reason each (research 05). Ten is the walk, not the final board.

### 8.2 Question schema

`interview/tree.yaml`. Each item:

```yaml
id: DP-1.1
module: ford-field-notes
depth: [express, standard, deep]   # added: which modes include it
ask: "Do you have a logo you love?"
why: "The logo anchors color, type, and tone."
input: [upload, text, voice]
skip_default: "Generate logo concepts in Babel Fish."
suggest: "Three directions from archetype and industry."
pushback_if: ["it's fine", "raster under 512px"]
writes: [BRAND.md#logo, ASSETS.md#logo]
```

Coverage values: `ANSWERED`, `SUGGESTED`, `SKIPPED` (value is `ASSUMED`), `SOFT`, `IMPORTED`.

### 8.3 Modules

Module ids and intents are the v1 tree. Implement every id below. Wording may be rewritten in the Guide's voice. Do not drop an id.

**Module 0, Towel Check.** DP-0.1 self or client. DP-0.2 prior sites and tools, then crawl. DP-0.2a love and wince. DP-0.3 comfort (four rungs). DP-0.4 existing brand assets. DP-0.5 optional X, read-only. DP-0.6 mic or keyboard. DP-0.7 time today, and the depth offer (Express / Standard / Deep). `[added]`

**Module 1, Ford's Field Notes.** Skip the module if a guide is imported, then "happy with this?" per field. DP-1.1 logo. DP-1.2 color, with the mixed-research caveat. DP-1.3 slogan. DP-1.4 mood, why per image, cap 5. DP-1.5 fonts, or six pairings using their headline (Bebas Neue + Barlow, Space Grotesk + Inter, DM Serif Display + DM Sans, Fraunces + Work Sans, Archivo Black + Archivo, Clash Display + Satoshi). DP-1.6 voice as person or animal, then brands they like, optional NN/g sliders. DP-1.7 why. Deep runs Why Finder here. Express and Standard may defer the long finder to Babel Fish but must leave a one-sentence stub. DP-1.8 kindred and loved-unrelated brands. DP-1.9 asset inventory and protected list.

**Module 2, The Question.** DP-2.1 why this site, one sentence. DP-2.2 one visitor action. DP-2.3 site type, multi-select, from the v1 table (sales, funnel, calls, reservations, sign-ups, portfolio, content, local, event, personal, nonprofit, recruiting, investor, app). Each type names a primary KPI, events, and a knowledge pack. DP-2.4 KPI helper: current numbers, goal, visitors at a stated assumed conversion range, which page carries it. Ranges are labeled assumptions. Writes `KPIS.md`. DP-2.5 funnel, brand, or hybrid. DP-2.6 one visitor (want, fear, device). DP-2.7 offer. DP-2.8 pages they think they need.

**Module 3, Tools.** DP-3.1 contact form (default yes). DP-3.2 sell products, then Stripe Payment Links vs Shopify Buy Button vs full store (full store escalates). DP-3.3 bookings. DP-3.4 newsletter, ask which platform. DP-3.5 blog and whether they edit later. DP-3.6 video, media, portfolio. DP-3.7 specials (MLS, maps, member areas, and so on) with Suggest and approval-gated discovery. DP-3.8 analytics: Plausible or Umami, or GA4 with consent. DP-3.9 locales.

**Module 4, Vogon Neighbors.** DP-4.1 competitors, crawl, sea of sameness, three white spaces. DP-4.2 envy and boredom. DP-4.3 blog and keyword posts. No invented search volumes. DP-4.4 where customers are. DP-4.5 answer-engine goals, without promising citations.

**Module 5, Point-of-View Gun.** DP-5.1 three to five loved sites and what exactly they love. DP-5.2 guided walk if they have none. DP-5.3 three vibe words and three never-words. DP-5.4 visual interview ending in the signature moment. DP-5.5 light: moody, airy, or paper. DP-5.6 photo, illustration, 3D, or type-only.

**Module 6, Pan Galactic Gargle Blaster.** DP-6.1 motion families in plain words, with a preview from the pack and a link. Families cover research 04 ids A1–H3. Magnetic buttons are described as banned, not offered. `[changed]` The walk names the tool the picker would use (CSS, GSAP, Three, OGL, Theatre, Motion, anime.js, vanilla) in one clause, without a lecture. DP-6.2 appetite 1–10. DP-6.3 full movie or branching story, with the cost in build length, weight, phone fallback, and a crawlable text layer. DP-6.4 3D source: none, pre-rendered, CC0 libraries, Tripo or Meshy, upload, or a brief for a human. DP-6.5 phone: lighter or calm. Default calm for heavy effects. DP-6.6 motion sensitivity. Reduced motion is always implemented anyway.

**Appetite, cumulative, still the weight ceiling** (`[changed]` IMP-01: ceiling, not a library ban):

| Level | Name | Weight ceiling |
|---|---|---|
| 1 | Calm brochure | Native scroll, CSS hover, a load fade |
| 2 | Gentle | Reveals, button feedback |
| 3 | Polished | Smooth scroll, headline splits, marquee |
| 4 | Editorial | Parallax, clip-path, page transitions |
| 5 | Expressive | One pinned story, optional custom cursor if it carries the brand, vector accents |
| 6 | Cinematic lite | Scroll video or image sequence, one shader background |
| 7 | Cinematic | Several scroll scenes, shared-element transitions, hover-distort, opt-in sound |
| 8 | 3D accent | One 3D moment, phone still |
| 9 | 3D-led | Scroll camera, particles, post, branded preloader |
| 10 | World | Full world, physics, a dedicated phone path |

Personality sets easing tokens in `motion.ts`: calm (long expo-out), snappy (short), cinematic (slow scrub, heavier Lenis lerp). One file. Later prompts reference it.

**Module 7, Bistromathics.** `[changed]` IMP-10. Comfort spend for Imagine, with model and resolution on every line. Prices from the 2026-09-29 xAI card (addendum §4). Examples, before retries:

- **$0 DIY.** Prompts only. User generates in the Grok app and drops files back.
- **Starter, about $1.** 10 × `grok-imagine-image` at $0.02, plus 2 × 10 s `video-1.5-lite` at 480p ($0.02/s) ≈ $0.60.
- **Standard, about $5.** 30 × `grok-imagine-image-2.0` at 1K low ($0.04) = $1.20, plus 4 × 10 s `video-1.5` at **480p** ($0.08/s) = $3.20. Total about $4.40. If they pick 1080p, recompute at $0.25/s before they confirm.
- **Cinematic.** Still and clip counts chosen so the **dollar cap** holds at the chosen resolution. Do not promise 12 × 10 s of 1080p inside a $15 cap: that video alone is $30.
- Custom cap.

Show the estimate and the running total. Stop at the cap. DP-7.2 3D generation budget, only if they chose Tripo or Meshy. DP-7.3 stock vs own vs AI.

**Module 8, Content.** DP-8.1 copy from voice, approve or reject. DP-8.2 real proof only. DP-8.3 blog cadence. DP-8.4 legal pages and claims they cannot make.

**Module 9, Limits.** DP-9.1 deadline. DP-9.2 hosting: Hostinger recommended, or Vercel, Netlify, Cloudflare, or "no idea." Domain and email. DP-9.3 who maintains it. DP-9.4 anything beyond WCAG 2.2 AA. DP-9.5 anything else.

**Guide Entry.** One-page Site Brief: goal, visitor, offer, vibe, references and what to steal (thinking, not look), what exists, what is protected, motion level, limits, coverage stats. Then "what did I get wrong?" until they approve.

### 8.4 Required minimum `[added]` IMP-04

These cannot be empty strings. Skip fills an ASSUMED value and the brief highlights it:

- Why the site exists, one sentence.
- One visitor.
- One action.
- Vibe and anti-vibe.
- Motion level (default 3, ASSUMED, if skipped).
- Hosting answer or "no idea."

The why of the **brand** may be deferred to Babel Fish. The why of the **site** may not be blank.

## 9. Babel Fish

Build a full mini brand and voice kit unless they brought one. Every module can run, suggest, import, or skip. Always "happy with this?"

Use Matt's *Build a Brand From Scratch With AI*. His prompts may be used word for word with credit (D-005). The 18-prompt method is summarized in `context/research/08-brand-intake-frameworks.md`.

Modules and outputs match v1 §9.2: Why Finder, discovery only for gaps, competitor teardown, mood analyzer, optional reverse-engineer, archetype and positioning and persona, story at 25/100/300 words, three palettes with 60-30-10 and contrast, type pairing (two families, Google Fonts or Fontshare, licenses recorded), imagery rules and Imagine prompts, logo, voice, 30 taglines in six styles down to five, optional social templates, brand brain under 1,500 words, brand-kit HTML.

**Voice file** contains traits as "this, not that," NN/g positions, vocabulary, banned words, punctuation, tone by situation, slogans, "how we talk about" product, customer, competitor, price, and ourselves, five rewrites, and microcopy for buttons, errors, empty states, and 404.

**Logo pipeline.** `[changed]` IMP-09.

1. Ten directions in text (2 wordmarks, 2 lettermarks, 2 symbols, 2 combinations, 1 emblem, 1 wildcard). Render the top four with Imagine: flat, white, no gradients. Cost shown.
2. User picks.
3. Wordmark: real font, paths via opentype.js, kern in code. Never trace Imagine's letters.
4. Symbol: `@visioncortex/vtracer` (wasm). Not potrace. Not the stale `vtracer@1.0.8` pin.
5. SVGO. Grid, viewBox, one color, reversed, 32 px and 16 px tests.
6. Export set as in v1 §9.4. Names: `[brand]-logo-[version]-[size].png`.

**Collateral.** Score 1–10. Resolution, sharpness, compression, exposure, brand fit, text-safe area. `[changed]` IMP-18. Upscaling is on (Matt, D-007): Real-ESRGAN or an equivalent runner upscales soft uploads locally; weights are downloaded at first use, checksum-verified, and never committed. A new Imagine image (cost shown) or an honest crop is still offered when upscaling is not enough. Never silently replace a real person, product, place, or piece of work.

**First look.** `[added]` IMP-16. A direction board may render before the full brain. Mark it provisional.

## 10. Deep Thought

### 10.1 Files

Port GSD's spine into `.hitchhiker/` so a user's own `.planning/` is untouched. Attribution header on every ported template, pointing at `vendor/gsd-core` MIT.

```
.hitchhiker/
  PROJECT.md  REQUIREMENTS.md  ROADMAP.md  STATE.md  config.json
  INTERVIEW.md  SITE-BRIEF.md  BRAND.md  VOICE.md  MOTION.md
  VISUAL-DIRECTION.md  PRD.md  KPIS.md  SECTION-PLAN.md  ASSETS.md
  RULES.md  CONTEXT.md  CREDITS.json
  references/  research/  prompts/  summaries/  reviews/
  phases/01-dont-panic/ … 06-so-long/
  qa/  logs/
```

`research/` holds `COMPETITORS.md`, `SEO.md`, `KEYWORDS.md`, `STACK-DECISION.md`.

`config.json` holds model, effort, budgets, gates, deploy target, voice engine, interview depth, and the session-id mode the doctor discovered.

STATE writes take the lock. The resume fields: current phase, slice, prompt, last good commit, blockers, next action.

### 10.2 PRD

The 17 sections in v1 §10.2, plus the assumptions list (every ASSUMED and SOFT field) and an approval block. Non-functional row: phone Lighthouse as in §12, WCAG 2.2 AA, privacy, browsers current-2.

### 10.3 CONTEXT.md

Assembled for build agents. Target at most ~30k tokens. Prompts pull anchors (`@.hitchhiker/CONTEXT.md#motion`) instead of pasting the file. Long teaching lives in skills.

### 10.4 Stack decision

`research/STACK-DECISION.md`: pick, why, alternatives, trade-offs, what would change it. User may override.

- **Astro** default for brand, marketing, portfolio, content, motion levels 1–9.
- **Next.js** for app features or one persistent canvas across routes.
- **Vite + React** for a single-page level-10 world.
- **SvelteKit** if they insist. Say the 3D ecosystem is thinner.
- Inventory-heavy commerce: Shopify Buy Button or Storefront, or escalate.

Versions are re-resolved at lock time from the registry. The 2026-10-05 baseline in research 06 is a starting point, not a promise (addendum §3).

### 10.5 Site prompt package

50–150 prompts. One RULES block, word for word, from `RULES.md`, at the top of each. Self-contained. Exact files. Must-haves: truths, artifacts, key links, prohibitions. Tier, effort, `depends_on`, verify command, commit message. Build order: setup, structure, pages with copy and no motion, imagery, motion, 3D, integrations, performance, SEO, credits, QA. One wow per section.

Schema is v1 §10.5's frontmatter, with `effort` in `medium|high|xhigh`.

Golden templates live in the knowledge pack and are adapted, not copied blind. Inspired by Matt's method. Not his text.

Approval before Improbability Drive: PRD, CONTEXT.md, and the prompt list (title, tier, rough time). Pros can edit any prompt.

`[changed]` IMP-17. Do not print "$10–20" as the price of a run. Subscription mode shows counts and time. API mode shows a measured estimate after evals.

## 11. Improbability Drive (Eddie)

### 11.1 Loop

```
preflight: backup branch hh/backup-<date>, dev server, baselines dir
for prompt in roadmap order, respecting depends_on:
    fresh session
    prefix = RULES + prompt file + read_first files
    grok --no-auto-update -p … -m grok-4.7 --effort <effort>
         --output-format streaming-json --max-turns <n>
         --sandbox <profile>  --session-id <id from config mode>
    Marvin watches
    one commit, verify, protected paths untouched
    summary ≤ 150 words, STATE updated
    if prompt index % 3 == 0 or phase end: Zaphod, fresh session
final xhigh once-over, then Mostly Harmless
```

`[changed]` IMP-11. Session ids: doctor records whether this CLI wants a UUID or accepts a name. Alias `hh-<site>-<NNN>` always exists in STATE. The flag gets whichever form worked.

Parallelism off. Worktrees exist in the CLI and stay behind a config flag.

Permissions: deny push, deploy (unless this is the launch command and the user said yes), deletes outside the repo, and illegitimate packages. `--always-approve` is allowed only inside that profile. Hooks fail open (addendum §5). The orchestrator re-checks git.

### 11.2 Marvin

Sensors: streaming-json gap (default 120s), turn budget, non-zero exit, StopFailure, PostToolUseFailure, dev-server errors, build, Playwright console and failed requests.

Triage, from GSD's executor:

- Rules 1–3: fix in a fresh session, one effort step higher.
- Package failure: never substitute a lookalike. Legitimacy check, then escalate.
- Rule 4 (framework swap, new backend): escalate.
- Three strikes or two stalls: on the build branch only, reset to the last `hh-good-*` tag, retry once at higher effort, then escalate with two or three options. Never reset the user's main branch without a yes.
- Rate limits: backoff, pause, tell them.

Voice: gloomy, competent, short. No exclamation marks.

### 11.3 Zaphod

Every 3 site prompts and at phase end. Effort `high`. Phase end and the final pass are `xhigh`.

1. Screenshots at 375, 768, 1440, 1920. Full page and above the fold. A short scroll strip for motion sections.
2. Goal-backward check of must-haves. Task completion is not a verdict.
3. Watcher questions: done, protected files, RULES, what to look at on localhost, a fix prompt.
4. Six pillars scored 1–4 (copy, visuals, color, type, spacing, experience) plus Motion and Brand. Brand dimensions 1–10: message, voice, color, type, imagery, layout.
5. Anti-slop scan.
6. Verdict PASS (tag `hh-good-NNN`), FIX (at most two rounds, then a known issue unless BLOCKER), or ESCALATE.

`[added]` The same cadence applies while **building the Guide**: the steward runs the checkpoint prompt after every three build prompts. Those checkpoints are separate files. They do not add features.

### 11.4 Progress and the final pass

Eddie posts one calm line per prompt. Dashboard shows queue, stream, screenshots, verdicts, spend, pause.

Before Mostly Harmless, one xhigh pass reads the PRD, CONTEXT, summaries, and reviews. Drift, dead code, token mismatches, missed requirements, protected integrity. The fix list becomes prompts.

## 12. Mostly Harmless

`[changed]` IMP-03. Gates:

| Gate | Threshold |
|---|---|
| Lighthouse mobile (real mobile test: LHCI mobile preset, throttled, median of 3 runs, every route as a phone actually receives it), Performance, Accessibility, Best Practices, SEO | **all four ≥ 90** (Matt, D-006) |
| Desktop 3D route | Not a Lighthouse free pass. FPS floor and the weight budget in research 06. A missing phone fallback is a BLOCKER |
| LCP, CLS | ≤ 2.5 s, ≤ 0.1 on the phone path. INP ≤ 200 ms is a target measured with an interaction script, labeled lab-proxy |
| Console | 0 errors and 0 failed requests at the four widths |
| axe | 0 serious or critical. Keyboard menu. Reduced motion. Contrast against tokens |
| SEO | Unique title and meta, OG image, one H1, alt text, sitemap, robots, canonical, JSON-LD that matches the page, no orphans |
| Visual diffs | Against baselines from this environment's last PASS |
| Links and weight | 0 broken. Hero video at most about 4 MB, AV1 + H.264, not on the phone as a scrub |
| Credits | File and page match |
| Brand | ≥ 8/10 on each Brand dimension, plus the user's approval |

Jury: three judges, Design / Usability / Creativity / Content, weights 40/30/20/10. "If it is a 6, say 6." The fix list becomes prompts.

**Elevate.** `/hh-elevate`, repeatable. Cold read, at most eight upgrades, ranked, tagged by pass (type and spacing, then motion, then imagery, then copy) or a standout feature. User picks. Same loop. A regressed gate does not merge. The word "elevate" in site copy is still banned. The command name is not.

## 13. So Long and Thanks for All the Fish

Before we jump: domain, DNS, email, analytics, legal pages, date.

Deploy only after an explicit yes. Also write `DEPLOY.md` and rollback steps.

`[changed]` IMP-13. **Hostinger.**

- Static (Astro `dist/` and the like): upload the built files. No second build.
- Node or SSR: archive without `node_modules`, under the 50 MB cap stated in Hostinger's Connector docs, build on their side. Node 20 or 22 LTS.
- MCP: hosted `https://mcp.hostinger.com` (OAuth) or `npx -y @hostinger/mcp`. Read the tool schema at runtime. A queued success is not "done." Poll. Never call an overwrite tool twice.
- API token path remains for users who have one. The token is shown once by Hostinger. Store it in the keychain or `.env.local`, never in the repo.

Also Vercel, Netlify, Cloudflare (`wrangler`), as in research 11.

After deploy: 200s on routes, a form test to their own inbox, an analytics test event, OG, HTTPS. Sitemap submission is instructions, not an automated login. Launch kit drafts are not posted. `HANDOFF.md` explains edit, Elevate, blog, and domain renewal. Reveal: brief beside the live site, scores, a towel badge.

## 14. Anti-slop rulebook

### 14.1 Never

Purple-to-blue or rainbow gradients. Centered hero with a floating blob. A row of three icon cards as the default. Emoji as icons. Banned words. Lorem. Stock people pointing at laptops. Default Tailwind (gray-50, rounded-xl everything, indigo buttons, all centered). The same section rhythm repeated. Invented testimonials, logos, or numbers.

### 14.2 Also never

Magnetic buttons. Cursor trails on every site. A custom cursor only when it is the brand idea, and never on touch. Glass everywhere. Gradient headlines as a default. Aurora blobs. Particle fields without a narrative. Bento as the answer to every layout. Fake "trusted by." "Learn More" or "Get Started." "Build the future of X." Sparkles and rockets. Inter as the only voice of a brand that is not Inter. Scramble on every heading. Scroll-jacking. Autoplay sound. Preloaders over 2 seconds without a real load. Grey body text. Stock glossy toruses. `max-w-7xl mx-auto text-center` on every section.

### 14.3 Banned words

unlock, elevate (in copy), seamless, revolutionize, empower, game-changer, delve, leverage, synergy, robust, cutting-edge, journey, tapestry, landscape, "in today's fast-paced world", "it's not just X, it's Y", "In a world where".

`[added]` IMP-15. Exempt: the product name Elevate, `/hh-elevate`, and app chrome headings. Not exempt: generated site copy.

Punctuation for generated sites: no em dashes, no exclamation marks, unless `VOICE.md` overrides.

### 14.4 Reach for these instead

One signature moment. SplitText line reveals with a deliberate stagger. Clip-path windows. One pinned story. A scroll-scrubbed film on desktop, a poster on the phone. View Transitions. An HDRI-lit model with a phone still. A shader that belongs to the brand, in the one WebGL context. Editorial type with real scale contrast. Asymmetric space. Specific facts only this brand has.

### 14.5 Nutrimatic lint

Static: banned words, em dash, exclamation in copy, lorem, untracked TODO, default Tailwind palette classes, purple-blue gradients, magnetic pointer math, emoji in headings. Visual: centered blob hero, three-card default, rhythm clones, contrast, "seen a thousand times" with a reason. A hit is a FIX, with a concrete alternative from this brand.

## 15. Toolkit `[changed]` IMP-01, IMP-02, IMP-20

D-001 is the whole section. Research 06's "MIT fallback" and "avoid Theatre.js" are withdrawn.

### 15.1 What ships

The Guide's templates, knowledge packs, and prompt generator include all of:

| Tool | Job the picker gives it |
|---|---|
| **GSAP**, including ScrollTrigger and SplitText | Default engine. Sequenced scroll scenes, pins, text splits, Flip, DrawSVG, MorphSVG, Draggable where the effect needs them |
| **Lenis** | Smooth scroll, wired to ScrollTrigger, on `gsap.ticker` |
| **Three.js** | 3D and WebGL scenes |
| **OGL or raw WebGL2 / GLSL** | Distortion, noise, particles, image transitions, when Three is not already the context. If Three is up, the shader lives on Three's context |
| **Motion** (motion.dev) | React islands: layout and `whileInView`, when the file is already React |
| **anime.js** | A scoped SVG or DOM stagger that GSAP does not also own |
| **Theatre.js `@theatre/core@0.7.2`** | Authored cinematic 3D timelines from a checked-in state file. No `@theatre/studio` (AGPL) |
| **CSS scroll-driven animations** | Light reveals on a **native** scroller |
| **Vanilla JS** | One-off effects smaller than a library |

Generated sites import only what the chosen effects use.

`@react-three/fiber` and drei are added only when the stack record uses React. Plain Three is the Astro default.

### 15.2 Coexistence `[added]`

1. One scroll owner per scroller. Lenis+ScrollTrigger **or** CSS `animation-timeline`, not both.
2. One `requestAnimationFrame`: `gsap.ticker`. Three, Theatre core, and raw WebGL subscribe to it.
3. One WebGL context per page.
4. One timeline owner per element. GSAP, Motion, and anime.js do not fight over the same property.
5. `prefers-reduced-motion`: Lenis off, no scrub, no autoplay, content visible.
6. Calm phone path for every effect at level 6 and above.
7. Animate `transform` and `opacity` unless the effect is a shader or a clip-path and the prompt says so.
8. Smoke-test `@theatre/r3f` against the locked Three version. If it fails, drive object properties from `@theatre/core` directly.

### 15.3 Appetite is a weight ceiling

See §8.3. Level 2 may use a CSS reveal or a vanilla fade or a short GSAP tween. It may not load a physics world. Level 10 may use every tool the picker assigns, still with a phone path that hits the §12 performance gate.

### 15.4 GSAP

GSAP is the base engine, with Three.js, raw WebGL/GLSL, Motion, anime.js, Theatre.js core, Lenis, CSS scroll-driven animations, and vanilla JS chosen per effect (D-001). There is no fallback project.

### 15.5 Phone

Touch targets ≥ 44 px. `inputmode` and `autocomplete` on forms. Fluid type with `clamp()`. Test 375, 390, and 430. DPR cap 2. Pause WebGL offscreen.

### 15.6 Starter layout (generated site)

```
astro (TS strict) + react islands only if the stack record needs them
gsap + lenis + the per-effect imports the picker chose
src/scripts/motion.ts     shared tokens, reduced-motion, ticker, Lenis wiring
src/scripts/webgl.ts      single context factory
src/three/loader.ts       Draco/Meshopt, HDRI, pause offscreen
src/data/credits.ts
scripts/optimize-media.mjs
scripts/fetch-assets.mjs
tests/qa.spec.ts
```

Tailwind is opt-in. Default look is banned even then.

## 16. Integrations

App-level: Grok Build login or `XAI_API_KEY`. Imagine via API (capped) or DIY. Voice as §4. X read-only optional. Tripo and Meshy optional, cost preview, then gltf-transform. MCP discovery against the official registry, safety check, user yes.

`[changed]` Imagine calls use the API price card. SuperGrok is not assumed to pay for them (addendum §4).

Generated sites, out of the box: contact form (Web3Forms or Formspree, or the host's forms), Resend for transactional mail, newsletter by choice, Stripe Payment Links, Cal.com or Calendly, Astro content collections, Plausible or Umami or GA4-with-consent, self-hosted video, portfolio collections. Specials go through discovery and Rule 4 if they need a backend.

Deploy targets: §13.

## 17. Knowledge packs

Skills under the Guide's plugin. Frontmatter: `description`, `when-to-use`, `paths`. Do not set `effort` in skill frontmatter expecting Grok to apply it (addendum §2). Every non-obvious claim has a source link. No invented statistics.

Packs: sales-psychology, seo, motion (the full toolkit, §15), typography, color, ux-conversion, a11y, copywriting, award-sites-by-industry, anti-slop, brand-frameworks, stack-usage-specs (the list in addendum §9), golden-prompts.

Motion pack recipes must include GSAP+Lenis+ticker, SplitText, CSS scroll-driven with `@supports` and the no-Lenis rule, Motion in a React island, a scoped anime.js stagger, OGL or WebGL2 shader, Three lazy hero, Theatre core on the ticker, and a vanilla IntersectionObserver fade.

## 18. Commands

Skills with `user-invocable: true`. Deploy and other side effects set `disable-model-invocation: true`.

| Command | Does |
|---|---|
| `/hh-new` | Project, `.hitchhiker/`, home index entry |
| `/hh-dont-panic` | Interview or resume |
| `/hh-import` | Brand guide, URL, or assets |
| `/hh-babel-fish` | Brand phase |
| `/hh-logo` | Logo pipeline |
| `/hh-assets` | Imagine and 3D jobs, under the cap |
| `/hh-deep-thought` | PRD, specs, prompts |
| `/hh-drive` | Run the queue |
| `/hh-review` | Zaphod now |
| `/hh-fix` | One specced fix |
| `/hh-mostly-harmless` | Gates and jury |
| `/hh-elevate` | One Elevate round |
| `/hh-so-long` | Deploy and launch kit, after a yes |
| `/hh-progress` | Guide map |
| `/hh-pause`, `/hh-resume` | STATE |
| `/hh-undo` | Revert the last prompt commit on the build branch |
| `/hh-budget` | Caps |
| `/hh-settings` | Model, effort, voice, deploy, depth |
| `/hh-doctor` | grok, auth, node, playwright, whisper, git, session-id probe, effort flag |
| `/hh-dashboard` | Local dashboard |
| `/hh-help` | Don't Panic help |

GSD analogues are in v1 §18.1. Behavior above wins if they differ.

## 19. Repo shape for the Guide

```
packages/engine        state, interview, coverage, locks, cost meter
packages/orchestrator  headless runner, ACP client, Marvin, Zaphod
packages/grok-plugin   skills, agents, hooks, rules, hh install
packages/app           local chat and dashboard
packages/cli           hh binary
packages/voice         whisper.cpp, xAI STT adapter
packages/crawler       Playwright, galleries
packages/assets        Imagine, logo, grading, 3D fetch
packages/qa            LHCI, axe, anti-slop, screenshots
packages/deploy        hostinger, vercel, netlify, cloudflare
packages/knowledge     packs
packages/templates     astro, next, vite-react world, golden prompts
interview/tree.yaml
evals/                 Towel & Tea fixture
docs/
```

MIT license. NOTICE for third parties. Zero telemetry by default. Secrets in the OS keychain or `.env.local`. One audited HTTP client that logs cost.

`[added]` IMP-08. `evals/towel-and-tea/` is a fictional tea company: frozen transcript, expected brief fields, expected brand tokens. Aura Homes is not required.

## 20. Budgets

- Subscription mode: show prompt counts and time, not a fake dollar price.
- API mode: use addendum §4. Recompute from real eval token counts before showing a number in the UI.
- Stay under 200k tokens per request.
- Imagine: estimate, then cap.
- Voice: $0 local, or the STT rate if they opt in.

## 21. Risks and leftover questions

Removed on purpose: the MIT fallback and "avoid Theatre." `[changed]` D-001.

Still true:

1. Imagine API vs SuperGrok is unverified on the plan page. DIY and API-key both exist.
2. STT costs money and needs a key. Local is the default.
3. X API prices and media auth: re-fetch at the posting milestone, which is v2.
4. gsd-core is not a runtime dependency.
5. Hooks fail open.
6. AntiHero text stays out unless Matt says otherwise. The book title stays. No book text.
7. Gallery crawling stays minimal.
8. Aura Homes and Cozy Lake Cabin are missing. Towel & Tea is the fixture.
9. `--effort` accepted strings: confirm with doctor, do not guess past the four documented levels.
10. `[added]` Theatre core is pinned at 0.7.2 and is stale. Studio is AGPL and excluded. The R3F bridge is a smoke test.
11. `[changed]` Real-ESRGAN upscaling is on; weights download at first use (D-007).
12. `[added]` Session-id shape differs across two local docs.
13. `[added]` Two WebGL contexts or two scroll owners will fail the phone gate even if each effect looks right.
14. `[added]` vtracer's current package is alpha. Pin it. Golden-test one trace.
15. Trademark check before a public launch. Flag only. Name is locked.

Open questions for Matt live in `hh-build-plan/CRITIQUE.md` §9. Defaults there are what the prompts build.

## 22. Sources

- This folder: `CRITIQUE.md`, `RESEARCH-ADDENDUM.md`, `ROADMAP.md`, `INDEX.md`, `prompts/`.
- `context/matt-answers.md`, `context/miro/`, `context/research/`, `context/sources/`, `DECISIONS.md`.
- `vendor/gsd-core`, `vendor/gsd-path`, `vendor/gsd-spec-build-loop`, `vendor/VENDORED.md`.
- xAI price card: https://docs.x.ai/developers/pricing
- Hostinger Connector: https://docs.hostinger.com/hostinger-connector/overview.md
- Motion facts: addendum §3 and §8.

## 23. How the app itself gets built

The build prompts in `hh-build-plan/prompts/` implement this v2 spec. They are not site prompts.

- About 100 build prompts, six phases, fun slice names, tier and effort on each.
- A reviewer checkpoint prompt after every three build prompts, in a fresh session.
- A final Forty-Two, xhigh, once-over prompt.
- Run order, dependencies, and the critical path are in `prompts/INDEX.md` and `ROADMAP.md`.

Do not build from this section. The steward runs the prompts after reviewing them.

*Don't Panic. Bring a towel.*
