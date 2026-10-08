# The Hitchhiker's Guide to Web Design: Master Context Package

> **Paths in this repo (note added when the package moved to the project folder, 2026-10-05).** This document was written on the steward's box under `/workspace/context-engine/`. Those absolute paths have been rewritten to repo-relative ones. Any remaining short references map like this: `matt-answers.md` → `context/matt-answers.md`; `research/…` → `context/research/…`; `sources/…` → `context/sources/…`; `miro/…` → `context/miro/…`; `vendor/…` stays `vendor/…` (GSD snapshots, see `vendor/VENDORED.md`). Write all outputs to `hh-build-plan/` at the repo root. **Read `DECISIONS.md` (repo root) too: Matt's locked decisions made after this version was written override conflicting text here (D-001: no GSAP license concern; the app ships ALL of GSAP (base engine), Three.js (core 3D/WebGL), Motion, anime.js, raw WebGL/GLSL shaders (OGL or WebGL2), Theatre.js, Lenis, native CSS scroll-driven animations and vanilla JS as one integrated toolkit, and the motion picker/orchestrator chooses the right tool per effect).**

> **DON'T PANIC.**
> *Simple questions in. Very technical, award-level websites out.*

| | |
|---|---|
| **Document** | Master context package v1.0. The single document Grok 4.7 (xhigh, via Grok Build) reads before designing and planning the app |
| **Date** | 2026-10-05 (America/Costa_Rica) |
| **Product** | The Hitchhiker's Guide to Web Design (name locked by Matt Haynes). Free, open source (MIT), independent. Not AntiHero-branded and not about Matt |
| **Repo (planned)** | `github.com/kr8tiv-io/hitchhikers-guide-to-web-design` (public, MIT) |
| **Built on** | Grok Build (xAI's coding agent CLI), Grok 4.7, Grok Imagine, optional Grok Voice STT |
| **Authority order** | 1) Matt's 40 answers (`context/matt-answers.md`), 2) the Miro interview skeleton (`context/miro/*.png`, transcribed in §8.1), 3) research reports `context/research/00–12`, 4) Matt's public guides (§22) |

---

## Table of contents
0. How to use this document
1. Vision and north star
2. Product principles
3. Users and experience-level detection
4. Product form: command set, companion app, dashboard, voice
5. The six phases, slices and difficulty tiers
6. The interviewer persona ("The Guide")
7. Inputs accepted and the ingestion pipeline
8. Phase 1, **Don't Panic**: the full interview tree
9. Phase 2, **Babel Fish**: brand kit, voice kit, logo, collateral
10. Phase 3, **Deep Thought**: spec files, PRD, context doc, framework choice, prompt package
11. Phase 4, **Improbability Drive**: the execution orchestrator
12. Phase 5, **Mostly Harmless**: review, quality gates, the Elevate loop
13. Phase 6, **So Long and Thanks for All the Fish**: launch
14. The anti-slop rulebook
15. Stack defaults, framework choice, motion and 3D libraries
16. Integrations
17. Knowledge packs to ship
18. Command set, app and dashboard spec
19. Repo plan
20. Cost and token budgets
21. Risks, open questions and things to verify
22. Source index
23. **Instructions to Grok 4.7**

---

## 0. How to use this document

**Grok 4.7**, you are reading the brief for building an app. The app is itself a machine that makes websites. Two products are therefore described here:

- **The app** ("the Guide"): a Grok Build plugin plus command set, with a small companion app and a local dashboard. It interviews a person, builds their brand, writes a spec and 50–150 build prompts, then drives Grok Build to execute them with reviewers and a watchdog, and finally launches the site.
- **The generated site**: the user's website, which the app produces through Grok Build.

When this document says "the user", it means the person using the app (a beginner, agency person or web designer). "Matt" is the product owner. Section 23 tells you what to do with all of this. Everything earlier is context and requirements. Where research facts are cited, the report path is given so you can open the source and its links. **Don't invent stats or APIs. If something is marked *verify*, verify it.**

---

## 1. Vision and north star

**North star (Matt, verbatim):** "Feels like a 2-hour meeting with the greatest brand agency on the planet, using the greatest AI on the planet."

**Mission:** help new entrepreneurs (and the agencies and designers who serve them) build *insane* websites, Awwwards Site-of-the-Day calibre, 3D or not, without needing to know what ScrollTrigger is.

**What the user experiences:**
1. A long, warm, funny, slightly obsessive interview that they can *talk* through (push-to-talk) or type, skipping anything they like, with real example sites put in front of them.
2. A brand that actually means something: the why, the archetype, positioning, a voice guide with slogans, a palette, fonts and a logo delivered as a clean SVG. They can also bring their own brand and have it elevated.
3. A PRD and a "massive context document" they approve, followed by every build prompt, written specifically for Grok 4.7.
4. An autopilot build they can watch, with progress, a reviewer every 3 prompts using screenshots, and a watchdog that fixes errors before they notice.
5. A site that passes hard gates (Lighthouse mobile ≥ 90, no console errors, accessible, SEO-ready, brand-approved), then an **Elevate** loop they can run as often as they like ("how could I possibly improve this?").
6. One-click deploy (Hostinger first), plus written instructions.

**What it's not:** a hosted site builder, a drag-and-drop editor, a template marketplace or a paid SaaS. It's an open-source *agency in a box* wrapped around Grok Build. (See competitor gap analysis: `research/12-competitors.md`.)

---

## 2. Product principles

