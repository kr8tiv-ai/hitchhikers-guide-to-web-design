# 09 · AntiHero guides inventory (antihero.community)

Crawled 2026-10-05 (~23:15 CR time). Method: `robots.txt` (Allow: /) → `sitemap-index.xml` → `sitemap-0.xml` (29 URLs) → `/guides/`, `/prompts/`, `/videos/`, plus the individual video pages. The site runs **Astro v7.3.5** (generator meta tag) with Bebas Neue + Barlow fonts and theme color #0A0A0B, matching the brand guide's palette.

## 1. Files downloaded to `/workspace/context-engine/sources/`

| File | Pages | Words (text) | Guide date | Source |
|---|---|---|---|---|
| `website-on-autopilot.pdf` (+ `.txt`) | 30 | ~7.4k | 2026-10-02 | [/guides/website-on-autopilot.pdf](https://antihero.community/guides/website-on-autopilot.pdf) |
| `antihero-website-masterclass.pdf` (+ `.txt`) | 17 | ~3.0k | 2026-09-27 | [/guides/antihero-website-masterclass.pdf](https://antihero.community/guides/antihero-website-masterclass.pdf) |
| `build-a-brand-from-scratch-with-ai.pdf` (+ `.txt`) | 36 | ~8.1k | 2026-10-01 | [/guides/build-a-brand-from-scratch-with-ai.pdf](https://antihero.community/guides/build-a-brand-from-scratch-with-ai.pdf). Byte-identical to the attachment Matt provided |
| `email-the-channel-nobody-can-take.pdf` (+ `.txt`) | 18 | ~3.0k | 2026-09-29 | [/guides/email-the-channel-nobody-can-take.pdf](https://antihero.community/guides/email-the-channel-nobody-can-take.pdf) (bonus: relevant to the email integration) |
| `prompts.txt`, `guides.txt`, `videos.txt`, `sitemap-urls.txt` | | | | Text extracts of the site pages |

Not downloaded: *How to Take a Great Poop* (2026-09-30, "The Grok Bot special… Yes, that is the real title"), which is about Grok Bot rather than websites.

## 2. Site map (what exists)

- **Guides (5):** [Websites on Autopilot](https://antihero.community/guides/websites-on-autopilot/) · [Build a Brand From Scratch With AI](https://antihero.community/guides/build-a-brand-from-scratch-with-ai/) · [How to Take a Great Poop](https://antihero.community/guides/how-to-take-a-great-poop/) · [Email: The Channel Nobody Can Take](https://antihero.community/guides/email-the-channel-nobody-can-take/) · [AntiHero Website Masterclass](https://antihero.community/guides/antihero-website-masterclass/)
- **Prompts library ([/prompts/](https://antihero.community/prompts/)):** "Prompts that actually work. Tested on a live audience." Seven categories: **Websites 17 · Grok Build 23 · Grok Bot 14 · Brand 15 · Images and video 6 · Content and social 8 · Business 6.** Each card has a "Use it for" line, the full prompt, and the guide it came from.
- **Videos ([/videos/](https://antihero.community/videos/)):** replays are self-hosted MP4s (for example `/media/replays/websites-on-autopilot-live.mp4`). Websites on Autopilot live (55:19, 10-02) · Build a Brand live (47:21, 10-01) · Grok Bot team (42:39, 09-30) · Email channel (44:37, 09-29) · **3D website masterclass (1:56:09, 09-28)** · AntiHero website masterclass (1:35:09, 09-27) · Customers with zero ad spend (52:56, 09-26) · Why care about AI (36:41, 09-25) · AI tooling 101 + Antigravity demo (29:03, 09-24, Facebook only) · NotebookLM (17:21, 09-23). Clips: "a site from 20 minutes of questions" (10-03) and "What Grok built from a strawberry 3D model" (09-29). Plus promos.
- **Other pages:** /about/, /blog/, /credits/, /join/ (the Facebook group).

## 3. Guide summaries (process + reusable prompts)

### A. *Websites on Autopilot* (the core workflow for our app)
Subtitle: "The interview, the plan, every build prompt, the visuals, the autopilot loop, and the review. The exact workflow behind the Aura Homes site." The model: **"you make the decisions, and an AI does the typing, one small job at a time, while a second AI checks its homework."**

**Process (11 steps):**
- 00 **Pre-checklist**: brand first. Voice, logo (SVG + white version), colors and fonts, tagline and brand brain must all be done. Missing a piece: "Make a stand-in, mark it TODO."
- 01 **Glossary**: Grok Bot, Grok Build, Grok Imagine, Astro, GSAP, ScrollTrigger, Lenis, Three.js, Awwwards, RULES, TASK, COMMIT, localhost.
- 02 **Interview** (20–40 min, voice typing recommended).
- 03 **Section plan** with a Version 2 list.
- 04 **Write all the prompts**: one meta-prompt, one RULES paragraph, a stack of TASKs.
- 05 **Visuals**: Grok Imagine still first, then motion.
- 06 **Autopilot**: Grok Build builds, Grok Bot checks, you approve.
- 07 **Build prompts**: hero to 3D.
- 08 **Review and fix**.
- 09 **Make it stand out**: NO SLOP rules, visual and features interviews, elevation passes, jury review.
- 10 **Pick what you need**.
- 11 **Links**.

**The 32 prompts:**
- **01 Interview me about the site.** "You are a senior web designer and art director who has built sites that won Awwwards Site of the Day…" One question at a time; push back on vague answers. Covers 10 topics: purpose plus the one action; a specific visitor (wants, fears, device); offer; pages; vibe in 3 words plus 3 never-words; 3–5 reference sites and what exactly the user loves about each; existing assets; what must never change; **motion appetite 1–10** ("1 is a calm brochure, 10 is a 3D scroll movie"); hard limits. Output: a one-page **Site Brief**, then "ask me what you got wrong."
- **02 Section plan.** Per page: URL and one job. Per section: name, draft headline and copy in voice, visual type, **the one effect that earns its place (or "none")**, protected flag. Rules: the hero gets the most attention, max one wow per section, every page ends with the action, "small enough to ship in a weekend". Also lists every image and video with a Grok Imagine prompt and aspect ratio.
- **03 Write me all the build prompts (meta-prompt).** One RULES paragraph repeated word for word; numbered one-job prompts in build order (setup/backup → site map/nav → pages/sections → imagery → motion/effects → performance → credits → QA). Each block is RULES + `TASK:` + exact instructions with named files, components and routes, "what done looks like and what to report back". **"Never write 'as before' or 'see above'."** Borrowed items get credits in the same commit. Elevated by default (Awwwards SOTD). NO SLOP rules embedded.
- **04/05 RULES template plus the AntiHero version.** Brand and project type; **"Do NOT change [protected]"**; do not deploy; never delete (move to `/_archive`); fonts; colors with hex codes and 60/30/10; logo path; exact brand name; banned words and claims; tone; no em dashes or exclamation points; motion feel; reduced motion; transform/opacity only; elevated by default; NO SLOP; commit to git. On Aura Homes, all 55 prompts carried the protect-the-splash line, and the splash page stayed "byte for byte the same".
- **06/07 Hero still / scroll video** (Grok Imagine): no text in images; calm empty space; "slow, steady camera… no cuts, no shake"; 10 seconds; same light across all images.
- **08 The Watcher** (for Grok Bot): after each step, paste the report plus `git show --stat HEAD`. It answers: done vs the TASK's definition of done; protected files touched; RULES broken; what to check on localhost; an exact fix prompt; the next prompt number.
- **09–21 Build prompts:** 09 setup and backup (Astro, TS strict, folders, fonts, CSS variables); 10 hero (poster, contrast gradient, still on mobile); 11 nav (56px bar, frosted after 80px, hide on scroll down, full-screen menu <1024px with focus trap); 12 one section; 13 Lenis + ScrollTrigger + `motion.ts`; 14 reveals (SplitText line masks with 0.06s stagger, clip-path image windows, 0.1s card stagger); 15 scroll-scrubbed video (400vh sticky stage; ffmpeg `-g 1 -an`, 1920px, faststart; WebP frame fallback of 120–180 frames; copy at 20/50/80%); 16 page transitions (Astro ClientRouter, ~700ms, re-init GSAP/Lenis); 17 Three.js scene (desktop-only, Poly Haven HDRI, ACES/AgX, Draco/Meshopt, pause offscreen, mobile still, credits); 18 hover glow; 19 media/performance (AVIF/WebP 1280/1920/2560, AV1+H.264 under ~4 MB, LCP < 2.5s target); 20 credits page (typed `credits.ts`); 21 **QA with Playwright** (375/768/1440/1920; console errors and 404s; screenshots; links; alt text; keyboard menu; reduced-motion run; confirm protected files unchanged via git diff).
- **22 Fix list.** "Act as an Awwwards juror and my brand director." A numbered list where every fix is a ready-to-paste TASK.
- **23 NO SLOP RULES.** Bans: purple/rainbow gradients, a centered hero with a blob, 3 icon cards, emoji icons, slop words, lorem ipsum, stock laptop-pointers, the default Tailwind look, uniform section rhythm, invented testimonials and numbers. Requires: one bold idea per section, real copy, asymmetric layouts, a deliberate type scale, purposeful motion, brand-specific details, TODO instead of faking.
- **24 Visual interview** (8 questions, including the **signature moment**) → Visual Direction brief.
- **25 Standout features interview** (creative technologist; pick 3–5 of: hero interaction, scroll storytelling, cursor, 3D moment, micro-interactions, sound toggle, transitions, easter egg; each with phone weight and a reduced-motion version).
- **26–29 Elevation passes:** typography and spacing, motion, imagery, copy (in that order).
- **30 Awwwards jury** (3 judges; Design/Usability/Creativity/Content scored out of 10; "If it's a 6, say 6").
- **31 Fix list → build prompts.**
- **32 Post-launch upgrade interview.** The AI reviews the site cold first, then interviews; ≤8 upgrades ranked by impact vs effort.

**Rules of thumb:** effects come last; one wow per section; motion appetite 1–4 means reveals plus smooth scroll, 5–7 adds scroll video and transitions, 8–10 adds 3D; every heavy effect needs a calm phone version; ship v1. Grok Build install: `curl -fsSL https://x.ai/cli/install.sh | bash`, then `grok`. Use `/model` to switch; "Grok 4.7 Fast is great for quick jobs… Switch back to the bigger model for 3D, transitions and anything with 'refactor' in it."

### B. *AntiHero Website Masterclass* (Sept 27, the earlier Antigravity/Gemini version)
Nine steps, positioned as "zero to $20k":
1. Give your AI apps (MCP servers plus a **safety-check prompt before any install**).
2. Research with NotebookLM deep research (stack, architecture plan, build prompts, Google SEO plus AI search).
3. Collect references (Aura Build, Awwwards, Behance, Godly, Lapa Ninja, SiteInspire; **3–5 sites, not 20**; screenshots with notes; 2 fonts: Fontshare for headers, Google for body).
4. **Speak the stack** ("Astro… Vanilla JS… GSAP… Lenis… Three.js"; naming the stack "gets you a more polished project").
5. Hero first: a Grok-generated video loop from a photo; say the emotion, name and location; "make it good enough for Awwwards".
6. See it, fix it with screenshots, 1–2 changes at a time; the mobile pass prompt.
7. Polish layer: white space, marquee, scroll video, angled headline entrances, horizontal GSAP scroll, WebGL title glow, noise overlay, optional Pixabay ambient audio paused by default; "If an effect draws attention to itself… halve it".
8. SEO blog with Schema.org.
9. Deploy via the Hostinger API token ("Hostinger shows it only once").

**Reusable prompts:** MCP safety check, NotebookLM research, build from reference folder, stack loader, float a GLB, hero video, mobile pass, ambient sound, SEO blog, Hostinger deploy.

### C. *Build a Brand From Scratch With AI*
Full summary of the structure and all 18 prompts is in **08-brand-intake-frameworks.md**. Its output, the **brand brain**, is the hard prerequisite in step 00 of *Websites on Autopilot*.

### D. *Email: The Channel Nobody Can Take* (bonus)
Sections: own your audience; give first ("jab, jab, jab, right hook"); blog-to-email; deliverability (SPF/DKIM/DMARC); frequency and format; platform choice; AI writing in voice; a crew of specialist bots; learn from the best; signup form. The library prompt compares **Mailchimp, Kit, Klaviyo, Beehiiv, MailerLite, Brevo and Hostinger Reach**. This feeds report 11's email integration.

## 4. What the app should reuse directly
1. **Prompt 01 (site interview) and Prompt 24 (visual interview)** become interview modules B and C, each producing a brief.
2. **Prompt 02** becomes the section-plan generator. **Prompt 03 + RULES + NO SLOP** become the prompt-package generator (the "~100 prompts" are this, scaled up, with each section split into structure → copy → motion → polish prompts).
3. **Prompt 08 (Watcher)** becomes the reviewer agent's per-step contract. **Prompts 22/30/31** become the finishing pass. **Prompt 32** becomes a post-launch upsell.
4. **Prompts 09–21** become golden templates the prompt-writer adapts, so outputs are never generated from scratch.
5. The masterclass **MCP safety check** maps onto GSD's package-legitimacy gate (see 01).

## 5. Facebook group: not accessible to me; here's what would help
The AntiHero AI group ([facebook.com/groups/antiheroai](https://facebook.com/groups/antiheroai)) requires login, so I didn't access it. Useful items to export manually:
- **`prompt-guide.md`**, the copy-paste version of every prompt, explicitly referenced in *Websites on Autopilot* ("The full text of every prompt is also in prompt-guide.md in the group"), including the "updated RULES template and meta-prompt".
- **The Aura Homes build package**: the 55 prompts, Site Brief, Visual Direction brief and the Watcher transcripts. It's the best real-world eval set for our prompt generator.
- Member Site Briefs and before/after screenshots (homework posts) to tune the interview and reviewer.
- Transcripts of the lives. The MP4 replays on antihero.community (for example `/media/replays/3d-website-masterclass-live.mp4`, 1:56:09) could be transcribed with xAI speech-to-text instead, with Matt's permission.
- Q&A threads about failures (what broke, what fixed it) to seed the watchdog's error playbook.
