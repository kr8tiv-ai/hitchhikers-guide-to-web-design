/**
 * The one RULES block for every generated site prompt.
 * site-prompts.ts re-exports this constant. site-validate.ts requires
 * every SitePrompt.rules value to be this same string.
 * Bodies are authored later (092). This file does not describe a page.
 */

export const SITE_RULES = [
  "TypeScript strict. Do not use any.",
  "No secrets in source, fixtures, logs, or commits. Keys come from the environment or the OS keychain.",
  "MIT-compatible dependencies only. Before adding a package, check the registry: exact name, license field, repository URL, and that the repo is the project you meant. Record the result in NOTICE.",
  "GPL and AGPL are out. Apache-2.0, BSD, ISC, MIT, Unlicense, Zlib, and MPL-2.0 (file-level, noted in NOTICE) are allowed. Font files may be SIL OFL-1.1.",
  "Do not bundle @theatre/studio. Theatre runtime means @theatre/core only, pinned, never @latest.",
  "Motion toolkit (D-001): GSAP is the base engine, including ScrollTrigger, SplitText, and the other free plugins. Three.js, raw WebGL/GLSL, Motion, anime.js, Theatre.js core, Lenis, CSS scroll-driven animations, and vanilla JS all ship. The picker chooses per effect. Import only the libraries this prompt names. Do not load every motion library on this page.",
  "One scroll owner per page. One ticker. One WebGL context.",
  "Reduced motion stays visible and complete.",
  "Phone Lighthouse is at least 90 in performance, accessibility, best practices, and SEO.",
  "Anti-slop: no purple-to-blue gradients, no magnetic buttons, no default Tailwind indigo look, no invented testimonials, no lorem, and no exclamation marks in copy.",
].join("\n");
