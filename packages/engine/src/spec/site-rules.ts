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

/**
 * An unset owner contact stays a missing fact.
 * Reserved placeholder domains and 555- numbers are never invented.
 */
export const NO_INVENTED_CONTACT_RULE =
  "An unset owner fact is never replaced by an invented address, phone number, domain, or URL. Reserved forms are .example, .test, .invalid, example.com, example.org, and 555- numbers. Use the existing missing-fact state instead. A contact or inquiry form with no transport is shown, says sending is not connected yet, and offers the next real step.";

/** Component chrome speaks to the visitor about what they can do. */
export const CHROME_COPY_RULE =
  'Speak to the visitor in calm, warm, plain sentences about what they can do. Never describe the page, its layout, its colours, its position on screen, or what is "written here", "on this page", "held here", "not listed on this page", or "is not a pin". Never restate a requirement as copy.';

/** The legal disclaimer and the offer line are said once. */
export const OFFER_ONCE_RULE =
  "The legal disclaimer appears once in the footer and at most once next to the inquiry form. The offer line appears once per page. Other sections do not repeat them.";

/**
 * A listing with no real photos shows the owner's hero crop.
 * A concept still is not a listing photo, and a thin gallery is not rendered.
 */
export const LISTING_PHOTO_RULE =
  "When a listing has no real photos, use the owner's supplied hero image, cropped to fit, with a small Photos coming soon label. Never use a stock, generated, or concept image as a listing photo and never caption one concept. Do not render a gallery, carousel, or its controls when there are fewer than two real photos.";

/**
 * The home page shows listing cards and path cards.
 * Direction labels in the brief are instructions, not headings.
 */
export const HOME_STRUCTURE_RULE =
  "Show the listing cards using the shared card component, with the brief's fade-in, honouring prefers-reduced-motion. Present the site's main paths as calm cards with a short line and a link each, not a bare link list. Brief direction lines (Motion, Layout, Tone, Voice and similar labels) are instructions, never visible headings or copy.";

/** A listing page has one spec card and one inquiry form. */
export const LISTING_PAGE_RULE =
  "Exactly one spec card and exactly one inquiry form on the page. Known values are shown as values. A missing value reads Ask us in its own row once, not as a link repeated for every row. Sections do not re-render a block another section already shows.";

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