1. **Don't Panic.** Every screen and message reduces anxiety. Plain words, a sense of humor, visible progress, save and resume everywhere. Hitchhiker's energy is the brand: towels, 42, Babel fish, Marvin, Deep Thought. The tone is *affectionate homage*, and the repo must avoid using copyrighted text from the books beyond short phrase references (see §21).
2. **Simple questions in, very technical websites out** (Matt Q6). Complexity lives in the specs and prompts, never in the user's face.
3. **Spec-driven, exactly like open-gsd/gsd-core** (Matt Q29). State lives in files. Each step runs in fresh context. Plans have must-haves. Verification is goal-backward. (`research/01-opengsd-deep-dive.md`, `vendor/gsd-core/`.)
4. **Everything is skippable, nothing is lazy.** Every question offers *Answer*, *Suggest for me* or *Skip*. Skipped items get smart defaults marked `ASSUMED` in the spec. The interviewer still pushes back on vague answers.
5. **Brand is the constitution.** BRAND.md + VOICE.md + MOTION.md + RULES.md are injected into or referenced by every build prompt. The reviewer audits against them.
6. **No slop. Agency-level by default.** An explicit, enforced rulebook (§14). No magnetic buttons, no generic AI tropes. Draw from current libraries and current Awwwards winners.
7. **Mobile is first-class.** Build to the highest standard on phones (Matt Q18). Every heavy effect has a calm phone version and a reduced-motion version.
8. **Local-first and free.** Runs on the user's machine via Grok Build under their SuperGrok plan (Matt Q3, Q25). Nothing costs money without an explicit budget answer (Imagine, Tripo/Meshy, X API).
9. **One prompt = one job = one commit** (Matt's *Websites on Autopilot*). Never "as before". Protected sections are protected.
10. **Ask before irreversible actions.** Deploys, DNS changes, posting to X, purchases and installing unknown packages or MCP servers all need explicit approval.
11. **Token-efficient.** Stable cached prefixes, `@file` references instead of pasted history, path-scoped skills, summaries of ≤150 words, each prompt under 200k tokens (§20).
12. **Credit everything.** Borrowed code, fonts, models and textures go into `CREDITS.json` and a credits page in the same commit.

---

## 3. Users and experience-level detection

**Audience (Matt Q1): all three.**

| Segment | What they need | How the app adapts |
|---|---|---|
| **Beginner / new entrepreneur** | Hand-holding, explanation of terms, examples, decisions made *with* them | Explains every term inline (Matt's glossary: Grok Build, Imagine, Astro, GSAP, ScrollTrigger, Lenis, Three.js, RULES, TASK, COMMIT, localhost). More "Suggest for me". Shows example sites for every taste question. Fewer technical toggles |
| **Agency person** | Speed, client-ready artifacts, repeatability, multiple clients | Condensed interview mode. Can import a client's brief or brand guide and skip to gaps. Exports a client-presentable PRD and brand kit PDF. Workspace with multiple site projects |
| **Web designer / developer** | Control, technical depth, override power | Exposes framework choice, library choices, motion IDs (A1–H3 from `research/04`), effort routing, prompt editing, and raw spec files |

**Calibration questions (start of Don't Panic, module 0):**
1. "Have you built a website before? What did you use (Wix/Squarespace/Webflow/Framer/WordPress/code/never)?" Ask for URLs of prior sites. The app crawls them (§7) and uses them as both an assets source and a taste signal ("what do you hate about your current site?").
2. "On a scale of *towel-less hitchhiker* to *Slartibartfast*, how comfortable are you with web stuff?" Offer 4 choices mapped to beginner / intermediate / pro / developer.
3. "Are you building this for yourself or for a client?" (Agency mode.)
4. "Do you already have brand stuff (logo, colors, fonts, a guide)?" This routes to fast-path brand import.

**Detection is continuous.** If the user uses technical vocabulary ("SSR", "R3F", "INP"), upgrade the level silently and stop explaining basics. If they ask "what's that?" twice, downgrade. Store the result in `PROJECT.md › User profile` (mirrors GSD's `user-profile.md` template, `vendor/gsd-core/gsd-core/templates/user-profile.md`).

---

## 4. Product form: command set, companion app, dashboard, voice

Matt Q2/Q25/Q29: a GSD-style command set inside Grok Build, easy to use; CLI is fine, or a simple Grok-Bot-like app for websites; a dashboard if possible; runs locally; cloud later.

**Three surfaces sharing one engine and one on-disk state (`.hitchhiker/`):**

1. **Grok Build plugin (primary, v1).** Installed into a project as `.grok/` (skills, agents, hooks, rules) plus commands. Grok Build loads `.grok/skills/*/SKILL.md`, `.grok/agents/`, `.grok/hooks/*.json`, `.grok/rules/*.md` and AGENTS.md, and reads Claude Code assets too (`research/01`, `research/10`). The user types `/hh-dont-panic` and so on (§18.1).
2. **Companion app ("the Guide app", v1 if feasible, otherwise v1.1).** A simple local web app (`npx hitchhikers-guide` → `localhost`) that looks like a chat (Grok-Bot-like): a push-to-talk mic button, drag-and-drop uploads, clickable example-site cards, a progress map, approval buttons. It talks to Grok Build through **ACP** (`grok agent stdio`, JSON-RPC: `initialize` → `authenticate` → `session/new` → `session/prompt`, with streamed `session/update` chunks). Source: `sources/xai/cli_headless-scripting.md`.
3. **Dashboard (same local app, separate route).** Phases and slices progress, prompt queue with status, reviewer reports with screenshots, watchdog log, Lighthouse scores, cost meter (Imagine spend), and buttons for "pause", "approve", "elevate" and "deploy".

**Voice (Matt Q2, Q8, Q31):** push-to-talk, and the user can talk the whole way through. **The interviewer replies in text only (no TTS)** to save tokens.
- **Default: local, free** speech recognition with **whisper.cpp** (MIT; Metal/Core ML on Apple Silicon, Vulkan, WebAssembly build), so users don't burn credits. Model `base.en` or `small` by default, `large-v3-turbo` optional.
- **Optional: Grok Voice / xAI STT**, which offers REST and WebSocket streaming, 12 audio formats and word timestamps. It costs $0.10/hr REST and $0.20/hr streaming (`research/11`, docs.x.ai/docs/model-capabilities/audio/speech-to-text). Matt prefers "the same tech as Grok voice if affordable". It's cheap, but it requires an xAI API key (billed separately from SuperGrok, *verify*). The settings toggle shows the cost.
- **Most cost-effective wins:** ship local Whisper as the default, with Grok STT as a one-click upgrade.

**Save and resume plus progress (Matt Q7, Q33):** `STATE.md` is the resume spine. The app shows a "Guide map" of done, in-progress, skipped and to-do items for every module. It gives progress updates throughout, with a **big reveal at the end** of each phase: brand-kit reveal and site reveal.

---

## 5. The six phases, slices and difficulty tiers

### 5.1 Phases (approved names, Matt Q35)

| # | Phase | Purpose | Main outputs | Gate to exit |
|---|---|---|---|---|
| 1 | **Don't Panic** | The interview (ridiculously long, skippable) | `INTERVIEW.md` (full transcript + structured answers), `SITE-BRIEF.md`, `PROJECT.md`, reference cards, uploads indexed | User approves the Site Brief ("what did I get wrong?" loop done) |
| 2 | **Babel Fish** | Brand: translate the user into a brand | `BRAND.md` (brand brain), `VOICE.md`, logo SVG set, palette and type tokens, imagery guide, collateral graded and upscaled, brand-kit PDF/HTML | User approves the brand kit and voice guide (approve/reject per item) |
| 3 | **Deep Thought** | Planning: PRD, requirements, roadmap, the context doc, the prompt package | `PRD.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `MOTION.md`, `VISUAL-DIRECTION.md`, `SECTION-PLAN.md`, `ASSETS.md`, `RULES.md`, `CONTEXT.md` (the massive context document), `prompts/NNN-*.md` (50–150) | User approves the PRD, context doc and prompt list (Matt Q10) |
| 4 | **Improbability Drive** | Build: execute prompts in fresh sessions with a reviewer every 3 and a watchdog | Commits, `SUMMARY` per prompt, `reviews/NNN-REVIEW.md`, screenshots, watchdog log | All prompts done or explicitly deferred. No open BLOCKERs |
| 5 | **Mostly Harmless** | Review, QA, elevate | `QA-REPORT.md` (Lighthouse, axe, console, SEO, CWV), `UI-REVIEW.md`, brand sign-off, Elevate rounds | All gates in §12 pass. User signs off |
| 6 | **So Long and Thanks for All the Fish** | Launch | Deploy (Hostinger/Vercel/Netlify/Cloudflare), `DEPLOY.md`, analytics verified, sitemap submitted (instructions), launch kit (social posts, OG images), post-launch upgrade list | User approves deploy. Live URL is healthy |

**Follow-up questions at the start of each phase (Matt Q26).** Each phase begins with a short **"Before we jump"** interview generated from the previous phase's outputs: gaps, contradictions, ASSUMED items and new decisions the previous phase surfaced. Examples: in Deep Thought, "Your brand says *calm*, but you picked motion level 9. Want a calm 9 (slow camera, no flashes) or should we drop to 7?" In Mostly Harmless, "The 3D hero costs 1.1 s of LCP on mobile. Keep it desktop-only with a still on phones?" Generate 3–8 questions, all skippable.

### 5.2 Slices (fun names instead of "epics/slices")

GSD's hierarchy is milestone → phase → plan → task. Ours is **Phase → Slice → Prompt**. Slices get Hitchhiker's names. The table below is the default slice catalog. Deep Thought picks and orders the slices per site, and Grok may add more.

| Phase | Slice (fun name) | What it is |
|---|---|---|
| Don't Panic | **Towel Check** | Calibration: experience, prior sites, uploads |
| | **Ford's Field Notes** | Brand and assets questions (Miro branch 1) |
| | **The Question** | Positioning and intent, goals, KPIs (Miro branch 2) |
| | **Vogon Neighbors** | Competitors and SEO landscape |
| | **Point-of-View Gun** | Taste: reference sites, Godly/Awwwards walkthrough |
| | **Pan Galactic Gargle Blaster** | Motion appetite, 3D options, movie / choose-your-own-adventure |
| | **Bistromathics** | Budget: Imagine spend, 3D gen spend, deadline, hosting |
| | **Guide Entry** | Writing the Site Brief + "what did I get wrong?" |
| Babel Fish | **Deep Why** | Golden Circle, origin story |
| | **Heart of Gold** | Archetype, positioning, ideal customer, story |
| | **Sens-O-Matic** | Palette, type, imagery |
| | **Magrathean Logo Works** | Logo concepts via Imagine → clean SVG → export set |
| | **Babel Voice** | Voice guide, slogans, banned words, tagline |
| | **Hyperspace Bypass** | Collateral grading, upscale, replace weak images |
| | **The Brand Brain** | Compile BRAND.md + VOICE.md + kit reveal |
| Deep Thought | **Seven and a Half Million Years** | PRD + requirements |
| | **The Ultimate Question** | KPI map, site type, conversion architecture |
| | **Earth Mk II Blueprints** | Section plan + visual direction + motion spec |
| | **Infinite Monkeys** | Writing the prompt package |
| Improbability Drive | **Vogon Constructor Fleet** | Setup, scaffold, backup, tokens, fonts |
| | **Heart of Gold** | Hero and nav |
| | **Milliways Menu** | Sections and pages with real copy |
| | **Somebody Else's Problem Field** | Integrations: forms, email, Stripe, booking, CMS, analytics |
| | **Pan Galactic Gargle Blaster** | Motion: Lenis, reveals, scroll video, transitions |
| | **Magrathea** | 3D world-building (motion level ≥ 8) |
| | **Sub-Etha Signal** | SEO, blog, schema, performance and media |
| Mostly Harmless | **Nutrimatic Test** | Anti-slop audit ("almost, but not quite, entirely unlike a real site?") |
| | **Total Perspective Vortex** | Full-site jury review + gates |
| | **Slartibartfast's Fjords** | Elevate passes: details, type, motion, imagery, copy |
| So Long… | **Milliways at the End** | Deploy + DNS + analytics verify |
| | **Share and Enjoy** | Launch kit, social posts, handoff, post-launch upgrade list |

Agent nicknames in the UI:
- **Marvin**: the watchdog (paranoid android, sees every error).
- **Zaphod**: the reviewer (two heads means two viewports, desktop and mobile).
- **Eddie**: the orchestrator ("shipboard computer", relentlessly cheerful progress updates).
- **Deep Thought**: the planner.
- **The Guide**: the interviewer.

### 5.3 Prompt difficulty tiers (funny names, effort routing; Matt Q39–40)

| Tier | Name | Typical work | Default model and effort |
|---|---|---|---|
| 1 | **Towel** | File moves, config, credits entries, copy placement, simple fixes | grok-4.7 `medium` (or Grok 4.7 Fast if the user prefers speed) |
| 2 | **Cup of Tea** ("almost, but not quite, entirely unlike tea") | Simple sections, nav, forms, SEO tags | grok-4.7 `medium` |
| 3 | **Gargle Blaster** | Motion systems, reveals, Lenis wiring, transitions, integrations | grok-4.7 `high` |
| 4 | **Heart of Gold** | Scroll video, 3D scenes, shader work, complex responsive layouts, refactors | grok-4.7 `high` or `xhigh` |
| 5 | **Forty-Two** | PRD, specs, prompt package writing, final once-over, Elevate, architectural decisions | grok-4.7 `xhigh` |

Grok 4.7 supports reasoning efforts `low`, `medium`, `high` and `xhigh` (default `high`) per docs.x.ai/docs/models/grok-4.7, and Grok Build exposes `--effort <LEVEL>` and `-m <MODEL>` (`sources/xai/cli_reference.md`). Matt's rule: "always recommend high effort for build, Grok 4.7 for planning and finishing passes" (Q25), and "easy = medium, hard = high/xhigh" (Q39). The user can override the model or effort globally or per prompt.

---

## 6. The interviewer persona ("The Guide")

**Matt Q8:** "funny, artsy, creative, friendly, a bit autistic and fun; pushes back on vague answers". It "can be pushy and funny" (Q11). Text replies only.

**Character sheet:**
- **Funny**: dry, British-flavored absurdism (Hitchhiker's homage), never mean. One joke per 3–4 messages at most. Never joke when the user is stressed or confused.
- **Artsy and creative**: talks about light, rhythm, tension and negative space. Gets visibly excited about good typography and specific references ("Oh, the way Pangram Pangram's type *breathes*").
- **"A bit autistic"**: portray this as a respectful neurodivergent strength, not a stereotype. Literal precision ("When you say 'modern', do you mean 2026-modern, mid-century-modern or *Tron*-modern?"), pattern-noticing ("You've said 'calm' four times and sent me three neon sites. Let's talk about that."), deep special interests (kerning, easing curves, the 60-30-10 rule), occasional delightful info-dumps (capped at 3 sentences, with an offer to say more), honest directness, a love of lists and systems.
- **Friendly and pushy**: it pushes back on vague answers *every time* (Matt's prompts: "Push back if an answer is vague"). It holds the line twice, then accepts the answer and marks it `SOFT`.
- **Kind about skipping**: "Skipping is allowed. Towels are optional, technically."

**Behavior rules:**
1. **One question at a time.** Wait for the answer (Matt's Prompts 01/02). Batch only trivial yes/no items, and only when the user asks for speed.
2. **Every question card has three buttons:** `Answer` · `Suggest for me` · `Skip`. Voice users say "suggest" or "skip".
3. **"Suggest for me" behavior:** propose 2–4 concrete options, *grounded in what's known so far* (uploads, previous answers, crawled sites, industry), each with a one-line why. For taste questions, show **real example sites as clickable links: 2 from Godly + 2 from Awwwards** (Matt Q9), then walk through them ("Look at how the headline reveals line by line on scroll. That's SplitText. Love it or hate it?"). Record the choice and the reason.
4. **Pushback triggers:** answers that are empty adjectives ("modern", "clean", "professional", "unique", "high-end"), everything-at-once ("everyone is my customer"), contradictions with earlier answers or uploads, unrealistic combinations (motion 10 + 3-day deadline + phone-only audience), or claims that would be illegal or unverifiable on the site (testimonials or numbers that don't exist). The pushback quotes their words back and offers a sharper choice.
5. **Mirror and confirm.** Every ~8 questions, give a 3-line summary: "Here's what I think I heard…". At module end, show the structured fields it filled.
6. **Never lecture.** Explanations stay at ≤2 sentences for beginners and are skipped for pros.
7. **Language:** reply in the user's language when they speak another one (Whisper detects the language; the content locale goes into PROJECT.md).
8. **"Happy with this?"** Always ask that about provided assets, and offer to elevate (Matt Q11).
9. **Banned-words discipline applies to the Guide itself** (§14.3). It never says "delve", "elevate your brand", "unlock" and so on. ("Elevate" is fine only as the product feature name.)

**Sample voice:**
> **The Guide:** Right. Three words for how the site should *feel*. Not what it does. Feels. (If you say "clean", I will gently lie down on the floor.)
> **User:** Clean, modern, premium.
> **The Guide:** I'm on the floor. Let's sharpen it: is *premium* more **Aesop** (quiet, apothecary, warm paper) or more **Porsche** (engineered, glossy, fast)? Or tap *Suggest for me* and I'll pull four real sites.

---

## 7. Inputs accepted and the ingestion pipeline

Matt Q32: PDFs, screenshots, website URLs (crawl), images, Pinterest boards, competitor URLs. Plus voice, text, existing brand guides, an X account (optional) and prior websites.

| Input | Ingestion | Lands in |
|---|---|---|
| Voice | Push-to-talk → whisper.cpp (default) or xAI STT → text → same pipeline as typed text | `INTERVIEW.md` |
| Text / pasted docs | Direct | `INTERVIEW.md`, `uploads/index.json` |
| **PDFs** (brand guides, decks, menus, price lists) | `pdftotext -layout` + page images for visual pages; Grok summarizes into structured fields | `uploads/` + `BRAND.md` candidates |
| **Images / screenshots** | Grok 4.7 image input ("text, image → text"). Palette extraction (k-means), quality grading (§9.6), EXIF stripped | `uploads/`, `ASSETS.md` |
| **Website URLs** (own/prior/reference) | Playwright crawler: desktop and mobile screenshots, full text, computed fonts and colors, detected stack (`window.gsap`, `THREE`, Lenis classes, `__NEXT_DATA__`, Webflow), sitemap pages up to N | Reference cards `references/*.md` |
| **Competitor URLs** | Same crawler + SEO extract (title, meta, H1–H3, schema types, word count, internal links, blog presence) | `research/COMPETITORS.md` |
| **Pinterest boards** | Public board → Playwright scroll capture (no reliable public API), or ask for a screenshot/export | Mood folder |
| **Existing brand guide** | Parse into BRAND.md / VOICE.md fields; ask "happy with this?" for each | `BRAND.md` (source = imported) |
| **X account** (optional) | OAuth 2.0 PKCE, read-only bio, avatar, banner and recent posts → voice samples and imagery (`research/11`) | `VOICE.md` samples |
| Files (logos, fonts, video, 3D) | Type detection. Fonts are license-checked. GLBs are validated with gltf-transform | `public/` staging, `ASSETS.md` |

Crawl politely (robots.txt, rate limits, user-agent identification) and store *principles* rather than copying assets (`research/05`).

---

## 8. Phase 1, Don't Panic: the full interview tree

### 8.1 Miro skeleton: verbatim transcription (Matt's board, source of truth for structure)

Source images: `context/miro/01-brand-assets.png`, `02-positioning-intent.png`, `03-interviews.png`. Spelling is kept as on the board.

**Board 1: root "1- Do you understand your brand and have assets"**
| Branch | Question box | Follow-up box |
|---|---|---|
| 1.1- logo | "Do you have one? If not, build one wit Grok imagine. Are you happy with your logo? Do you want suggestions?" | |
| 1.2- Color preferences | "Have yous tudid the color psychology? What colors do you want and what do they symobolize in branding" | |
| 1.3- Slogans | "Do you have one? Do you want suggestions" | |
| 1.4- mood board of images | "What images or backgrounds resonate with you visually? Why? How do they resonate emotionally?" | |
| 1.5- Font? | "Do you have fonts? Do you have any in mind? Any ideas on what kind of font you would like?" | "HIf the user doesn't know, then they can provide screenshots of fonts they like, or grok can send them examples of fonts and combinations that might be great" |
| 1.5- Brand Voice | "How does your company speak to people? If it was person or an animal? What would it be?" | "What brands voices do you like? Suggest 5 to ten brands who you think speak to your clients really well." |
| 1.6- the why? Why did you build the brand and the origin story. | "Do you understand you why?" | "Help the builder determine the why using the simon sinek principles" |
| 1.7 - other brands that are like you and competitors | "it should ask for other brands that are like yours and other brands that you like that may be unrelated" | |

**Board 2: root "Brand positioning and intent"**
| Branch | Box 2 | Box 3 | Box 4 |
|---|---|---|---|
| "why are you building this website?" | "What do you hope to accomplish?" | "calls for sales? Should it have a sales funnel? Should it have reservations? What is the key outcome and key performance indicators you're looking to" | "there should be a process to help you figure this out" |
| "what tools do you need?" | "email intake form?" | | |
| | "sell products on your site?" | "if you don't know how to do this the editor should also help you chose the right tools based on questions." | |
| | "Other features? What are you incorporating? ex - MLS listings as realtor... Will it have blockchain? Do you need visualizations tools? Editors? Any special tooling that you'll want to incorperate?" | "it should provide suggestions for features for you based on what you want to build" | |
| | "Video? Media? portfolios?" | | |
| "Who are your main competitors?" | "Input competitors sites?" (arrow continues to the "interviews" node on board 3) | | |

**Board 3: "interviews"**
- "interviews" → "interviews" (big box) → **"PROMPT 01 · INTERVIEW ME ABOUT THE SITE"** (Matt's prompt, as shown on the board):
  > You are a senior web designer and art director who has built sites that won Awwwards Site of the Day. Interview me to plan a website. Read my brand brain first: [paste it or attach it].
  > Ask me one question at a time. Wait for my answer before the next one. Push back if an answer is vague. Cover:
  > 1. What the site is for, in one sentence, and the one action a visitor should take.
  > 2. Who the visitor is: a specific person, what they want, what they're afraid of, what device they're on.
  > 3. The offer: what I sell or give away, and why anyone should care.
  > 4. The pages and sections I think I need (you'll fix this list later).
  > 5. The vibe in three words, and three words it must never feel like.
  > 6. Three to five reference sites I love (Awwwards, Godly, anything) and exactly what I love about each.
  > 7. What I already have: logo, photos, video, copy, fonts, an old site.
  > 8. What must never change (an existing page, a video, legal wording).
  > 9. Motion appetite from 1 to 10: 1 is a calm brochure, 10 is a 3D scroll movie.
  > 10. Hard limits: deadline, budget, hosting, things I legally can't say.
  > When you have enough, write a one-page Site Brief: goal, visitor, offer, vibe, references and what to steal from each (the thinking, not the look), what exists, what's protected, motion level, limits. Then ask me what you got wrong.
- "Input some sites you really like" → "if the client doesn't know, have them visit the top sites like aura.build, godly, awwwards and deliver ten sites they like and ask them why they like them"

**How the board maps to modules below:** Board 1 maps to Module 1 (Ford's Field Notes) and seeds Babel Fish. Board 2 maps to Modules 2, 3 and 4 (The Question, tools, Vogon Neighbors). Board 3 maps to Module 5 (Point-of-View Gun, taste), with Prompt 01's ten topics distributed across Modules 2–9. Module 0 (calibration), Module 6 (motion and 3D), Module 7 (budget), Module 8 (SEO and content) and Module 9 (limits) come from Matt's 40 answers.

### 8.2 Question schema (every question is data)

Each question lives in `interview/tree.yaml` (or `.json`) so the interview is data-driven, testable and editable:

```yaml
- id: DP-1.1
  module: ford-field-notes
  ask: "Do you have a logo you love? Drop it here, or tell me about it."
  why: "The logo anchors color, type and tone. If it's weak, everything leans on it."
  input: [upload, text, voice]
  levels: { beginner: explain, pro: terse }
  skip_default: "Generate logo concepts in Babel Fish (Magrathean Logo Works)."
  suggest: "Offer 3 logo directions based on archetype + industry; show 2 Godly + 2 Awwwards examples of logo-led brand sites."
  pushback_if: ["answer is 'it's fine'", "logo is raster-only < 512px"]
  follow_ups: [DP-1.1a "Are you happy with it?", DP-1.1b "Want me to elevate it?"]
  writes: [BRAND.md#logo, ASSETS.md#logo]
  required_for: [babel-fish.logo]
```

The engine tracks a **coverage map** (answered / suggested / skipped→ASSUMED / soft) per field. That coverage feeds the Guide map UI and the PRD's "Assumptions" section.

### 8.3 The tree (every question; ✱ = high-value, the Guide pushes harder; all skippable)

**Module 0: Towel Check (calibration)** · 3–6 min
- DP-0.1 "Hi. I'm the Guide. Don't panic. Before anything: is this site for you, or for a client?" (agency mode)
- DP-0.2 "Have you built websites before? With what? Drop any URLs, including the old embarrassing ones." → crawl (§7)
- DP-0.2a (if a prior site exists) "What do you love about it, and what makes you wince?"
- DP-0.3 "How comfy are you with web stuff? 🧣 towel-less · 🗺️ I've used Wix · 🛠️ I design/build sites · 🧠 I write code" → level
- DP-0.4 "Got brand stuff already: logo, colors, fonts, a guide, photos? Drop everything you've got. PDFs, screenshots and links all work." → fast-path flags
- DP-0.5 "Want to connect your X account so I can learn your voice from your posts? Optional, read-only." (§16)
- DP-0.6 "How do you want to talk to me: hold the mic button, or type?" (sets the voice default)
- DP-0.7 "Roughly how much time do you have today? The full interview is long and can be saved and resumed anytime."

**Module 1: Ford's Field Notes (brand and assets; Miro board 1)** · skip the whole module if a brand guide is imported. Then ask only "happy with this?" for each item.
- DP-1.1 ✱ Logo: "Do you have one?" (upload) → "Are you happy with it?" → "Want suggestions or an elevated version?" If none: "Shall I make one with Grok Imagine in the brand phase?"
- DP-1.2 ✱ Color: "Do you know which colors you want? Have you looked at color psychology at all?" → "What should each color *mean* for your brand?" Suggest: 3 palettes from mood/industry/competitors, with honest caveats ("color research is mixed; standing out from competitors matters more", Matt's brand guide).
- DP-1.3 Slogan: "Got a slogan or tagline?" → "Want suggestions?" (Babel Voice generates 30 across 6 styles; Matt Prompt 15.)
- DP-1.4 ✱ Mood board: "What images or backgrounds hit you visually? Drop them, or a Pinterest board." → "Why that one? How does it make you *feel*?" (asked per image, capped at 5; Matt's guide recommends collecting 30–60 items over time).
- DP-1.5 Fonts: "Do you have fonts? Any in mind? What kind of letters feel like you?" If unsure: "Send screenshots of type you like," or the Guide shows 6 pairings with live previews (Bebas Neue + Barlow, Space Grotesk + Inter, DM Serif Display + DM Sans, Fraunces + Work Sans, Archivo Black + Archivo, Clash Display + Satoshi; Matt's brand guide) using the user's own headline.
- DP-1.6 ✱ Voice: "How does your company talk to people? If it were a person or an animal, what would it be?" → "Which brands' voices do you like?" Suggest: 5–10 brands that speak well to *their* customers (Miro). Optional NN/g sliders: funny↔serious, formal↔casual, respectful↔irreverent, enthusiastic↔matter-of-fact.
- DP-1.7 ✱ Why: "Why did you build this? What's the origin story?" → "Do you know your why?" If not, run the **Why Finder** (Matt Prompt 01, Sinek Golden Circle: 12+ questions one at a time, output "To [contribution] so that [impact]") here or defer it to Babel Fish.
- DP-1.8 Kindred brands: "Which brands are like yours? And which unrelated brands do you just love?" (Miro 1.7; feeds Matt Prompt 05 "Reverse-engineer a brand you love").
- DP-1.9 Existing assets inventory: photos, video, copy, testimonials (real only), certifications, press. "What must never change?" (protected list; Prompt 01 #8)

**Module 2: The Question (positioning and intent; Miro board 2, top branch)**
- DP-2.1 ✱ "Why are you building this website, in one sentence?" (pushback on "to have an online presence")
- DP-2.2 ✱ "What do you hope it accomplishes? What's the *one* action a visitor should take?"
- DP-2.3 ✱ **Site type, multi-select** (Matt Q16, "multiple types allowed"):

| Type | Primary KPI | Tracking events | Knowledge pack switched on |
|---|---|---|---|
| Sales / e-commerce | Revenue, conversion rate, AOV | `view_item`, `add_to_cart`, `checkout_start`, `purchase` | **Sales psychology** + UX/conversion |
| Sales funnel (single offer) | Opt-in → purchase rate | `optin`, `checkout_start`, `purchase` | Sales psychology (funnel templates) |
| Calls / leads | Qualified leads per week | `cta_click`, `form_submit`, `call_click` | Sales psychology (lead), copywriting |
| Reservations / bookings | Bookings | `booking_start`, `booking_complete` | UX/conversion |
| Sign-ups / newsletter / waitlist | Subscribers | `signup` | Copywriting |
| Portfolio / art / showcase | Inquiries, time on site, shares | `project_view`, `contact` | Motion, typography |
| Content / blog / media | Organic traffic, returning readers | `article_read_75`, `subscribe` | SEO |
| Local business | Calls, directions, visits | `call_click`, `directions_click` | SEO (local), schema |
| Event / launch | Registrations | `register` | Copywriting, motion |
| Personal brand / creator | Followers, bookings, sales | `social_click`, `booking` | Voice |
| Nonprofit / donations | Donations | `donate_start`, `donate_complete` | Sales psychology (ethical) |
| Recruiting / careers | Applications | `apply_click` | UX |
| Investor / fundraising | Deck requests | `deck_request` | Copywriting |
| App / product download | Installs | `store_click` | UX/conversion |

- DP-2.4 ✱ "What's the key outcome and the KPIs? How many [leads/bookings/sales] a month would make you happy?" If they don't know: "there should be a process to help you figure this out" (Miro). The Guide runs a 4-question KPI helper (current numbers → goal → visitors needed at a typical conversion range → which page carries it), states that typical ranges are *assumptions*, and writes `KPIS.md`.
- DP-2.5 "Should it be a funnel (one offer, one path), a brand experience (story, world, wow) or a hybrid?" Explain the trade-off in 2 lines (`research/08` §1).
- DP-2.6 ✱ Visitor: "Who's the visitor? One specific person: what they want, what they fear, what device they're on." (Prompt 01 #2)
- DP-2.7 ✱ Offer: "What do you sell or give away, and why should anyone care?" (Prompt 01 #3)
- DP-2.8 Pages: "Which pages and sections do you think you need? I'll fix this list later." (Prompt 01 #4)

**Module 3: Tools and features (Miro board 2, middle branch; Matt Q23: all out of the box)**
- DP-3.1 "Email intake / contact form?" (default yes) → fields, where submissions go
- DP-3.2 "Sell products on the site?" → how many, physical or digital, subscriptions? If unsure, "the editor should also help you choose the right tools based on questions" (Miro): Stripe Payment Links vs Shopify Buy Button vs a full store (§16)
- DP-3.3 "Bookings, reservations or calls?" → Cal.com / Calendly / restaurant widget
- DP-3.4 "Newsletter?" → platform choice (Kit, Mailchimp, MailerLite, Beehiiv, Brevo, Klaviyo, Hostinger Reach; Matt's email guide)
- DP-3.5 "Blog / CMS? Do you want to edit content yourself later?" → content collections vs Keystatic vs Sanity
- DP-3.6 "Video, media, portfolios?" (Miro)
- DP-3.7 ✱ "Other special features? For example MLS listings if you're a realtor, blockchain, visualization tools, editors, configurators, maps, member areas…" (Miro). "Suggest for me" proposes features based on type and industry (Miro: "it should provide suggestions for features for you based on what you want to build"). Anything non-standard triggers **auto-discovery** of APIs and MCP servers (§16.4), with an approval gate.
- DP-3.8 Analytics: "Privacy-friendly analytics with no cookie banner (Plausible/Umami), or Google Analytics?"
- DP-3.9 Languages / locales?

**Module 4: Vogon Neighbors (competitors and SEO; Miro board 2, bottom branch; Matt Q18)**
- DP-4.1 ✱ "Who are your main competitors?" → "Drop their sites." → crawl + teardown (Matt Prompt 03: positioning, audience, visual identity, voice, weaknesses, complaints → "sea of sameness" + 3 white spaces)
- DP-4.2 "What do they do well that you secretly envy? What's boring about them?"
- DP-4.3 "Do you want a blog?" → "Want me to write keyword-based posts for you?" → seed keywords (from crawl + industry) → "Should we go after keywords your competitors rank for?" (competitor-based SEO; use the SEO knowledge pack and any user-supplied keyword tool exports; no invented search volumes)
- DP-4.4 "Where are your customers? Local city, country, worldwide?" (local SEO, schema `LocalBusiness`)
- DP-4.5 "Any AI-search goals, like being cited by Grok, ChatGPT or Perplexity?" (structured data, clear entity facts, FAQ; Matt's masterclass step 2 mentions "Google SEO plus AI search")

**Module 5: Point-of-View Gun (taste; Miro board 3)**
- DP-5.1 ✱ "Three to five sites you love (any industry) and *exactly* what you love about each: type, scroll, layout, color, motion, menu?" (Prompt 01 #6. Matt's masterclass: "Pick 3 to 5 sites. Not 20.")
- DP-5.2 If they don't know (Miro: "have them visit the top sites like aura.build, godly, awwwards and deliver ten sites they like and ask them why they like them"):
  - **Guided gallery walk:** the Guide picks a style world from answers so far and presents **2 Godly + 2 Awwwards** cards per round (Matt Q9). Each card shows a screenshot, link and one-line "look at…" note. The user says love / meh / hate and why. Repeat until ~10 liked sites, then narrow to 3–5.
  - Source pages: [godly.website](https://godly.website) (item URLs look like `/i/<id>-<slug>`; listings are client-rendered, so use Playwright), [Awwwards Sites of the Day](https://www.awwwards.com/websites/sites_of_the_day/), tag pages such as [three-js](https://www.awwwards.com/websites/three-js/), [3d](https://www.awwwards.com/websites/3d/), [storytelling](https://www.awwwards.com/websites/storytelling/), [scrolling](https://www.awwwards.com/websites/scrolling/), [e-commerce](https://www.awwwards.com/websites/e-commerce/), [portfolio](https://www.awwwards.com/websites/portfolio/), [restaurant-hotel](https://www.awwwards.com/websites/restaurant-hotel/), plus [aura.build](https://www.aura.build), [Lapa Ninja](https://www.lapa.ninja), [SiteInspire](https://www.siteinspire.com) and [Codrops demos](https://tympanus.net/codrops/demos/). Style-world deep links are in `research/05` §How the app should use galleries.
  - **Industry-curated award shortlists** ship in the knowledge pack (§17) so the walk works offline. Live fetching refreshes them, with caching and rate limits.
- DP-5.3 ✱ "The vibe in three words, and three words it must *never* feel like." (Prompt 01 #5; pushback on empty adjectives)
- DP-5.4 Visual interview (Matt *Websites on Autopilot* Prompt 24, 8 topics), ending with ✱ **"What's the signature moment, the one thing people will screenshot?"**
- DP-5.5 Light, darkness, texture: "Dark and moody, bright and airy, or paper and ink?" (shown as 3 thumbnails)
- DP-5.6 Photography vs illustration vs 3D vs type-only.

**Module 6: Pan Galactic Gargle Blaster (motion and 3D; Matt Q17, Q19)**
- DP-6.1 ✱ **Motion types explained, then chosen.** The Guide walks through motion families in plain words, each with a tiny looping preview (from the shipped motion pack) and 1–2 real links:

| Family (IDs in `research/04`) | Plain words | Example links |
|---|---|---|
| Smooth scroll + reveals (A1, A2) | "Scrolling feels weighted; things glide in" | [lenis.darkroom.engineering](https://lenis.darkroom.engineering), [pangrampangram.com](https://pangrampangram.com/) |
| Text animation (B1–B5) | "Headlines rise line by line, scramble or warp" | [synchronized.studio](https://synchronized.studio/) |
| Pinned storytelling (A3, A4) | "The page holds still while a story plays as you scroll" | [Awwwards storytelling](https://www.awwwards.com/websites/storytelling/) |
| Scroll-scrubbed video (A6, A7) | "A film that plays forwards and backwards with your scroll" | [apple.com/airpods-pro](https://www.apple.com/airpods-pro/) |
| Page transitions (C1, C2) | "Pages melt into each other instead of blinking" | [dogstudio.co](https://dogstudio.co) |
| Pointer and micro-interactions (D1, D3–D6) | "Things react to your cursor or touch" (**magnetic buttons are banned**, §14) | [cuberto.com](https://cuberto.com) |
| Vector / Lottie / Rive (E1–E5) | "Drawn lines and illustrations that move" | [rive.app](https://rive.app/) |
| Shader / WebGL backgrounds (F1, F5) | "Living gradients, grain, glow" | [koox.co.uk](http://koox.co.uk/) |
| 3D objects and worlds (F2–F4, A8) | "A real 3D product or a whole world you move through" | [opalcamera.com/opal-tadpole](https://www.opalcamera.com/opal-tadpole), [lusion.co](https://lusion.co/), [igloo.inc](https://www.igloo.inc/), [bruno-simon.com](https://bruno-simon.com/) |
| Sound (H3) | "Optional ambience, off by default" | Matt's masterclass |

- DP-6.2 ✱ **Motion appetite 1–10** (Prompt 01 #9; full table in `research/04` Part 2): 1 calm brochure · 2 gentle · 3 polished · 4 editorial · 5 expressive · 6 cinematic lite (scroll video) · 7 cinematic · 8 3D accent · 9 3D-led · 10 3D scroll movie / world. Matt's rule of thumb: 1–4 reveals + smooth scroll; 5–7 add scroll video + transitions; 8–10 add 3D. A slider with live preview. The Guide checks the choice against the deadline, audience device and brand (calm brand + 10 → pushback).
- DP-6.3 **"Full movie" or "choose-your-own-adventure" sites** (Matt Q17): "Do you want the whole site to be one continuous film you scroll through, or a branching story where visitors pick paths?" Show examples (Igloo Inc's scroll movie, [Messenger](https://messenger.abeto.co)'s explorable world, [darknetflix.io](http://darknetflix.io) storytelling). Explain the cost: longer build, heavier assets, needs a strong mobile fallback, plus an SEO plan (crawlable text layer).
- DP-6.4 ✱ **3D options** (Matt Q19), explained with costs:
  (a) **None**;
  (b) **Pre-rendered stills / video** of 3D (fast and light);
  (c) **Free open-source GLBs** auto-pulled from Poly Haven, Kenney, Quaternius, ambientCG and Sketchfab CC (license checked, credited; `research/07`);
  (d) **Custom AI-generated 3D** via Tripo or Meshy APIs (credits, cleanup needed);
  (e) **Their own model** (upload GLB/FBX/OBJ);
  (f) **Commissioned / hand-modelled** (best, slow; the Guide writes the brief).
- DP-6.5 "Phone visitors: same experience lighter, or a calm version?" (default: calm phone version for every heavy effect)
- DP-6.6 "Anyone sensitive to motion in your audience?" (reduced-motion is always on regardless; this tunes intensity)

**Module 7: Bistromathics (budget for assets; Matt Q20)**
- DP-7.1 ✱ "Grok Imagine can make your hero images and background videos on your account. What's your comfort spend?" Options with what each buys (estimates from docs.x.ai/docs/models prices, `research/11`):
  - **$0, DIY**: the Guide writes every Imagine prompt (aspect ratio, light, "no text, no letters, no logos, no watermarks, no faces"). You generate them in the Grok app on your subscription and drop them back. It's cheaper, slightly slower and uses the same quality model family.
  - **~$1, Starter**: ≈10 stills (`grok-imagine-image-2.0`, $0.04) + 2 × 10 s clips (`video-1.5-lite`, $0.02/s) ≈ $0.80.
  - **~$5, Standard**: ≈30 stills ($1.20) + 4 × 10 s clips on `video-1.5` ($0.08/s) ≈ $4.40.
  - **~$15, Cinematic**: ≈60 quality stills ($0.05 → $3.00) + 12 × 10 s `video-1.5` clips ($9.60) ≈ $12.60, with headroom for retries.
  - Custom amount.

  The Guide always shows a pre-batch estimate and a running total, and stops at the cap.
- DP-7.2 "Custom 3D generation budget?" (Tripo/Meshy credits, only if 6.4d)
- DP-7.3 "Stock photos OK (Unsplash/Pexels), or only your own and AI images?"

**Module 8: Content and SEO depth (Matt Q15, Q18)**
- DP-8.1 "Do you have copy, or should I write it in your voice?" (default: written from VOICE.md, approve/reject)
- DP-8.2 Real proof: testimonials, reviews, numbers, logos of clients, press. **Only real ones.** Placeholders are marked TODO and never invented (NO SLOP rules).
- DP-8.3 Blog cadence and topics (if 4.3 = yes); keyword list approval.
- DP-8.4 Legal pages: privacy, terms, cookie needs, regulated claims (health, finance, real estate). "Things you legally can't say?" (Prompt 01 #10)

**Module 9: Limits and launch (Prompt 01 #10; Matt Q22)**
- DP-9.1 Deadline.
- DP-9.2 ✱ Hosting: "Where should it live? Hostinger (recommended), Vercel, Netlify, Cloudflare, or 'no idea'?" Plus domain owned? Registrar? Email on the domain?
- DP-9.3 Who maintains it after launch?
- DP-9.4 Accessibility requirements beyond WCAG AA?
- DP-9.5 Anything else the Guide should know? ("The Answer is 42, but what's the question you wish I'd asked?")

**Closing: Guide Entry**
- Write the one-page **Site Brief** (Prompt 01 format: goal, visitor, offer, vibe, references and what to steal from each (*the thinking, not the look*), what exists, what's protected, motion level, limits), plus coverage stats.
- Then **"What did I get wrong?"** Loop until approved.
- Show the Guide map: answered / suggested / assumed / skipped.

---

## 9. Phase 2, Babel Fish: brand kit, voice kit, logo, collateral

**Principle (Matt Q12–Q15):** build a *total mini brand kit + voice kit* unless the user provides their own. Every step is optional and skippable, and users can upload an existing guide. Always ask "happy with this?" and offer to elevate. Then feed the context into Grok 4.7 slowly and methodically.

**The app must fully understand and implement Matt's *Build a Brand From Scratch With AI*** (36 pp., 12 sections, 18 prompts; summarized in `research/08-brand-intake-frameworks.md` §2–4; PDF at `context/sources/build-a-brand-from-scratch-with-ai.pdf`, public at https://antihero.community/guides/build-a-brand-from-scratch-with-ai.pdf). The app is *independent*, so rewrite the prompts in our own words and structure, credit the guide as inspiration in the README and CREDITS, and don't ship Matt's text verbatim unless Matt grants that explicitly (he's the product owner, so ask; see §21).

### 9.1 "Before we jump" follow-ups
Generated from the Site Brief: contradictions (vibe vs references), missing why, a weak logo, competitor colors that clash with preferences.

### 9.2 Modules (each one: run, suggest, import or skip)
| Slice | Module | Based on (Matt's guide prompt #) | Output |
|---|---|---|---|
| Deep Why | Why Finder | 01 (Golden Circle) | `BRAND.md#why` "To [contribution] so that [impact]" + HOW + WHAT + belief lines + 120-word proof story |
| Deep Why | Discovery deep-dive (only for gaps) | 02 (5 rounds) | Brand Discovery Brief + "3 biggest risks" |
| Heart of Gold | Competitor teardown (from crawl) | 03 | `research/COMPETITORS.md`: sea of sameness, 3 white spaces |
| Heart of Gold | Mood folder analyzer | 04 | 3 visual directions with palettes and type classes |
| Heart of Gold | Reverse-engineer a loved brand (optional) | 05 | Steal-the-thinking notes |
| Heart of Gold | Archetype, positioning, ideal customer | 06 | 1 primary (+1 secondary) archetype; 3 positioning statements; persona; 3 non-customers |
| Heart of Gold | Brand story | 07 | 25/100/300-word stories + one-liner |
| Sens-O-Matic | Palette | 08 | 3 palettes, 60-30-10 roles, WCAG contrast (4.5:1 body / 3:1 large) |
| Sens-O-Matic | Type pairing | 09 | Display + body, sizes, line heights, licenses (Google Fonts / Fontshare) |
| Sens-O-Matic | Imagery style + backgrounds | 12 | Imagery rules + Imagine prompts |
| Magrathean Logo Works | 10-logo concept sheet → refinement → exports | 10, 11 | Logo SVG set (§9.4) |
| Babel Voice | Voice guide | 14 | `VOICE.md` |
| Babel Voice | Taglines / slogans | 15 | 30 in 6 styles → top 5 → pick |
| Babel Voice | Social templates (optional) | 13 | 5 templates (1080×1350, 1080×1080, 1080×1920) |
| The Brand Brain | Compiler | 17 | `BRAND.md` (<1,500 words, ends with instructions to the AI) + designed brand-kit HTML/PDF |
| (ongoing) | Brand Director review | 18 | Used by the Zaphod reviewer in every review cycle |
| (ongoing) | "Say it in my voice" | 16 | Copy helper used by build prompts |

### 9.3 Voice kit (`VOICE.md`), Matt Q15
Contents:
- 3 voice traits written as "this, not that" (for example Direct, not rude)
- NN/g tone positions
- vocabulary we use / never use, plus the **banned-words list** (§14.3)
- punctuation rules (no em dashes, no exclamation marks by default, per Matt's RULES)
- tone by situation: error, success, sales, apology
- **slogans and taglines**
- "how we talk about" our product, our customers, competitors, price and ourselves
- 5 before/after rewrites
- sample microcopy: buttons, form errors, empty states, 404

Each item is **approve/reject** in the UI. A post-build **copy refinement pass** runs at the end, in Mostly Harmless.

### 9.4 Logo: always via Grok Imagine → delivered as a clean SVG (Matt Q12)
Imagine generates raster images, not SVG, and Matt's guide warns that "image models are great at concepts and still bad at letters". The pipeline:
1. **Concept sheet**: 10 directions (2 wordmarks, 2 lettermarks, 2 symbols, 2 combos, 1 emblem, 1 wildcard; Matt Prompt 10) as text. The top 4 are rendered with `grok-imagine-image` (flat, vector-style, white background, no gradients) at about $0.02–0.05 each.
2. User picks one (or asks for remixes; Imagine editing accepts up to 5 reference images per `research/10` §7).
3. **Wordmark**: set the brand name in the chosen real font, convert text to paths with **opentype.js** (MIT), and kern by hand in code. Imagine letters are never traced.
4. **Symbol**: trace the chosen raster with **vtracer** (MIT; color + binary modes). Avoid potrace, which is GPL. Grok then cleans the SVG: removes stray nodes, snaps to a grid, unifies strokes, and sets the viewBox.
5. **Optimize** with **SVGO** (MIT).
6. **Tests** (Matt's guide): simple, memorable, works at 32 px and 16 px favicon, one-color, reversed (white), squint test, real mockups.
7. **Export set** (Matt's guide): master SVG, one-color black and white SVG, square profile, favicon 32/16 + `favicon.svg`, app icon 512, transparent PNG 4096/1024/512, print PDF. Naming: `[brand]-logo-[version]-[size].png`.
8. "Happy with this? Want me to elevate it?"

### 9.5 Brand kit deliverable
`brand/` folder containing:
- `BRAND.md` and `VOICE.md`
- `tokens.css` / `tokens.json` (colors with roles, type scale, spacing, radii, easing tokens from the motion personality)
- `logo/` (export set)
- `imagery/` (guide + approved images)
- `social/` (templates, optional)
- `brand-kit.html` (a designed one-pager, also printed to PDF)

This is a **big reveal** moment in the UI.

### 9.6 Collateral grading + auto-upscale ("No trash", Matt Q14)
Every user image is scored 1–10 with Grok 4.7 vision plus deterministic checks:

| Check | Method | Fail threshold (default) |
|---|---|---|
| Resolution | Pixel dimensions vs slot (hero ≥ 2560 px long edge, card ≥ 1280) | Below slot size |
| Sharpness | Laplacian variance (OpenCV / sharp) | Below calibrated threshold |
| Compression / noise | JPEG quality estimate, block artifacts | Visible artifacts |
| Exposure / color | Histogram clipping | > 2 % clipped |
| Brand fit | Grok compares against the imagery guide + palette | "Off-brand" |
| Composition | Calm space for text (where needed), subject placement | No text-safe area for hero |

**Actions:**
- Score < 7 and the issue is resolution or softness: **auto-upscale** locally with **Real-ESRGAN** (BSD-3-Clause code; check model-weight terms), then re-score.
- Still weak or off-brand: **propose a replacement**, either an Imagine regeneration with the same light and grade (cost shown) or stock (Unsplash/Pexels, license recorded).
- **Never silently replace** real people, real products, real places or real work (truthfulness). Ask first.
- Log every action in `ASSETS.md`.
- Avoid AGPL tools like Upscayl inside the shipped package (license compatibility with MIT distribution).

---

## 10. Phase 3, Deep Thought: spec files, PRD, context doc, framework choice, prompt package

### 10.1 Spec-file layout: copy gsd-core exactly, then add ours (Matt Q29)
gsd-core (MIT, v1.7.0; vendored at `vendor/gsd-core/`, templates in `vendor/gsd-core/gsd-core/templates/`) keeps state in `.planning/`:
- `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md` (the resume spine) and `config.json`
- `phases/NN-name/` holding `NN-CONTEXT.md`, `NN-RESEARCH.md`, `NN-MM-PLAN.md`, `NN-MM-SUMMARY.md`, `NN-VERIFICATION.md`, `NN-UI-SPEC.md` and `NN-UAT.md`
- `research/`, `quick/`, `spikes/`, `sketches/`, `todos/`, `debug/`

We mirror this one-for-one under **`.hitchhiker/`** (so we never collide with a user's own GSD install) and add the web-design layer:

```
.hitchhiker/
  PROJECT.md            # GSD template: what/why/who, user profile, constraints, key decisions
  REQUIREMENTS.md       # GSD template: REQ-IDs (v1 / v2 / out of scope), each traceable to prompts
  ROADMAP.md            # 6 phases → slices → prompt ranges, with status
  STATE.md              # resume spine: current phase/slice/prompt, last good commit, blockers, next action
  config.json           # model/effort defaults, budgets, gates, deploy target, voice engine
  INTERVIEW.md          # transcript + structured answers + coverage map
  SITE-BRIEF.md         # Prompt-01-style one-pager (approved)
  BRAND.md              # brand brain (constitution)
  VOICE.md              # voice kit
  MOTION.md             # appetite level, personality→easing tokens, per-section effect IDs, mobile + reduced-motion rules
  VISUAL-DIRECTION.md   # visual interview output, signature moment
  PRD.md                # product requirements for the site
  KPIS.md               # site types, KPIs, events, funnel
  SECTION-PLAN.md       # pages → sections → one job, one wow, copy draft, visual, protected flag
  ASSETS.md             # every asset: source, license, status, grade, slot
  RULES.md              # the RULES paragraph (repeated verbatim at top of every prompt) + NO SLOP
  CONTEXT.md            # the massive context document for the build (assembled, see §10.3)
  CREDITS.json          # borrowed code/fonts/models/textures
  references/           # reference cards (url, screenshots, liked aspects, detected stack)
  research/             # COMPETITORS.md, SEO.md, KEYWORDS.md, STACK-DECISION.md
  phases/
    01-dont-panic/ … 06-so-long/
      NN-CONTEXT.md       # phase follow-up Q&A ("Before we jump")
      prompts/NNN-<slug>.md   # build prompts (PLAN schema, §10.5)
      summaries/NNN-SUMMARY.md
      reviews/NNN-REVIEW.md   # every 3 prompts
      NN-VERIFICATION.md      # goal-backward phase verification
  qa/                   # lighthouse/, axe/, screenshots/{375,768,1440,1920}/, console.log
  logs/                 # watchdog.log, sessions.jsonl, costs.jsonl
```

### 10.2 PRD (`PRD.md`) template (site-level)
1. Summary (goal, one action, site types)
2. Users and personas (from the interview)
3. KPIs and tracking plan (KPIS.md)
4. Positioning and messaging hierarchy (from BRAND/VOICE)
5. Information architecture (pages, nav)
6. Section plan summary (one job + one wow each)
7. Functional requirements (REQ-IDs: forms, payments, booking, CMS, blog, analytics, integrations)
8. Content requirements (copy sources, real proof only, blog plan, keywords)
9. Visual and motion requirements (VISUAL-DIRECTION, MOTION level, signature moment)
10. 3D and media requirements (assets, budgets, fallbacks)
11. Non-functional requirements: performance (Lighthouse mobile ≥ 90; LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 at p75, per web.dev), a11y (WCAG 2.2 AA), SEO, privacy, browser support
12. Tech stack decision (with trade-offs, §15.2)
13. Deploy plan
14. Assumptions (every ASSUMED or SOFT field from the interview)
15. Out of scope / Version 2 list (Matt's Prompt 02 asks for a "Version 2" list)
16. Risks
17. Approval block

### 10.3 The "massive context document" (`CONTEXT.md`)
Assembled for the build agents: the brand brain, voice rules, RULES, stack decisions, motion spec, section plan, asset map, gate thresholds and protected list. It's sized to stay **≤ ~30k tokens** so it can be a cached prefix. Build prompts reference the sections they need with `@.hitchhiker/CONTEXT.md#motion` rather than including the whole thing. Large knowledge goes into skills (§17), not CONTEXT.md.

### 10.4 Framework choice (Matt Q21)
Deep Thought (xhigh) writes `research/STACK-DECISION.md`: the pick, why, alternatives, trade-offs and what would change the decision. The user can discuss and override. Default rules (`research/06-library-stack.md`):
- **Astro 7** (default): HTML-first, fast, islands, View Transitions, image pipeline. Best for brand, marketing, portfolio and content sites with motion levels 1–9.
- **Next.js 16**: app features (auth, dashboards, dynamic data), heavy React/R3F with a persistent canvas across routes, Vercel-native.
- **Vite + React**: single-page immersive 3D experiences (level 10 "world" sites).
- **SvelteKit**: offered if the user prefers it. It has a smaller 3D ecosystem (Threlte) and fewer agent training examples.
- E-commerce with inventory: Astro + Shopify Storefront or Buy Button, or Next.js Commerce (Rule 4 escalation).

### 10.5 The prompt package (50–150 prompts per site, Matt Q40)
**Generation (slice "Infinite Monkeys", xhigh):** Matt's meta-prompt approach (*Websites on Autopilot* Prompt 03), scaled up with GSD's PLAN schema. One RULES paragraph is repeated word for word at the top of every prompt. Each prompt does one job, is self-contained ("never write 'as before' or 'see above'"), names exact files, components and routes, and states what done looks like and what to report back. Elevated by default; NO SLOP embedded; credits in the same commit.

**Build order** (Matt): setup/backup → structure/nav → pages and sections (copy, no motion) → imagery → motion and effects → 3D → integrations → performance → SEO → credits → QA. Effects come last, with one wow per section.

**Prompt file format (`prompts/NNN-<slug>.md`):**
```markdown
---
id: 047
phase: improbability-drive
slice: pan-galactic-gargle-blaster
title: "Scroll-scrubbed hero video with WebP frame fallback"
tier: 4            # Heart of Gold
effort: high       # medium | high | xhigh
model: grok-4.7
depends_on: [012, 031]
files_modified: [src/components/HeroScrub.astro, src/scripts/scrub.ts, public/video/hero-scrub.mp4]
requirements: [REQ-MOT-03]
protected: [src/pages/index.astro#splash]
review_after: false   # true on every 3rd prompt and phase ends
max_turns: 60
---
<rules> (RULES paragraph verbatim, from .hitchhiker/RULES.md) </rules>
<objective> One sentence. </objective>
<read_first> @.hitchhiker/CONTEXT.md#motion @.hitchhiker/MOTION.md @src/scripts/motion.ts </read_first>
<task>
Exact instructions: values, sizes, eases, breakpoints, file names (concrete values, never "align X with Y").
Mobile version. Reduced-motion version. Performance budget.
</task>
<must_haves>
  truths: ["Hero video scrubs forward and backward with scroll on desktop", "On ≤768px a poster + 3-step crossfade replaces scrubbing", "prefers-reduced-motion shows the poster only"]
  artifacts: ["public/video/hero-scrub.mp4 encoded -g 1 -an, faststart, 1920w"]
  key_links: ["HeroScrub.astro imported in index.astro below the splash"]
  prohibitions: ["Do not modify the splash section", "No new dependencies"]
</must_haves>
<verify> npm run build; npx playwright test tests/hero-scrub.spec.ts; git diff --stat shows only files_modified </verify>
<report_back> ≤150-word SUMMARY: what changed, files, anything ASSUMED, what to check on localhost. </report_back>
<commit> "feat(hero): scroll-scrubbed video with mobile + reduced-motion fallbacks [047]" </commit>
```

**Tiering and phase grouping:** every prompt has a tier (§5.3). Prompts are grouped into the six phases. Most live in Improbability Drive, but Mostly Harmless and So Long… also have prompts (gates, Elevate passes, deploy). Golden templates for common prompts (Matt's Prompts 09–21: setup, hero, nav, section, Lenis, reveals, scroll video, transitions, 3D, glow, media/performance, credits, Playwright QA; `research/09` §3A) ship in the knowledge pack and are adapted, never written from scratch.

**Approval (Matt Q10):** the user approves the PRD, CONTEXT.md and the prompt list (titles, tiers, estimated time and cost) before Improbability Drive starts. Pros can open and edit any prompt.

---

## 11. Phase 4, Improbability Drive: the execution orchestrator ("Eddie")

Facts about Grok Build used here are documented in `research/10-agent-orchestration-qa.md` §1, with raw docs in `context/sources/xai/`.

### 11.1 Loop
```
preflight: git clean? backup branch `hh/backup-<date>` created; dev server up; baselines dir ready
for prompt in ROADMAP order (respect depends_on):
    ctx = RULES.md + prompt file + @read_first files        # no chained history, stable prefix first
    grok --no-auto-update -p "$ctx" -m <model> --effort <effort> \
         -s hh-<site>-<NNN>  --cwd <repo> --output-format streaming-json \
         --max-turns <max_turns> [--always-approve within sandbox profile]
    Marvin (watchdog) watches: event stream, hooks, dev-server log, exit code
    post: verify one commit exists for NNN; run prompt's <verify>; git show --stat HEAD vs files_modified/protected
    write summaries/NNN-SUMMARY.md (from report_back); update STATE.md
    if review_after or NNN % 3 == 0: Zaphod review (11.3)
end → Mostly Harmless
```
- **Fresh session per prompt** (Matt Q39), named `hh-<site>-<NNN>` so it can be resumed for fixes (`-s`/`-r`).
- **Effort routing per prompt** (§5.3): tiers 1–2 run at `medium`, tier 3 at `high`, tier 4 at `high`/`xhigh`, tier 5 at `xhigh`. On a retry after a failure, bump one level.
- **Parallelism:** off by default. Grok Build supports worktrees (`-w`), so independent prompts in the same wave (GSD's wave concept) *may* run in parallel worktrees in v2.
- **Interactive alternative:** the user can run the same queue inside an interactive Grok Build session, using the plugin's `/hh-drive` command plus `/loop` and monitors (`/loop` minimum interval 60 s, expires after 7 days, ≤ 50 active). Headless is the default because it guarantees fresh context.
- **Permissions:** run with a `--sandbox` profile and deny rules (no `git push --force`, no `rm -rf` outside the repo, no deploy, no network installs without the legitimacy check). Hooks fail open, so the orchestrator re-checks git state itself.

### 11.2 Watchdog ("Marvin"): errors and lag; fix immediately, escalate only when needed
| Sensor | Signal |
|---|---|
| streaming-json gap | No event for > N s (default 120 s) means a stall |
| turn budget | Approaching `--max-turns` means looping |
| exit code / `StopFailure` hook | API error, rate limit |
| `PostToolUseFailure` hook | Tool failures (log them) |
| dev server stderr | Compile and runtime errors |
| `npm run build`, `astro check` / `tsc` | Hard failures |
| Playwright smoke | Console errors, failed requests, 404s |

Triage, from GSD's executor deviation rules (`vendor/gsd-core/agents/gsd-executor.md`):
- **Rules 1–3** (bug, missing critical piece, blocker): fix immediately in a fresh session (`medium` → `high`) with the error, the diff and the prompt's must_haves.
- **Package install failure**: never auto-substitute a similarly named package. Run the registry legitimacy check, then escalate.
- **Rule 4** (architectural, such as a framework swap or a backend): escalate.
- **3 strikes** on the same error, or a stall twice in a row: `git reset --hard hh-good-<last>` (only inside the build branch; the user's main branch is never reset without approval), retry once at higher effort, then escalate with a plain-language explanation and 2–3 options (gsd-loop: 3 strikes → escalated).
- API limits: exponential backoff, pause the queue, notify.

Every incident goes to `logs/watchdog.log`. Marvin's UI voice is gloomy but competent: "I fixed the import. Not that anyone asked."

### 11.3 Reviewer ("Zaphod"): every 3 prompts and at phase ends, auto-fix by default (Matt Q27/28)
1. **Screenshots**: Playwright at 375 / 768 / 1440 / 1920 (desktop + mobile at minimum; full-page plus above-the-fold), plus a short scroll capture (video or frame strip) for motion sections.
2. **Goal-backward check** of the last 3 prompts' `must_haves` (truths, artifacts, key_links, prohibitions) against code and screenshots (`vendor/gsd-core/agents/gsd-verifier.md`). Don't let "tasks completed" bias the verdict.
3. **Watcher contract** (Matt's *Websites on Autopilot* Prompt 08): Was the definition of done met? Were protected files touched? Were RULES broken? What should be checked on localhost? It produces exact fix prompts and the next prompt number.
4. **UI audit**: GSD's 6 pillars (Copywriting, Visuals, Color, Typography, Spacing, Experience Design; each scored 1–4; `vendor/gsd-core/agents/gsd-ui-auditor.md`) plus **Motion** and **Brand**. Brand uses Matt's Brand Director dimensions (message, voice, color, typography, imagery, layout; 1–10).
5. **Anti-slop scan** (§14.5).
6. **Verdict** in `reviews/NNN-REVIEW.md`:
   - **PASS**: tag `hh-good-NNN` and update the visual baselines.
   - **FIX**: write 1–3 self-contained fix prompts, run them immediately, then re-review. Maximum 2 rounds; after that, log a known issue unless it's a BLOCKER.
   - **ESCALATE**: needs the user, with screenshots and options.

The reviewer runs at `high`. Phase-end reviews run at `xhigh`.

### 11.4 Progress UX
Eddie posts cheerful one-liners per prompt ("Prompt 47 of 112: the hero now scrubs. Isn't that *nice*?"). The dashboard shows the queue, current session stream, last screenshots, review verdicts, costs and ETA. Pause and resume work anywhere, because STATE.md is authoritative.

### 11.5 Final pass
Before handing off to Mostly Harmless, one **xhigh** whole-repo pass ("Forty-Two") reads PRD + CONTEXT + all summaries + reviews. It looks for drift, dead code, inconsistent tokens, missed requirements and protected-section integrity, and writes a fix list that becomes prompts.

---

## 12. Phase 5, Mostly Harmless: review, quality gates, the Elevate loop

### 12.1 Gates (Matt Q30: "Done = all gates")
| Gate | Tool | Threshold |
|---|---|---|
| Lighthouse **mobile** | Lighthouse CI `lhci autorun` with assertions (`"categories:performance": ["error", {"minScore": 0.9}]` etc.; `numberOfRuns` default 3) | Performance, Accessibility, Best Practices, SEO all **≥ 90** |
| Core Web Vitals (lab proxy) | Lighthouse + Playwright interaction script | LCP ≤ 2.5 s, CLS ≤ 0.1; INP ≤ 200 ms target (web.dev) |
| Console | Playwright across 4 viewports | **0 errors**, 0 failed requests |
| Accessibility | `@axe-core/playwright` + keyboard-nav test + reduced-motion run + contrast check against tokens | 0 serious/critical; menu focus trap + Escape; all motion respects `prefers-reduced-motion` |
| SEO | Custom checks | Unique title/meta per page, OG/Twitter images, one H1, alt text, sitemap.xml, robots.txt, canonical, Schema.org JSON-LD (Organization/LocalBusiness/Product/BlogPosting as relevant), internal links, no orphan pages |
| Visual regression | Playwright `toHaveScreenshot()` against baselines captured at PASS reviews (same environment as baseline; per Playwright docs) | No unexpected diffs in protected sections |
| Links / assets | Link checker, asset size budget | 0 broken; hero media under budget (Matt: video ≲ 4 MB, AV1 + H.264) |
| Credits | CREDITS.json ↔ credits page | Every borrowed asset is credited |
| **Brand sign-off** | Zaphod Brand score + user approval | ≥ 8/10 on every Brand dimension, user clicks Approve |

A **Total Perspective Vortex** jury review (Matt Prompt 30: 3 Awwwards-style judges scoring Design/Usability/Creativity/Content out of 10, "If it's a 6, say 6") produces a fix list. That list becomes prompts (Matt Prompt 31).

### 12.2 Elevate loop (Matt Q30)
A button, `/hh-elevate`, that the user can press any number of times. Each round:
1. Grok 4.7 `xhigh` reviews the live local site cold (screenshots + code + BRAND/MOTION), asking "How could I possibly improve this?"
2. It proposes ≤ 8 upgrades ranked by impact vs effort (Matt Prompt 32 style), each tagged by pass type: **type and spacing → motion → imagery → copy** (Matt's elevation passes 26–29, in that order) or **standout feature** (Prompt 25 menu: hero interaction, scroll storytelling, cursor (not magnetic), 3D moment, micro-interactions, sound toggle, transitions, easter egg; each with phone weight and reduced-motion version).
3. The user picks. The chosen upgrades become prompts and run through the same loop with review.
4. Gates re-run. Nothing merges if a gate regresses.

**Slartibartfast's Fjords** is the detail pass: the Elevate round focused on micro-detail (kerning, optical alignment, hover states, focus styles, 404 page, favicon, OG image, empty and error states, print styles).

---

## 13. Phase 6, So Long and Thanks for All the Fish: launch

- **"Before we jump" follow-ups**: domain, DNS, email on the domain, analytics choice confirmation, legal pages, launch date.
- **Deploy** (Matt Q22: deploys for them *and* gives instructions; explicit approval required):
  - **Hostinger (priority)**: Hostinger API with a user-created token ("Hostinger shows it only once"; Matt's masterclass step 9). The official Hostinger API MCP server ([github.com/hostinger/api-mcp-server](https://github.com/hostinger/api-mcp-server), [developers.hostinger.com](https://developers.hostinger.com/)) covers hosting, DNS and domains.
  - **Vercel**: `vercel deploy` (best for Next.js).
  - **Netlify**: `netlify deploy` (forms + functions).
  - **Cloudflare**: Workers static assets via `wrangler deploy` ([docs](https://developers.cloudflare.com/workers/static-assets/)).
  - Always write `DEPLOY.md` with manual steps for the chosen host plus rollback instructions.
- **Post-deploy checks**: live Lighthouse mobile run, 200s on all routes, forms deliver (a test submission to the user's own inbox), analytics receive a test event, OG preview, HTTPS, redirects.
- **Search**: sitemap submission *instructions* (Google Search Console, Bing Webmaster). Don't automate account actions.
- **Launch kit ("Share and Enjoy")**: OG images, 3–5 launch post drafts in the user's voice (X, LinkedIn, Instagram), and an email announcement draft. **Posting requires explicit approval.** X posting is v2 (§16).
- **Handoff**: `HANDOFF.md` (how to edit content, run Elevate, add a blog post, renew domain), plus a **post-launch upgrade list** (Prompt 32 style, ≤ 8 ranked items) and a reminder to re-run Elevate in 30 days.
- **Reveal**: a big end-of-journey reveal with a side-by-side of the Site Brief vs the live site, scores and a "Don't Panic" towel badge.

---

## 14. The anti-slop rulebook

Matt: "no weird magnetic buttons or generic AI tropes; everything agency-level, drawn from the most recent libraries and Awwwards sites. Build an explicit anti-slop rulebook."

### 14.1 Matt's NO SLOP RULES (*Websites on Autopilot*, Prompt 23; the core, paraphrased and structured for enforcement)
**Never:**
- purple-to-blue or rainbow gradients
- a centered hero with a floating stock blob or abstract 3D shape
- the generic row of 3 feature cards with icons
- emoji as icons
- slop words (§14.3)
- lorem ipsum or placeholder copy
- stock photos of smiling people pointing at laptops
- the default Tailwind look (gray-50 backgrounds, rounded-xl cards, indigo buttons, everything centered)
- every section with the same rhythm (headline, subline, grid, repeat)
- invented testimonials, fake logos or made-up numbers

**Always:**
- one bold idea per section, named in the report
- real copy in the brand voice, specific and human
- asymmetric layouts with intentional empty space
- a deliberate type scale with big contrast between display and body
- motion with a purpose (it guides the eye, reveals the story or gives feedback; never decoration)
- specific details only this brand would have
- brand colors and fonts only
- "If you're about to do something you've seen on a thousand sites, stop and do the more interesting version"
- if something isn't real yet, mark it TODO

**Elevated by default:** aim for an Awwwards Site of the Day result, not a regular website.

### 14.2 Extended tropes ban list (Matt's 2026-10-05 direction + my synthesis; Grok should challenge and extend it)
- **Magnetic buttons** / cursor-attracting CTAs (explicit Matt ban).
- Cursor-follower blobs or trails on every site. A custom cursor is allowed only when it carries the brand idea, and never on touch devices.
- Glassmorphism cards everywhere; frosted panels as the default surface.
- Gradient text on headings by default; glowing orbs and aurora blobs behind the hero.
- Generic particle or starfield backgrounds without narrative purpose.
- Default bento grids as the layout answer to everything.
- Fake "Trusted by" logo strips; fake counters ("10,000+ happy customers") without a source.
- "Learn More" / "Get Started" CTAs. CTAs must name the outcome ("Book a tasting", "See the floor plans").
- Hero headlines of the "Build the future of X" / "Your all-in-one Y" / "Welcome to Z" form.
- Lucide/Heroicons default icon sets used as decoration; ✨ sparkles; 🚀 rockets.
- Inter-for-everything; system default type scale; three equal-width pricing cards as the default for non-SaaS.
- Text scramble or split-reveal on *every* heading; parallax on everything; scroll-jacking that fights the user; autoplay sound; preloaders > 2 s without real loading need.
- Low-contrast grey-on-grey body text; noise overlay so strong it reduces legibility.
- Stock 3D "abstract shapes" (glossy torus, floating spheres) unrelated to the brand.
- Uniform `rounded-2xl shadow-lg` cards; `max-w-7xl mx-auto text-center` on every section.

### 14.3 Banned words (union of Matt's NO SLOP + brand guide "AI slop list")
unlock, elevate (as copy), seamless, revolutionize, empower, game-changer, delve, leverage, synergy, robust, cutting-edge, journey, tapestry, landscape, "in today's fast-paced world", "it's not just X, it's Y", "In a world where". Users can add to the list in VOICE.md. Typographic rules from Matt's RULES template: no em dashes, no exclamation points (overridable per brand).

### 14.4 What to reach for instead
The current libraries and award patterns in `research/03-awwwards-anatomy.md` (10-trait anatomy, 36 sites in style groups) and `research/04-motion-taxonomy.md` (A1–H3), for example:
- SplitText masked line reveals with deliberate stagger
- clip-path image windows
- one pinned story section
- a scroll-scrubbed hero film
- View Transitions with a shared-element morph
- HDRI-lit GLB moments with mobile stills
- editorial type scales with big display contrast
- asymmetric grids with real negative space

Each site gets exactly **one signature moment** (VISUAL-DIRECTION.md).

### 14.5 Enforcement ("Nutrimatic Test")
- **Static lint** (fast, every review):
  - grep the banned words in copy (`src/**/*.{astro,md,mdx,tsx}`)
  - `—` em dash, `!` in copy
  - `lorem`, `TODO` (allowed only if tracked in ASSETS/STATE)
  - Tailwind default palette classes (`bg-gray-50`, `indigo-`)
  - `linear-gradient(` with purple/blue hue pairs
  - magnetic-button patterns (pointermove handlers translating buttons toward the cursor)
  - emoji in headings/icons
  - duplicated section structures (AST shape similarity)
- **Visual lint** (reviewer, Grok vision): centered-hero-with-blob detection, 3-card-row detection, rhythm monotony across sections, contrast, "seen it a thousand times" judgement with a reason.
- Any hit is a FIX verdict with a concrete alternative drawn from the brand and the motion library.

---

## 15. Stack defaults, framework choice, motion and 3D libraries

Full tables with versions, licenses and sources are in `research/06-library-stack.md`. 3D and asset sources are in `research/07-3d-assets-open-source.md`.

### 15.1 Generated-site starter kit (default)
```
astro@7 (TypeScript strict) + @astrojs/react (only if motion level ≥ 8 with R3F)
gsap@3.15 (ScrollTrigger, SplitText, Flip, DrawSVG, MorphSVG… all plugins ship free) (+ @gsap/react in islands)
lenis@1.3 (NOT the deprecated @studio-freight/lenis)
three@0.186 (+ @react-three/fiber@9, @react-three/drei@10, postprocessing): lazy, level ≥ 8, desktop-first, mobile stills
Plain CSS custom properties from brand tokens (Tailwind v4 opt-in, never the default look)
src/scripts/motion.ts   (shared eases/durations from motion personality, reduced-motion gate, Lenis↔ScrollTrigger wiring)
src/three/loader.ts     (Draco/Meshopt, HDRI, pause offscreen)
src/data/credits.ts     (typed credits → /credits page)
scripts/optimize-media.mjs (AVIF/WebP 1280/1920/2560; AV1 + H.264; scroll video: -g 1 -an, 1920w, faststart; WebP frame fallback 120–180 frames)
scripts/fetch-assets.mjs   (Poly Haven / ambientCG / Kenney / Quaternius; license + credit capture)
tests/qa.spec.ts           (375/768/1440/1920; console; links; a11y; reduced motion; screenshots)
AGENTS.md + .grok/rules/*.md + .grok/skills/<stack-usage-specs>/SKILL.md
/_archive (never delete, move here) · /public/models/custom
```

### 15.2 Framework choice
See §10.4. The decision record must include the pick, why, alternatives, trade-offs and "what would make us switch". The user can always override.

### 15.3 Motion library map (by appetite)
| Level | Default libraries |
|---|---|
| 1–2 | CSS + GSAP core |
| 3–4 | + Lenis, SplitText, View Transitions |
| 5–7 | + ScrollTrigger pin/scrub, scroll video, Flip, Rive/Lottie (optional), OGL shader backgrounds |
| 8–10 | + Three.js/R3F, drei, postprocessing, Rapier (physics) |

Stale libraries to avoid by default: Barba and Matter.js have no npm publish since 2024 (`research/06`).

### 15.4 GSAP
D-001 withdrew the MIT fallback and the avoid Theatre advice. GSAP stays the base engine.

### 15.5 Mobile standard (Matt Q18)
Every heavy effect gets a calm phone version (poster or still instead of scrub/3D, shorter pins, no cursor effects). Touch targets ≥ 44 px. `inputmode`/`autocomplete` on forms. Fluid type with `clamp()`. Test real-device widths 375/390/430. Budgets per `research/06` mobile table. The motion gate respects `prefers-reduced-motion`.

---

## 16. Integrations

Details, prices and sources are in `research/11-integrations.md`.

### 16.1 App-level (the Guide itself)
| Integration | v1 behavior |
|---|---|
| **Grok Build** | Required. The user logs in with SuperGrok (`grok login` / `--device-auth`) or sets `XAI_API_KEY` |
| **Grok Imagine** | Asset jobs via the xAI API (`/v1/images/generations`, async `/v1/videos/generations`) with a budget cap. **DIY mode** writes prompts for the user to run in the Grok app. *Verify* whether SuperGrok login grants API Imagine access (likely not; API billing is separate) |
| **Voice** | whisper.cpp local (default); xAI STT optional |
| **X account** | OAuth 2.0 PKCE, read-only (`tweet.read users.read offline.access`). Identity plus optional voice and imagery context. X API is pay-per-use, so show the cost. Posting is v2 and needs approval |
| **Tripo / Meshy** (optional) | Wrapped as tools `generate_3d(prompt|image) → glb` with a cost preview, then gltf-transform cleanup |
| **MCP / API auto-discovery** | Search the official MCP Registry ([registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io/)) and npm. Present options with license, cost and maintenance signals. Run a **safety check** (Matt's masterclass: "Run the safety check first, every time") plus GSD's package-legitimacy gate. Install only on approval |

### 16.2 Generated-site features (all out of the box, Matt Q23)
- Contact / intake form: Web3Forms or Formspree, or Netlify Forms.
- Transactional email: Resend (free tier: 3,000/mo, 100/day).
- Newsletter: Kit / Mailchimp / MailerLite / Beehiiv / Brevo / Klaviyo / Hostinger Reach (ask).
- Payments / store: Stripe Payment Links. Shopify Buy Button for inventory. A full store escalates.
- Booking: Cal.com embed or Calendly.
- Blog / CMS: Astro content collections + AI-written keyword posts. Keystatic or Sanity if they want an editor.
- Analytics: Plausible or Umami (no cookie banner), or GA4 with consent. KPI events from KPIS.md.
- Video / media / portfolio: optimized self-hosted media, content collections.
- Email intake, store, video and portfolios, per Matt.
- Special features (MLS, maps, configurators, member areas, blockchain…) go through auto-discovery (16.1) and Rule 4 escalation if a backend is needed.

### 16.3 Deploy targets
Hostinger (priority, API token + official MCP server), Vercel, Netlify, Cloudflare (§13). Always also write DEPLOY.md.

---

## 17. Knowledge packs to ship (Matt Q37)

Each pack is a Grok Build **skill** (`.grok/skills/<pack>/SKILL.md` + `references/*.md` + `examples/`). Frontmatter carries `description`, `when-to-use` and `paths` globs so a pack stays hidden until relevant ("Hidden until a matching file is touched", per Grok Build skills docs), keeping tokens low. Every claim in a pack needs a source link and license note. **Grok must research and write these with citations; don't invent statistics.**

| Pack | Contents (to research and write) | Loaded when |
|---|---|---|
| **sales-psychology** (default) | Persuasion principles with primary sources (for example Cialdini's principles), offer framing, pricing presentation, risk reversal, social proof (*real only*), urgency without dark patterns, funnel templates by site type, ethical guardrails | Site type includes sales, funnel or leads |
| **seo** | Technical SEO checklist, Schema.org types per site type, local SEO, keyword-to-page mapping, blog briefs, competitor gap method, AI-search/answer-engine practices, Astro SEO recipes | Always in Deep Thought; blog prompts |
| **motion** | Taxonomy A1–H3 with code recipes (GSAP/Lenis/ScrollTrigger/SplitText/Flip/View Transitions), the appetite table, personality → easing tokens, mobile + reduced-motion patterns, performance rules (transform/opacity only) | `src/scripts/**`, motion prompts |
| **typography** | Pairing rules, free font sources + licenses (Google Fonts, Fontshare), fluid type scales, font loading (`font-display`, subsetting, preload) | Brand + CSS prompts |
| **color** | 60-30-10, contrast math, palette generation, dark/light modes, honest color psychology with caveats | Brand + CSS prompts |
| **ux-conversion** | Hero patterns, CTA rules, form UX, navigation, trust architecture, page templates by site type | Section prompts |
| **a11y** | WCAG 2.2 AA checklist, focus management, motion sensitivity, ARIA patterns for menus/dialogs/carousels, axe rule map | Every review |
| **copywriting** | Voice application, headline formulas *as starting points only*, microcopy, banned words, before/after examples | Copy prompts |
| **award-sites-by-industry** | Curated shortlists (Awwwards/Godly/FWA/CSSDA links) per industry and style world, with "what to steal (thinking, not look)" notes, refreshed by crawler | Don't Panic taste module, Elevate |
| **anti-slop** | §14 rulebook + lint patterns | Always (rules) |
| **brand-frameworks** | Golden Circle, archetypes, positioning, StoryBrand SB7, NN/g tone, discovery rounds (our own words; inspired by Matt's guide) | Babel Fish |
| **stack-usage-specs** | `gsap-scrolltrigger-lenis`, `splittext-reveals`, `astro-view-transitions-gsap-reinit`, `r3f-lazy-hero`, `scroll-video-encode`, `imagine-prompting`, `3d-asset-sourcing`, `deploy-hostinger` / `-vercel` / `-netlify` / `-cloudflare` (list in `research/06`) | Matching `paths` |
| **golden-prompts** | Templates for the ~40 most common build prompts (setup, hero, nav, section, reveals, scroll video, transitions, 3D, glow, media, credits, QA, fix, elevate), inspired by Matt's Prompts 09–32 | Deep Thought |

---

## 18. Command set, app and dashboard spec

### 18.1 Commands (GSD-style, Grok Build plugin)
Implemented as skills in `.grok/skills/` with `user-invocable: true` ("Show as a slash command") and, for side-effecting commands such as deploy, `disable-model-invocation: true` ("Slash command only; no automatic invoke"), per `sources/xai/features_skills-plugins-marketplaces.md`. GSD equivalents are in brackets (`vendor/gsd-core/commands/gsd/`).

| Command | Does | GSD analogue |
|---|---|---|
| `/hh-new` | Create a site project, `.hitchhiker/` scaffold, config | new-project |
| `/hh-dont-panic` | Run or resume the interview | discuss-phase |
| `/hh-import <file\|url>` | Import a brand guide, existing site or assets | ingest-docs / import |
| `/hh-babel-fish` | Brand phase | (new) |
| `/hh-logo` | Logo concepts → SVG | (new) |
| `/hh-assets` | Imagine / 3D asset jobs with a budget | (new) |
| `/hh-deep-thought` | PRD, specs, prompt package | plan-phase / spec-phase |
| `/hh-drive` | Execute the prompt queue (headless orchestrator) | execute-phase / autonomous |
| `/hh-review` | Manual Zaphod review now | verify-work / ui-review |
| `/hh-fix "<issue>"` | Spec'd one-off fix | quick / debug |
| `/hh-mostly-harmless` | Run all gates + jury | verify-work / audit |
| `/hh-elevate` | One Elevate round | (new) |
| `/hh-so-long` | Deploy + launch kit | ship |
| `/hh-progress` | Guide map + next action | progress / next |
| `/hh-pause`, `/hh-resume` | Save / restore via STATE.md | pause-work / resume-work |
| `/hh-undo` | Revert the last prompt's commit (build branch) | undo |
| `/hh-budget` | Show and set spend caps | (new) |
| `/hh-settings` | Models, effort, voice, deploy target | settings |
| `/hh-doctor` | Health check: grok version, auth, node, playwright, whisper model, git | health |
| `/hh-dashboard` | Open the local dashboard | (new) |
| `/hh-help` | "Don't Panic" help | help |

### 18.2 Companion app (local web app, Grok-Bot-like)
- **Stack:** pick in Deep Thought. Suggestion: Vite + React or Astro + islands, with ACP to `grok agent stdio`, plus a local Node server for files, crawler, whisper and QA.
- **Screens:**
  - Chat: push-to-talk, uploads, example-site cards, question cards with Answer/Suggest/Skip.
  - Guide map (progress).
  - Brand kit reveal.
  - Approvals (PRD/CONTEXT/prompts).
  - Dashboard (queue, live stream, screenshots, reviews, watchdog, gates, costs).
  - Elevate.
  - Launch.
- **Brand of the app itself:** "Don't Panic" in large, friendly letters, warm, witty and confident. It must pass its own anti-slop rules.

### 18.3 Dashboard
It reads `.hitchhiker/` files plus `logs/*.jsonl` and shows:
- per-prompt status (queued / running / review / fixed / escalated)
- effort and model used
- duration
- cost (Imagine, API mode)
- last screenshots at 375 and 1440
- Lighthouse trend
- open escalations with one-click answers

---

## 19. Repo plan

**Repo:** `github.com/kr8tiv-io/hitchhikers-guide-to-web-design` (public). **License: MIT** (default; Matt Q4 "completely free and open source"). Creating or publishing the repo is an external action that needs Matt's go-ahead.

```
hitchhikers-guide-to-web-design/
  LICENSE (MIT) · NOTICE (third-party attributions: open-gsd/gsd-core MIT templates, etc.) · README.md ("Don't Panic")
  CONTRIBUTING.md · CODE_OF_CONDUCT.md · SECURITY.md · CHANGELOG.md
  packages/
    engine/        # TS: state (.hitchhiker/), interview engine (tree.yaml), coverage, phase/slice/prompt model, cost meter
    orchestrator/  # headless grok runner, ACP client, effort routing, watchdog (Marvin), reviewer harness (Zaphod)
    grok-plugin/   # .grok/{skills,agents,hooks,rules} + commands; installer `hh install`
    app/           # local web app: chat + dashboard
    cli/           # `npx hitchhikers-guide` / `hh` binary
    voice/         # whisper.cpp wrapper (download model, PTT capture), xAI STT adapter
    crawler/       # Playwright crawler: screenshots, styles, stack sniffing, SEO extract, Godly/Awwwards walkers
    assets/        # Imagine client (images/videos, async poll), logo pipeline (opentype.js, vtracer, SVGO), grading + Real-ESRGAN, 3D fetchers + Tripo/Meshy
    qa/            # LHCI config, axe, Playwright suites, visual baselines, anti-slop linter
    deploy/        # adapters: hostinger (API/MCP), vercel, netlify, cloudflare; DEPLOY.md generator
    knowledge/     # packs (§17) as skills
    templates/     # site starters: astro-default, next-app, vite-r3f-world; golden prompts
  interview/tree.yaml   # §8 as data
  evals/                # golden interviews, sample brands, expected artifacts; Aura Homes package if Matt provides it
  docs/                 # user guide, architecture, contributing a knowledge pack
  .github/workflows/    # lint, typecheck, unit, e2e (playwright), evals
```

**Principles:**
- Small, well-typed packages.
- Zero telemetry by default.
- All secrets live in the OS keychain or `.env.local` (never committed).
- Every external call goes through one audited client with cost logging.
- Port GSD templates with attribution rather than depending on gsd-core at runtime. gsd-core doesn't list Grok as a runtime (`research/01`), though sibling repos gsd-path/gsd-loop support Grok (`vendor/gsd-path`).

---

## 20. Cost and token budgets

- **Subscription mode (default):** Grok Build usage counts against the user's SuperGrok plan (Matt Q3). The app shows prompt counts and estimated time, not dollars.
- **API-key mode (illustrative only; assumptions stated):** grok-4.7 costs $2.00/M input, $0.50/M cached, $6.00/M output under 200k prompt tokens. At ≥ 200k, *all* tokens in the request bill at $4/$1/$12 (docs.x.ai/docs/models/grok-4.7). *Assuming* 100 prompts × 40k input tokens (75 % cache hits) + 8k output each, plus 35 reviews × 60k input + 4k output, the run costs on the order of **$10–20**. Grok should recompute with real measurements from evals.
- **Rules:**
  - Stable prefix first (RULES + CONTEXT sections) for caching.
  - Never cross 200k tokens per request.
  - `@file` references instead of pasted history.
  - Summaries ≤ 150 words.
  - Path-scoped skills.
  - GSD context monitor thresholds (warning at ≤ 35 % context left, critical at ≤ 25 %) as hooks for interactive sessions.
- **Imagine:** priced per image or second (§8.3 Module 7). Always estimate first and enforce the cap.
- **Voice:** local by default, $0. xAI STT is $0.10/hr (REST).

---

## 21. Risks, open questions and things to verify

1. D-001 withdrew the MIT fallback and the avoid Theatre advice. GSAP stays the base engine.
2. **Imagine access**: does the SuperGrok login used by Grok Build allow Imagine API calls, or is an `XAI_API_KEY` with console credits required? Design for both, with DIY as the fallback.
3. **Grok Voice for STT inside our app** needs an API key (billed separately). Local Whisper is the default.
4. **X API**: pay-per-use pricing and media upload auth (v2 OAuth 2.0 vs claims that v1.1/OAuth 1.0a is still needed). Test before v2 posting.
5. **gsd-core isn't Grok-native.** Port the formats; don't depend on it at runtime.
6. **Hooks fail open.** The orchestrator must enforce protections itself.
7. **Content rights:**
   - Matt's guides are AntiHero content. The app is independent, so re-express them and credit them. Ask Matt about including any verbatim prompts.
   - The Hitchhiker's Guide to the Galaxy is a copyrighted work and a trademark-sensitive title. Phase names are short references. Get a quick legal/name check before public launch (name is locked by Matt; flag only), and avoid book quotes beyond short phrases and artwork lookalikes.
8. **Crawling ToS** for Godly/Awwwards/Pinterest: cache and rate-limit, store links and screenshots for private use, and prefer shipped curated lists.
9. **Facebook-group assets are inaccessible to this research:** `prompt-guide.md`, the Aura Homes 55-prompt package, replays and member examples (`research/09` §5). They'd make excellent evals.
10. **"Cozy Lake Cabin"**, an Aura Homes reference in Matt's guide, couldn't be found. Ask Matt for the URL.
11. **Effort semantics in Grok Build:** `--effort` exists. Confirm it maps to grok-4.7's low/medium/high/xhigh, and how "Grok 4.7 Fast" is selected (`/model`).

---

## 22. Source index

**Research reports** (`context/research/`):
- `00-SUMMARY.md`: one-page synthesis
- `01-opengsd-deep-dive.md`: GSD architecture, files, agents, what to copy
- `02-spec-driven-tools.md`: Spec Kit, Kiro, Tessl, BMad, Agent OS, Taskmaster
- `03-awwwards-anatomy.md`: scoring, 36 sites by style
- `04-motion-taxonomy.md`: A1–H3 + 1–10 appetite
- `05-inspiration-galleries.md`: galleries and how to use them
- `06-library-stack.md`: frameworks, packages, versions, mobile budgets
- `07-3d-assets-open-source.md`: Poly Haven, ambientCG, Kenney, Quaternius, Sketchfab, fonts, Tripo/Meshy
- `08-brand-intake-frameworks.md`: frameworks + Matt's 18 brand prompts
- `09-antihero-guides-inventory.md`: all AntiHero guides, prompts, videos, FB-group needs
- `10-agent-orchestration-qa.md`: Grok Build orchestration, reviewer, watchdog, gates, xAI pricing
- `11-integrations.md`: X, Imagine, voice, forms, email, Stripe, booking, CMS, analytics, hosting
- `12-competitors.md`: landscape + gap

**Vendored code** (`vendor/`):
- `gsd-core/` (MIT, v1.7.0): `agents/`, `commands/gsd/`, `gsd-core/templates/`, `gsd-core/workflows/`, `gsd-core/references/`
- `gsd-path/`, `gsd-spec-build-loop/`, `gsd-pi/`

**Matt's inputs:**
- `context/matt-answers.md` (40 answers, authoritative)
- `context/miro/01-brand-assets.png`, `02-positioning-intent.png`, `03-interviews.png`

**Matt's guides** (antihero.community), with local PDFs and text in `context/sources/`:
- *Websites on Autopilot* (2026-10-02): https://antihero.community/guides/websites-on-autopilot/ · PDF https://antihero.community/guides/website-on-autopilot.pdf · local `sources/website-on-autopilot.pdf` (+ `.plain.txt`)
- *Build a Brand From Scratch With AI* (2026-10-01): https://antihero.community/guides/build-a-brand-from-scratch-with-ai/ · PDF https://antihero.community/guides/build-a-brand-from-scratch-with-ai.pdf · local `sources/build-a-brand-from-scratch-with-ai.pdf`
- *Email: The Channel Nobody Can Take* (2026-09-29): https://antihero.community/guides/email-the-channel-nobody-can-take/ · local `sources/email-the-channel-nobody-can-take.pdf`
- *AntiHero Website Masterclass* (2026-09-27): https://antihero.community/guides/antihero-website-masterclass/ · local `sources/antihero-website-masterclass.pdf`
- Prompt library: https://antihero.community/prompts/ (Websites 17 · Grok Build 23 · Grok Bot 14 · Brand 15 · Images and video 6 · Content and social 8 · Business 6) · local `sources/prompts.txt`
- Video replays: https://antihero.community/videos/ (self-hosted MP4s, for example `/media/replays/websites-on-autopilot-live.mp4`; 3D website masterclass 1:56:09)

**xAI / Grok Build docs** (local copies in `context/sources/xai/`):
- https://docs.x.ai/build/overview
- https://docs.x.ai/build/cli/reference
- https://docs.x.ai/build/cli/headless-scripting
- https://docs.x.ai/build/features/hooks
- https://docs.x.ai/build/features/subagents
- https://docs.x.ai/build/features/project-rules
- https://docs.x.ai/build/features/skills-plugins-marketplaces
- https://docs.x.ai/build/features/background-tasks
- https://docs.x.ai/build/features/plan-mode
- https://docs.x.ai/build/features/permissions
- https://docs.x.ai/build/features/worktrees
- https://docs.x.ai/docs/models
- https://docs.x.ai/docs/models/grok-4.7
- https://docs.x.ai/docs/guides/image-generation
- https://docs.x.ai/docs/guides/video-generation
- https://docs.x.ai/docs/model-capabilities/audio/speech-to-text

**Spec-tool READMEs:** `sources/sdd/`. **Awwwards pages:** `sources/soty.html`, `sources/aww/`.

---

## 23. Instructions to Grok 4.7

You are **Grok 4.7 running at `xhigh` effort inside Grok Build**. You're the lead architect for *The Hitchhiker's Guide to Web Design*. Matt Haynes is the product owner. A steward agent will review your output and then orchestrate the build. Work in this order and don't skip steps.

### (a) Critique and improve this package
Read this whole document, then skim the reports in `context/research/` (start with `00-SUMMARY.md`), `matt-answers.md`, the Miro images, and `vendor/gsd-core` (especially `agents/gsd-executor.md`, `agents/gsd-verifier.md`, `agents/gsd-ui-auditor.md`, `agents/gsd-planner.md`, `gsd-core/templates/{project,requirements,roadmap,state,phase-prompt,summary,verification-report}.md`, `commands/gsd/`).

Write **`CRITIQUE.md`** covering:
- what's wrong, missing, contradictory or over-engineered
- risks Matt hasn't seen
- where the interview is too long or too short for each user level
- whether the six-phase, slice and tier model holds up
- concrete improvements, each with a proposed change

Respect Matt's locked decisions (name, phase names, free/MIT, local-first via Grok Build, SuperGrok requirement, text-only interviewer, push-to-talk, Hostinger priority, spec-driven like GSD, 50–150 prompts per site, reviewer every ~3, fresh session per prompt). Where you disagree with one, say so and argue it, but don't override it.

Then write **`CONTEXT-PACKAGE.v2.md`** incorporating your improvements. Mark each change `[changed]` / `[added]`.

### (b) Do any extra research needed
Orchestrate deeper research with subagents (explore/general-purpose), web search and repo reading. At minimum, verify or resolve every item in §21, and research the knowledge packs (§17) with citations. Also cover:
- current Grok Build features that might simplify the orchestrator: plugins/marketplaces, `/loop`, monitors, subagents, worktrees, ACP
- the best open-source repos for the interview, crawler, voice, logo vectorization, image upscaling, Lighthouse/axe automation, and deploy adapters (license-check each one for MIT compatibility)
- how to fetch Godly and Awwwards examples reliably and politely
- the latest Awwwards SOTD/SOTY patterns (2025–2026) for the award-sites pack
- Hostinger API/MCP deploy specifics for static sites

Write **`RESEARCH-ADDENDUM.md`** with source links for every claim. **No invented stats, APIs or flags.** If you can't verify something, say so.

### (c) Write ~100 long, self-contained build prompts for building THIS APP
These build prompts are for building *the Guide app itself* (packages in §19), not a generated site. Group them into the **6 phases**, reusing the phase names as the app's own build phases:

| App build phase | Covers (suggested ~count) |
|---|---|
| **Don't Panic** | Repo, monorepo tooling, CI, engine state model (`.hitchhiker/` + GSD-ported templates), config, CLI skeleton, `/hh-doctor`, interview tree data (§8) + interview engine (question cards, Suggest/Skip, pushback, coverage, save/resume), the Guide persona system prompt, voice (whisper.cpp PTT + xAI STT adapter), ingestion (PDF, images, crawler, Pinterest, X read-only), Godly/Awwwards walkers, app chat UI (~22) |
| **Babel Fish** | Brand modules (§9.2), BRAND/VOICE compilers, tokens, Imagine client + budget meter + DIY mode, logo pipeline (Imagine → opentype.js wordmark → vtracer → SVGO → tests → export set), collateral grading + Real-ESRGAN upscale, brand-kit reveal page (~16) |
| **Deep Thought** | PRD/REQUIREMENTS/ROADMAP/STATE generators, KPI helper, stack decision record, section plan, motion spec, CONTEXT.md assembler, prompt-package generator with tiers/effort tags, golden prompts library, knowledge-pack skills (§17), approval UI (~18) |
| **Improbability Drive** | Headless runner, ACP client, effort routing, session naming, git discipline (backup branch, one commit per prompt, good tags), Marvin watchdog (sensors, triage, 3 strikes, rollback, escalation UX), Zaphod reviewer (screenshots, goal-backward check, 6+2 pillars, verdicts, auto-fix loop), anti-slop linter, dashboard (~22) |
| **Mostly Harmless** | QA package (LHCI asserts, axe, console, SEO checks, visual baselines), Total Perspective Vortex jury, Elevate loop, phase "Before we jump" follow-up generator, evals harness (golden interviews → expected artifacts), end-to-end dogfood run on a sample brand (~12) |
| **So Long and Thanks for All the Fish** | Deploy adapters (Hostinger first, then Vercel, Netlify, Cloudflare), DEPLOY.md/HANDOFF.md generators, launch kit, docs site + README in "Don't Panic" voice, packaging/release (npm), security review, license/NOTICE audit (~10) |

**Every prompt must contain** (adapt GSD's PLAN schema, §10.5):
1. `id` (001–~100), `phase`, `slice` (give each slice a fun Hitchhiker's name), `title`
2. `tier` (Towel / Cup of Tea / Gargle Blaster / Heart of Gold / Forty-Two) and **`effort` tag** (`medium` for easy, `high` or `xhigh` for hard) and `model`
3. **Goal** (one paragraph: why this prompt exists, which requirement it serves)
4. **Files** to create or modify (exact paths), plus `read_first` files
5. **Instructions**: concrete, complete and self-contained. Never "as before" or "see above". Restate needed context. Include interfaces, types, data shapes and edge cases.
6. **Acceptance criteria**: testable (commands to run, tests that must pass, grep-verifiable facts, screenshots to check)
7. `must_haves` (truths / artifacts / key_links / prohibitions)
8. `depends_on`
9. **Reviewer checkpoint**: every 3rd prompt (003, 006, 009…) and every phase end carries a `REVIEW CHECKPOINT` block telling the reviewer what to verify across the last 3 prompts (including desktop + mobile screenshots for UI work) and the auto-fix policy
10. Commit message

**Prompt-writing rules:**
- Written specifically and optimally for Grok 4.7 in Grok Build.
- Long and self-contained: assume a fresh session with only the repo and the listed files.
- One job per prompt.
- Start every prompt with the same short RULES block for the app repo (TypeScript strict, tests required, no secrets in code, MIT-compatible dependencies only, no new dependency without the legitimacy check, commit when done, anti-slop applies to the app UI too).
- Keep each prompt's required context under 200k tokens.

**Deliverables** (write them in the working directory under `hh-build-plan/`):
- `hh-build-plan/CRITIQUE.md`
- `hh-build-plan/RESEARCH-ADDENDUM.md`
- `hh-build-plan/CONTEXT-PACKAGE.v2.md`
- `hh-build-plan/prompts/NNN-<slug>.md` (~100 files)
- `hh-build-plan/prompts/INDEX.md`: a table of id, phase, slice, title, tier, effort, depends_on and checkpoint, plus totals per phase and the critical path

Then stop and report back so the steward can review. **Don't start building the app, don't create GitHub repos, don't deploy and don't post anything.** Those steps happen after review and approval.

*Don't Panic. Bring a towel.*
