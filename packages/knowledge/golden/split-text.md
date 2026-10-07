# Goal

Split one heading into lines with GSAP SplitText.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: SplitText heading

On {{element}} in {{section}} of {{page}}, split the heading into lines with GSAP SplitText. Each line is masked and rises from below with a 0.06s stagger when it enters the viewport. The animation plays once. Edit {{files}}. Import only {{library}}. Do not also bind this element with another library. Reduced motion: everything is simply visible. Motion must feel confident and quick but never bouncy.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- The heading splits into lines once, and reduced motion shows the whole heading.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not split body copy, and do not add a second text library.
- Do not paste site-rules.ts into this prompt.

# Verify

Scroll the heading in, then reload with prefers-reduced-motion and read the full line.

<objective>
Split one heading into lines with GSAP SplitText.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: SplitText heading

On {{element}} in {{section}} of {{page}}, split the heading into lines with GSAP SplitText. Each line is masked and rises from below with a 0.06s stagger when it enters the viewport. The animation plays once. Edit {{files}}. Import only {{library}}. Do not also bind this element with another library. Reduced motion: everything is simply visible. Motion must feel confident and quick but never bouncy.
</task>

<must_haves>
truths:
- The heading splits into lines once, and reduced motion shows the whole heading.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not split body copy, and do not add a second text library.
</must_haves>

<verify>
Scroll the heading in, then reload with prefers-reduced-motion and read the full line.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
