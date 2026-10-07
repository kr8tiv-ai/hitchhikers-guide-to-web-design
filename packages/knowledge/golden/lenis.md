# Goal

Wire one smooth-scroll owner for the page.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: Smooth scroll foundation

Install Lenis and GSAP only if {{library}} is lenis. Wire Lenis to GSAP ScrollTrigger site-wide (lenis.on('scroll', ScrollTrigger.update) and drive Lenis from gsap.ticker). Create or extend src/scripts/motion.ts with shared eases, durations and a prefers-reduced-motion check. With reduced motion on, Lenis is disabled and scrolling is native. Anchor links must still land in the right place. Edit {{files}} for {{page}} and {{section}}. Do not also bind this element with another library. {{element}} uses this one scroll owner.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- The page has one scroll owner, and reduced motion uses native scrolling.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not add a second scroll library on {{page}}.
- Do not paste site-rules.ts into this prompt.

# Verify

Scroll {{page}} with and without prefers-reduced-motion. Confirm anchor links land.

<objective>
Wire one smooth-scroll owner for the page.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: Smooth scroll foundation

Install Lenis and GSAP only if {{library}} is lenis. Wire Lenis to GSAP ScrollTrigger site-wide (lenis.on('scroll', ScrollTrigger.update) and drive Lenis from gsap.ticker). Create or extend src/scripts/motion.ts with shared eases, durations and a prefers-reduced-motion check. With reduced motion on, Lenis is disabled and scrolling is native. Anchor links must still land in the right place. Edit {{files}} for {{page}} and {{section}}. Do not also bind this element with another library. {{element}} uses this one scroll owner.
</task>

<must_haves>
truths:
- The page has one scroll owner, and reduced motion uses native scrolling.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not add a second scroll library on {{page}}.
</must_haves>

<verify>
Scroll {{page}} with and without prefers-reduced-motion. Confirm anchor links land.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
