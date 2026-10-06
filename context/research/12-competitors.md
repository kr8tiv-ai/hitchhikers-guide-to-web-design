# 12 · Competitors and the gap

Research date: 2026-10-05. Quoted positioning comes from each product's own homepage meta description or page copy, fetched that day (dora.run blocked our fetcher, so its row uses search-result snippets). The **gap analysis is my assessment**, not a measured benchmark. I didn't run comparative builds.

## 1. Landscape

| Product | Self-description (quoted) | Output / lock-in | Interview depth | Motion / 3D | Brand depth |
|---|---|---|---|---|---|
| [Framer AI](https://www.framer.com/ai/) | "AI canvas agent… Generate editable pages, refine every detail on canvas, and publish with CMS, hosting, SEO, and analytics" | Framer-hosted; strong designer canvas | Prompt → page | Good native interactions, scroll effects and components; 3D via embeds | Style tokens; no strategy layer |
| [Wix Harmony](https://www.wix.com/harmony) / [Wix ADI](https://www.wix.com/adi) | "Move between vibe coding with an AI agent and drag and drop customization" | Wix-hosted | A short questionnaire (ADI); chat agent (Harmony) | Template animations | Logo maker and templates; little positioning work |
| [Relume](https://www.relume.io/) | "Build from the human-made component system behind 2M+ websites… export to Webflow, Figma & React" | Sitemap → wireframe → style guide; exports | Prompt → sitemap | Minimal (the component system is the point) | Style guide generation |
| [10Web](https://10web.io/) | "Unlock powerful tools for hosting, building, optimizing, and securing your site" (AI WordPress builder, white label, API) | WordPress/Elementor | Short prompt | Elementor-level | Low |
| [Durable](https://durable.com/) | "AI Business Builder… Create a website with AI, get discovered with SEO and GEO, manage customers" | Durable-hosted, plus a CRM | A few business questions | Minimal | Low (speed is the pitch) |
| [v0](https://v0.app/) | "Design, iterate, and scale full-stack applications for the web" | React/Next.js code, Vercel deploy, GitHub sync | Chat | Whatever you prompt for; React-centric | None unless supplied |
| [Lovable](https://lovable.dev/) | "Describe what you want in plain language and Lovable builds it: full-stack apps, websites and internal tools" | React + Supabase code, GitHub | Chat | Prompt-dependent | None unless supplied |
| [Bolt](https://bolt.new/) | "Build and scale high-performing websites & apps using your words" | Code in a browser IDE (WebContainers) | Chat | Prompt-dependent | None unless supplied |
| [Webflow AI](https://webflow.com/ai) | "Elevate web experiences with the power of AI" (AI site builder, AEO tools, MCP server) | Webflow-hosted | Prompt → site | Webflow Interactions; GSAP is "Supported by Webflow" ([gsap.com](https://gsap.com/)) | Brand-aware generation is limited |
| [Aura](https://www.aura.build/) | "AI landing page builder… Export to HTML & Figma" (claims 189,000 users) | HTML/Figma export | Prompt + templates | Tasteful animated landing sections; a gallery of "Aura" designs | Low |
| [Dora AI](https://www.dora.run/) | "Ship 3D animated websites without code" (search snippet) | dora.run hosting/subdomain; Figma import | Prompt | **Strongest 3D/scroll keyframes** in this group | Low |
| [Spline AI](https://spline.design/ai) | "Generate 3D models from a text prompt or an image. Pick from four looks" | 3D scenes / embeds | n/a | 3D assets, not sites | n/a |
| **Adjacent: spec-driven OSS** ([GSD](https://github.com/open-gsd), Spec Kit, Kiro, BMad, Taskmaster; see 02) | Spec → plan → execute → verify for coding agents | Your repo | Deep requirements/discuss phases | None (domain-agnostic) | None |

## 2. Where they fall short (my assessment)

1. **Interview depth.** Most tools go from one prompt to a page in seconds, which is the opposite of Matt's north star: "feels like a 2-hour meeting with the greatest brand agency on the planet, using the greatest AI on the planet." None of them runs a brand discovery like Matt's Prompt 02 (five rounds, with pushback and contradictions called out) or a Golden Circle / archetype / positioning pass before design. Durable and ADI ask a handful of business questions. Relume asks for a description.
2. **Brand as a constitution.** Generated sites inherit a theme, not a *brand brain* (voice traits, banned words, the why, 60-30-10 roles, imagery rules). Nobody carries a `BRAND.md` + `VOICE.md` into every generation step and audits against it, the way Matt's RULES paragraph and Brand Director prompt do.
3. **Motion literacy.** General code agents (v0, Lovable, Bolt) produce motion only as good as the prompt, usually default fades or the AI tropes the user wants banned (magnetic buttons, glow blobs, purple gradients). Framer, Webflow and Dora have real motion tooling, but users must design it. None asks "motion appetite 1–10" and maps the answer to a curated effect library with mobile and reduced-motion fallbacks.
4. **Award-level references.** None pulls real Awwwards/Godly examples into the conversation ("here are 2 from Godly, 2 from Awwwards, which do you like and why?") or extracts the *thinking* rather than the look.
5. **Assets.** Few tools generate a logo → clean SVG → full brand kit, plus hero stills and scroll video, under a budget ceiling, then grade and upscale weak user images.
6. **Process and QA.** Chat builders produce long single sessions with drifting context. No product executes a long, reviewed prompt queue (GSD-style specs, fresh context per step, a reviewer every 3 steps with desktop + mobile screenshots, a watchdog, Lighthouse/a11y/SEO gates) and proves "done".
7. **Ownership.** Framer, Wix, Webflow, Durable and Dora host and lock in. Our output is a plain repo (Astro by default) the user owns and can deploy anywhere, Hostinger first.
8. **Price.** Ours is free and open source (MIT). Users pay only for their own SuperGrok plan and any optional Imagine/3D API usage.

## 3. Where they're ahead (be honest)
- **Speed to first result.** Durable's "website in 30 seconds" pitch and v0/Bolt's instant previews. Mitigation: show a "first look" moodboard and hero still early in Babel Fish, and let users skip to a fast path.
- **Visual editing.** Framer, Webflow and Wix Harmony let non-coders drag and tweak. We rely on chat plus prompts. Mitigation: a dashboard with section-level "change this" requests, and Elevate passes.
- **Hosting, CMS and forms bundled.** We assemble third-party pieces (report 11), which adds setup friction.
- **Real-time collaboration and teams.** Out of scope for v1.
- **3D authoring.** Dora and Spline have visual 3D tools. We generate code and source GLBs.

## 4. Positioning for "The Hitchhiker's Guide to Web Design"
- **Category**: an open-source, spec-driven *agency in a box* for Grok Build. It isn't a site builder; it's the brief, brand, plan and QA department wrapped around the best coding agent.
- **Wedge**: the interview + brand brain + motion picker + reviewed autopilot. "Simple questions in, very technical websites out" (Matt Q6).
- **Proof to show**: Aura Homes (55 prompts, splash byte-identical, built with this workflow), plus side-by-side before/after Elevate passes and Lighthouse reports in the README.
- **Don't compete on**: hosting or a visual editor.
