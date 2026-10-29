/**
 * The one RULES block for every generated site prompt.
 * site-prompts.ts re-exports this constant. site-validate.ts requires
 * every SitePrompt.rules value to be this same string.
 * Bodies are authored later (092). This file does not describe a page.
 */

/** A gap in the interview is recorded for the owner and never printed as a placeholder. */
export const MISSING_FACT_RULE =
  "A missing fact is never invented and never shown as TODO, a placeholder, or brackets to visitors. Hide the element, or show a graceful owner-neutral state (Ask us linking to the inquiry form, or Price on request only when the brief allows it). Record the gap in .hitchhiker/MISSING-FACTS.md with the fact, the page, and the element.";

export const MISSING_FACT_FALLBACK = `Only facts written in the interview. ${MISSING_FACT_RULE}`;

/** Visitor-facing text does not narrate the build, and plan metadata stays out of production HTML. */
export const VISITOR_COPY_RULE =
  "Visible copy speaks to the visitor only. No text about scripts, controls, implementation, build steps, prompts, TODO, environment variable names (PUBLIC_ or import.meta.env), file paths, or planning instructions. Plan metadata attributes (data-job, data-launch-check, data-component with source paths, and similar) are not rendered in production builds. They stay dev-only or are stripped.";

export const SITE_RULES = [
  "TypeScript strict. Do not use any.",
  "No secrets in source, fixtures, logs, or commits. Keys come from the environment or the OS keychain.",
  "MIT-compatible dependencies only. Before adding a package, check the registry: exact name, license field, repository URL, and that the repo is the project you meant. Record the result in NOTICE.",
  "GPL and AGPL are out. Apache-2.0, BSD, ISC, MIT, Unlicense, Zlib, and MPL-2.0 (file-level, noted in NOTICE) are allowed. Font files may be SIL OFL-1.1.",
  "Do not bundle @theatre/studio. Theatre runtime means @theatre/core only, pinned, never @latest.",
  "The full motion toolkit is available. Any appropriate library may be used (GSAP, Three.js or React Three Fiber, Motion, Lenis, Astro, vanilla JS, Howler and others). Pick what serves the art direction and go beyond the references. One scroll owner, one ticker and one WebGL context per page.",
  "Reduced motion stays visible and complete.",
  "Phone Lighthouse is at least 90 in performance, accessibility, best practices, and SEO.",
  "Anti-slop: no purple-to-blue gradients, no magnetic buttons, no default Tailwind indigo look, no invented testimonials, no lorem, and no exclamation marks in copy.",
  `No invented facts, numbers, names, quotes, prices or testimonials. ${MISSING_FACT_RULE}`,
  "A real person, place, product or listing is never generated.",
  VISITOR_COPY_RULE,
  "The workspace is this folder only: use relative paths, do not read or list the parent folder, sibling projects, dot-folders such as .agents or .claude, or other drives, keep any temporary or commit-message files inside .hitchhiker/tmp or pass git commit -m directly, never write to OS temp folders such as AppData/Local/Temp or /tmp, and if something is missing, say so in the report and keep going.",
].join("\n");
