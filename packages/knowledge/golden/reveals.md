# Goal

Add one reveal system with GSAP ScrollTrigger.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: Scroll reveals

Create a reusable reveal on {{element}} in {{section}} of {{page}}. Edit {{files}}. Import only {{library}}. Do not also bind this element with another library. (1) Headings: split text into lines (GSAP SplitText), each line masked and rising from below with a 0.06s stagger when it enters the viewport. (2) Images: a clip-path window opening from the center outward while the image inside scales from 1.1 to 1. (3) Cards in grids stagger by 0.1s. Each animation plays once. Reduced motion: everything is simply visible. Motion must feel confident and quick but never bouncy.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- The reveal plays once and reduced motion is simply visible.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not import a second motion library.
- Do not paste site-rules.ts into this prompt.

# Verify

Scroll {{element}} into view, then repeat with prefers-reduced-motion.

<objective>
Add one reveal system with GSAP ScrollTrigger.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: Scroll reveals

Create a reusable reveal on {{element}} in {{section}} of {{page}}. Edit {{files}}. Import only {{library}}. Do not also bind this element with another library. (1) Headings: split text into lines (GSAP SplitText), each line masked and rising from below with a 0.06s stagger when it enters the viewport. (2) Images: a clip-path window opening from the center outward while the image inside scales from 1.1 to 1. (3) Cards in grids stagger by 0.1s. Each animation plays once. Reduced motion: everything is simply visible. Motion must feel confident and quick but never bouncy.
</task>

<must_haves>
truths:
- The reveal plays once and reduced motion is simply visible.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not import a second motion library.
</must_haves>

<verify>
Scroll {{element}} into view, then repeat with prefers-reduced-motion.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
