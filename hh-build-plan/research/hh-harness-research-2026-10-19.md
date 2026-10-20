# Harness research: Aura.build and peers, for the HH Web Design desk (2026-10-19)
Read-only public sources. Each idea gets an absolute usefulness score out of 10 for our goal (no curve). Anything scoring 7 or higher is marked IMPLEMENT. [UNVERIFIED] means I could not confirm it from a primary source.

## 1. Aura.build
Sources: https://www.aura.build , https://www.aura.build/ai-landing-page-builder , https://www.aura.build/pricing , https://www.aura.build/aura-vs-lovable-vs-figma-make-vs-v0 , review https://www.youtube.com/watch?v=bHMgWFIXhMg . The changelog page (https://www.aura.build/changelog) rendered empty through the fetch tool.
- **Ingredients first.** Before generating, the user picks a template, attaches a screenshot, adds a DESIGN.md or skill, and @-references sections or components "so the first generation has structure" (landing-page-builder page). The library claims 5,000+ templates, 2,800+ components and 30,000+ assets.
- **@ references to large code context.** The pricing FAQ example is "Create a landing page using @hero-section-template and @pricing-cards". Shift-click selects several items. You can also @ snippets, prior iterations and other chats. The pricing page also mentions "2,000 lines of code" of context.
- **Model picker.** The YouTube review saw model labels like "best for UI", "fastest" and "best for coding" (Gemini 3 Pro labelled best for UI). The homepage today shows "GPT-6.1 Sol" and a "Design System" toggle. Exact current routing is [UNVERIFIED].
- **Prompt Builder.** A structured prompt helper in the composer (seen in the review). Its internals are [UNVERIFIED].
- **Visual refinement after generation.** "Advanced Design Mode" lets you adjust spacing, type, sections, images, responsive behavior and copy "without restarting the whole build".
- **Motion and 3D.** The reviewer believes the WebGL hero effects come from Unicorn Studio embeds and cites a changelog line: "manage imported fonts and Unicorn Studio embeds". Fonts are importable and managed. Aura's internal 3D pipeline is [UNVERIFIED].
- **Outputs.** HTML/Tailwind/vanilla JS, publish with a domain, HTML export, Figma export, CMS, an assets generator.
- **Weaknesses reported.** Remixing or deleting content during edits, limited variant exploration (search synthesis of Trustpilot and the review).
- **Quality bar.** No published gates found. Quality comes from curated pro templates [UNVERIFIED that any automated QA exists].

## 2. Peers
**Anthropic frontend-design skill** (https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md)
- An explicit list of AI clusters to avoid: cream #F4F1EA with a terracotta accent, near-black with acid green, broadsheet hairlines, the SaaS card kit, ALL-CAPS eyebrows, middle-dot meta strings, a mono face for labels, "→" on CTAs.
- Two passes. First a 4–6 hex palette, type roles, ASCII wireframes and principles. Then a review of that plan against the brief, revising anything generic before any code is written.
- "Spend boldness in one place." One orchestrated motion moment, not a fade-up on every section. Remove one accessory.
- Copy rules: sentence case, active verbs, CTAs that name the outcome.
- Self-critique from screenshots.

