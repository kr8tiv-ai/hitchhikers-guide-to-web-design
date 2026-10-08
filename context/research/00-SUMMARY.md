# 00 · Summary: The Hitchhiker's Guide to Web Design (research synthesis)

*2026-10-05. Product name locked by Matt: "The Hitchhiker's Guide to Web Design". It's a free, MIT-licensed, independent tool for Grok Build. Matt's 40 answers (`../matt-answers.md`) override earlier assumptions. Full spec: `../CONTEXT-PACKAGE.md`.*

**North star (Matt):** "Feels like a 2-hour meeting with the greatest brand agency on the planet, using the greatest AI on the planet." Simple questions go in; very technical, Awwwards-level websites come out.

## 1. Architecture: copy GSD's file spine, add a brand and motion layer, run each prompt fresh in Grok Build
- **Local-first, runs inside Grok Build** (01, 10). Ship a `.grok/` package with `skills/`, `agents/`, `hooks/`, `rules/` and a `/hh-*` command set. Grok Build also reads Claude Code assets.
  - Drive builds headless: `grok -p … -s <session> --effort <level> --output-format streaming-json --max-turns N`.
  - The app/dashboard can stream through ACP (`grok agent stdio`).
  - Grok 4.7 supports reasoning efforts low, medium, high and xhigh. Pricing is $2/$0.50 cached/$6 per 1M tokens under 200k; above 200k every token in the request is billed at double. 500k context.
- **Spec files, the same as gsd-core** (`vendor/gsd-core`): PROJECT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md (the resume spine), per-slice PLAN/SUMMARY/VERIFICATION. On top of those, add BRAND.md, VOICE.md, MOTION.md, PRD.md, SITE-BRIEF.md, VISUAL-DIRECTION.md, SECTION-PLAN.md, ASSETS.md, RULES.md and CREDITS.json.
  - Prompts use GSD's PLAN schema (files, read_first, action, verify, acceptance_criteria, `must_haves`).
- **Six phases (approved names):** **Don't Panic** (interview) → **Babel Fish** (brand) → **Deep Thought** (PRD, spec, prompt package) → **Improbability Drive** (build) → **Mostly Harmless** (review, QA, elevate) → **So Long and Thanks for All the Fish** (launch). Each phase opens with follow-up questions based on the previous output, and work splits into fun-named slices.
- **Execution:** 50–150 prompts per site, each with a difficulty tier and an effort tag. Routing is medium for easy work and high/xhigh for hard work.
  - Every prompt runs in a fresh session: RULES + task + @files, with no chained history. One prompt = one commit.
  - **Reviewer every 3 prompts:** GSD goal-backward verifier + 6-pillar UI audit plus Motion and Brand pillars + Matt's Watcher contract. It takes Playwright screenshots at 375/768/1440/1920 and auto-fixes (at most 2 rounds).
  - **Watchdog:** streaming-json stall, StopFailure/PostToolUseFailure hooks, build/console errors. It fixes Rule 1–3 problems immediately, never auto-substitutes packages, escalates Rule 4 or 3 strikes, and rolls back to the last reviewed commit.
  - **Final pass:** xhigh, then the Elevate loop.
- **Gates:** Lighthouse mobile ≥90 in all categories (LHCI asserts), zero console errors, axe with no serious issues, a reduced-motion run, SEO basics, CWV targets (LCP ≤2.5s, INP ≤200ms, CLS ≤0.1), and reviewer brand sign-off.

## 2. Stack (06, 07)
- **Default:** Astro 7 (TS strict), GSAP 3.15 (ScrollTrigger, SplitText), Lenis 1.3, CSS variables / Tailwind v4 optional.
- **3D at motion level 8+:** Three.js r186 (+ R3F 9/drei 10 only when React is needed), lazy-loaded, desktop-first with mobile stills.
- **Assets:** Poly Haven, Kenney, Quaternius and ambientCG (CC0) for free 3D and textures; Fontshare and Google Fonts; Imagine for stills and video; vtracer + SVGO for SVG.
- **Framework choice is explained:** Grok proposes Astro, Next.js or SvelteKit with trade-offs, and the user can override.
- D-001 withdrew the MIT fallback and the avoid Theatre advice. GSAP stays the base engine.

## 3. Interview structure (Don't Panic + Babel Fish)
Built from the Miro skeleton plus Matt's prompts (08, 09). Every question is skippable and has a **"Suggest for me"** option, and the interviewer pushes back on vague answers.
- **0 · Calibration:** experience level, prior websites, what they're bringing (uploads, URLs, Pinterest, X).
- **1 · Brand and assets:** logo, colors, slogan, mood board, fonts, voice ("if your brand were a person or animal"), the why (Golden Circle), other brands and competitors.
- **2 · Positioning and intent:** why this site; goal types (multi-select: sales, calls, reservations, leads, art/portfolio, content); KPIs; tools (intake form, store, special features such as MLS listings, video/media/portfolio).
- **3 · Competitors and SEO:** competitor URLs auto-crawled, blog yes/no, keyword blog offer.
- **4 · Taste:** reference sites; if they don't know, show 2 Godly + 2 Awwwards links per style world and ask why each one works for them.
- **5 · Motion:** effect types explained with examples, the 1–10 appetite scale, and the movie or choose-your-own-adventure option; 3D options (free GLB vs Tripo/Meshy vs none).
- **6 · Assets and budget:** Imagine comfort spend vs DIY prompts; collateral grading and auto-upscale.
- **7 · Limits:** deadline, hosting (Hostinger first), legal limits.

Babel Fish then runs Matt's 18 brand prompts as optional modules and produces the brand kit, voice kit and logo (Imagine concepts → clean SVG), with "happy with this? want me to elevate it?" at every step.

**Persona:** funny, artsy, a little autistic, pushy, kind. It replies in text only. The user talks via push-to-talk: local whisper.cpp by default (free), xAI STT optional ($0.10/hr REST).

## 4. Differentiators (12)
1. Agency-grade discovery and a brand brain that act as the constitution for every prompt. Competitors go prompt → page.
2. A motion literacy engine: an appetite scale mapped to a curated effect library with mobile and reduced-motion fallbacks, plus a strict **anti-slop rulebook** (no magnetic buttons, purple gradients, centered-blob heroes, slop words).
3. Real award references pulled into the conversation.
4. A reviewed, gated autopilot (GSD discipline plus Matt's proven Aura Homes workflow).
5. The user owns the code and can deploy anywhere, Hostinger first. Free and MIT.

## 5. Biggest risks
- Imagine API billing vs SuperGrok limits (DIY fallback).
- X API media/OAuth details and pay-per-use costs.
- gsd-core isn't Grok-native, so we port its formats rather than depend on it.
- Facebook-group assets (prompt-guide.md, the Aura Homes 55-prompt package) are needed as evals.
- Long builds risk token burn: keep each prompt under 200k tokens with a stable cached prefix.

## Reports
01 OpenGSD · 02 spec tools · 03 Awwwards anatomy · 04 motion taxonomy · 05 galleries · 06 library stack · 07 3D and assets · 08 brand intake · 09 AntiHero guides · 10 orchestration and QA · 11 integrations · 12 competitors.