**Taste Skill v2.1** (https://github.com/leonxlnx/taste-skill)
- Distilled from 247 curated sites, including Awwwards Sites of the Day.
- A script deals 3 of 20 researched directions and the agent picks one.
- One-sentence "idea" tying the client's own material to the direction.
- Real, credited open photos and footage.
- Real-browser check at 3 widths that fails slop. Frame checks: title on the first screen, equal margins, no random blank stretches.
- Screenshot loop: fix the top 3 problems, up to 3 rounds.
- Motion benchmarked on the latest 100 Awwwards SOTDs.
- Redesign mode records the existing page first and changes type, then color, then frame, then states, then stock components, with before/after proof.

**DESIGN.md spec** (https://github.com/google-labs-code/design.md)
- YAML tokens plus prose. Fixed section order: Overview, Colors, Typography, Layout, Elevation, Shapes, Components, Do's/Don'ts.
- `{token.ref}` references. Duplicate keys are an error, so it can be linted. Converts to Tailwind or Figma variables.

**v0** (https://v0.app/docs/design-systems-2 , https://v0.app/docs/api/v2/guides/design-systems)
- Design Systems 2.0 imports a repo, Figma, docs and a real consuming app into a saved "memory" skill, passed via `skills:[...]`.
- It asks follow-up questions during import.
- It warns against mixing contradictory sources.

**Relume** (https://www.relume.ai/export , https://www.relume.ai/?r=0 , https://webflow.com/integrations/relume)
- Brief → sitemap (every page and section scoped) → wireframes from real components with copy → style guide.
- "Assembled, not generated": the AI selects from 1,000+ human-built components with mobile variants rather than writing raw layout.
- Library exposed to agents through MCP.

**Lovable** (https://lovable.dev/blog/2025-01-16-lovable-prompting-handbook , https://docs.lovable.dev/prompting/prompting-one)
- Persistent Knowledge (PRD, flows, frontend guidelines).
- Section-by-section prompting ("a full-page prompt gets you noise").
- Plan mode and "ask me questions before building".

**Bolt** (https://support.bolt.new/prompting/prompting-effectively , https://bolt.new/blog/prompt-engineering-tips-for-bolt)
- Enhance Prompt: the user answers questions, Bolt returns a structured prompt.
- Target or lock files.
- Design-vocabulary glossary.
- Summarize and reset context.

**Awwwards evaluation** (https://www.awwwards.com/about-evaluation/)
- Design 40%, Usability 30%, Creativity 20%, Content 10%. Outlier jury scores are trimmed.

**Framer AI / Webflow AI** (https://www.framer.com/ai/ , https://www.framer.com/compare/framer-vs-webflow)
- Editable sections, CMS and animations on a canvas.
- Little public detail on internals [UNVERIFIED].

**Not researched this pass** [UNVERIFIED, no claims made]: Magic Patterns (beyond a search snippet: screenshots, select mode, design-system rules, rollback), Galileo/Stitch, Subframe, Codrops workflows, agency QA checklists, X posts from @aura or the founders.

## 3. Mechanisms: score / where our desk stands
1. **Plan-then-critique-the-plan before code** (Anthropic). Tokens and ASCII wireframes, then a "would any similar brief produce this?" revision. Desk: dense spec exists; no explicit genericness review of the plan. **9 IMPLEMENT**
2. **Screenshot fix loop: top 3 issues × max 3 rounds at 3 widths** (Taste). Desk: vision review and Elevate exist; a capped, prioritized loop at 3 widths is unclear. **9 IMPLEMENT**
3. **Codified AI-cluster blacklist as a gate** (Anthropic: palette and chrome tells). Desk: anti-slop text gate covers copy; visual tells probably not. **9 IMPLEMENT**
4. **Direction dealing: 3 of N researched directions from real SOTD study** (Taste). Desk: library has only 18 sites, so it falls short. **8 IMPLEMENT**
5. **Ingredients-first @ references to library sections and templates as code context** (Aura, Relume "assembled not generated"). Desk: @skill exists; @section-from-library likely not. **9 IMPLEMENT**
6. **Awwwards 40/30/20/10 rubric inside the beauty gate**. Desk: beauty gate exists; weighting is unknown. **8 IMPLEMENT**
7. **Sitemap → section wireframe → style guide staging with approval** (Relume). Desk: interview and spec partly cover this. **7 IMPLEMENT**
8. **DESIGN.md lint to the Google spec** (section order, token refs, no duplicate keys). Desk: DESIGN.md exists; validation is unknown. **7 IMPLEMENT**
9. **"One bold thing" and one orchestrated motion moment rule in motion.ts** (Anthropic). Desk: motion.ts exists. **8 IMPLEMENT**
10. **Frame checks: title above the fold, equal margins, no dead blank stretches** (Taste). Desk: Lighthouse and axe do not catch these. **8 IMPLEMENT**
11. **Section-scoped edits plus lock/target to stop regressions** (Lovable, Bolt; Aura's reported weakness). Desk: unclear. **7 IMPLEMENT**
12. **Real credited imagery and footage sourcing** (Taste). **7 IMPLEMENT**
13. **Redesign order: type → color → frame → states → components, with before/after** (Taste). **7 IMPLEMENT**
14. **Enhance-prompt Q&A for non-programmers** (Bolt). Desk: the interview already matches this. **6**
15. **WebGL via an embed tool such as Unicorn Studio** (Aura, per the reviewer). **6**
16. **Model routing labels by task** (Aura). **6**
17. **Figma/HTML export and hosted publish** (Aura, Relume). **5**
18. **Design-system import from repo or app as a memory skill** (v0). **5**

---
# Addendum (2026-10-19, 7:20 PM CST): filling the gaps
Same scoring as before: absolute usefulness out of 10, and 7 or higher is IMPLEMENT.

## Aura on X
I searched X with the public search_posts_all tool. "aura.build" returned 0 posts. "aura build" / aurabuild / url:aura.build returned only unrelated chatter (gaming "aura builds", a crypto token). I found no @aura or founder posts. Founder identity: [UNVERIFIED].

## Magic Patterns
Sources: https://www.magicpatterns.com/blog/introducing-magicos , https://www.magicpatterns.com/docs/documentation/magic-os/overview , https://www.magicpatterns.com/docs/documentation/design-systems/overview , https://www.youtube.com/watch?v=nB4FNx4hmLY
- **MagicOS (Oct 13, 2026).** A persistent canvas holding the PRD, inspiration, variants, rejected directions and final picks. A coordinator chat spins off parallel agent threads.
- **"Inspiration" command.** Turns one design into 4 variants, compared side by side.
- **Design System.** Holds components, typography, colors, plus "Rules" (spacing, visual style, brand voice applied to every design) and "Skills" that activate when a task matches their description. It can be seeded from GitHub, NPM, Figma or a website.
- **Hand-off.** The winner goes to a coding agent over MCP.

## Google Stitch (Galileo successor)
Sources: https://blog.google/innovation-and-ai/models-and-research/google-labs/stitch-ai-ui-design/ , https://blog.google/innovation-and-ai/models-and-research/google-labs/stitch-design-md/ , https://github.com/google-labs-code/design.md , https://stitch.withgoogle.com/llms.txt
- **Intent first.** You start from the business objective and "what you want users to feel", not a wireframe.
- **Adjective-driven, mood-based palettes and type.** Mood words like "Japandi" or "trustworthy and clinical" turn into palettes and type hierarchies.
- **Design system from any URL.** Stitch can pull a design system out of an existing site.
- **Agent manager.** Runs parallel directions.
- **Voice critique.** The agent can design a landing page by interviewing you, and can generate "three menu options" or alternative palettes on request.
- **Play-able prototypes.** Clickable flows that auto-generate the next screen.
- **DESIGN.md CLI.** Exports to Tailwind v3/v4 or DTCG. A separate `lint` command can gate on findings. Google says agents "can validate their choices against WCAG accessibility rules".
- The Galileo → Stitch lineage is widely reported, but I did not re-verify it in this pass [UNVERIFIED].

## Subframe
Sources: https://docs.subframe.com/develop/concepts/code-generation , https://docs.subframe.com/learn/guides/working-with-ai-agents , https://docs.subframe.com/agent/mcp-server , https://docs.subframe.com/develop/concepts/design-to-code
- **Deterministic code.** The design-to-code step uses no LLM: the same design always gives the same React/Tailwind. Interactive parts are headless Radix-based components, with accessibility built in.
- **`design_page`.** Generates variations onto a flow canvas. You can then combine variations, e.g. "header from variation 1 with layout from variation 3".
- **Components are synced; pages are exported.** Components come through the CLI and a breaking change raises TypeScript errors. Page updates use a re-implement prompt: "Preserve all existing functionality unless the new design requires a change."
- **Skills.** `/subframe:design`, `/subframe:develop` and `/subframe:install`, which configures theme, fonts and components.

## Codrops / Awwwards Academy
Sources: https://www.awwwards.com/academy/course/building-an-immersive-creative-website-from-scratch-without-frameworks , https://www.awwwards.com/academy/course/merging-webgl-and-html-worlds , https://tympanus.net/codrops/2021/08/16/abstract-image-carousel-ogl-glsl-gsap/
- **Academy courses.** Semantic views first, then reusable components, then GSAP motion, then a WebGL layer (OGL/Three) kept in sync with the DOM. Page transitions use Barba. The course-page details come from a search synthesis [partly UNVERIFIED].
- **Codrops pattern.** An OGL fullscreen shader driven by uTime/uProgress uniforms through gsap.ticker.

## Agency, jury and device QA
- **Active Theory (Luigi De Rosa interview).** Treat design references as directional and iterate in the browser. They test on old devices "down to iPhone 6" and use third-party physical device labs. Source: https://ensoul.it/luigi-de-rosa-from-active-theory-intention/ (the specifics come from a search synthesis, so I partly re-verified them [partly UNVERIFIED]).
- **Mobile Lighthouse on award studio sites** (DappaSol, Lighthouse 13.4.1, 4× CPU, 16 Sep 2026): Lusion 53, Locomotive 71, Active Theory 43, Basement 37. The heaviest real-time 3D scored worst. Their conclusion: write the phone target into the brief first. Source: https://dappasol.com/guides/cinematic-website-examples/
- **Third-party awwwards-skill** (https://github.com/SandroHub013/awwwards-skill):
  - 8 phases: concept, art direction, signature moment, build, craft, hardening, self-score, submission.
  - Reference files load only when a phase needs them.
  - Rationale: with 18+ jurors and the 3 extreme scores dropped, you win by giving no juror a reason to mark you down.
  - Real-Chrome audit: throttled cold load, breakpoint sweep from 320px, keyboard pass, reduced-motion pass, heading structure, measured LCP/CLS/INP, per-criterion self-score and the 3 highest-leverage fixes.
  - Thresholds it states: 6.5 or higher is an Honorable Mention, above 7 a Developer Award. These come from the skill, not from Awwwards [UNVERIFIED against Awwwards].
- **Awwwards Mobile Excellence checklist** (2017). It exists, but I did not open it. Listed at https://www.awwwards.com/blog/html5/?page=35 [contents UNVERIFIED].
- **Device and browser matrix.** P0: Chrome desktop and mobile, iPhone Safari, Chrome Android. P1: Firefox, Edge. Bugs are graded on a severity scale from Blocker to Trivial, and every fix is regression-retested. Source: https://www.browserstack.com/guide/how-to-perform-website-qa-testing
- **Launch checklist.** Every line must be yes/no with one owner. Run it on staging, then again on the live domain within the first hour. Design wishes are not launch checks. Source: https://zorko.app/blog/website-launch-qa-checklist
- **Visual QA.**
  - Check widths: 320–390, tablet, desktop.
  - Check portrait and landscape.
  - No unexplained horizontal scroll.
  - High-DPI image check.
  - Every state: hover, focus, active, disabled, loading, empty, success, error.
  - Zoom test.
  - Source: https://bugdrop.dev/resources/client-website-qa-checklist

## New mechanisms: scores
19. **Parallel variants and combine** (Magic Patterns Inspiration ×4; Subframe "header from v1 + layout from v3"; Stitch agent manager). Desk: Elevate refines one line and has no fork/merge step. **8 IMPLEMENT**
20. **Measured real-browser self-score per Awwwards criterion plus top-3 fixes.** Cold throttled load, 320px sweep, keyboard and reduced-motion passes (awwwards-skill). This extends our Lighthouse, axe and beauty gates into one scored report. **9 IMPLEMENT**
21. **"Give no juror a reason to mark you down" floor checklist.** Usability first, because outliers are trimmed (awwwards-skill). **7 IMPLEMENT**
22. **Phase-gated reference loading.** Load motion, WebGL or scroll references only in their phase (awwwards-skill). Fits @skill activation and keeps Grok's context lean. **7 IMPLEMENT**
23. **Phone performance budget written into the brief before any 3D.** Award studio sites scored 37–71 on mobile (DappaSol). Our ≥90 gate already exceeds them, but deciding the budget up front prevents rework. **8 IMPLEMENT**
24. **Device/browser matrix with iOS Safari as P0, plus a full state sweep** (all 8 states, portrait/landscape, 320px, zoom) (BrowserStack, BugDrop). Desk: Lighthouse mobile emulation does not cover Safari or states. **8 IMPLEMENT**
25. **Yes/no launch checklist run twice: staging, then the live domain within an hour** (Zorko). **7 IMPLEMENT**
26. **Severity-graded defect log with regression retest after each Elevate pass** (BrowserStack). **7 IMPLEMENT**
27. **Mood adjectives → palette and type in the interview for non-programmers** (Stitch). Partly covered by our interview and brand kit. **7 IMPLEMENT**
28. **Extract a design system from a reference URL to seed the brand kit or library** (Stitch, Magic Patterns). Also helps grow our 18-site library. **8 IMPLEMENT**
29. **DESIGN.md → Tailwind v4 / DTCG export via `@google/design.md` CLI, with `lint` as a gate** (Google). This strengthens idea #8. **8 IMPLEMENT**
30. **Design-system "Rules" plus auto-matching skills applied to every design** (Magic Patterns). We already match this with skill packs and @skill. **6**
31. **Persistent decision canvas that keeps rejected directions** (MagicOS). This also covers Anthropic's "jot notes about what you've tried". A simple decisions log is enough. **7 IMPLEMENT**
32. **Deterministic section rendering instead of LLM-written markup for library components** (Subframe; Relume "assembled"). High value, but a big build. **7 IMPLEMENT**
33. **Re-implement-without-regression prompt template: "Preserve all existing functionality unless…"** (Subframe). **7 IMPLEMENT**
34. **DOM-synced WebGL layer with teardown and GPU budget as a reusable recipe** (Awwwards Academy, Codrops, awwwards-skill). **7 IMPLEMENT**
35. **Voice interview and critique** (Stitch). **5**
36. **Clickable prototype flows** (Stitch Play). **4**
37. **Old-device and physical-lab testing down to an iPhone-6-class phone** (Active Theory). Useful, but too costly for us to run. A low-end throttled profile is the practical substitute. **6**
