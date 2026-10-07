# Goal

Drive one effect with CSS scroll-driven animation.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: CSS scroll

On {{element}} in {{section}} of {{page}}, use CSS animation-timeline. Add no package. Edit {{files}}. Import only {{library}}. Do not also bind this element with another library. This page does not also use Lenis. Animate only transform and opacity. Reduced motion: everything is simply visible.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- The page has one CSS scroll owner and no Lenis on the same page.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not add Lenis or a second scroll library.
- Do not paste site-rules.ts into this prompt.

# Verify

Scroll {{section}} and confirm the stylesheet is the only driver.

<objective>
Drive one effect with CSS scroll-driven animation.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: CSS scroll

On {{element}} in {{section}} of {{page}}, use CSS animation-timeline. Add no package. Edit {{files}}. Import only {{library}}. Do not also bind this element with another library. This page does not also use Lenis. Animate only transform and opacity. Reduced motion: everything is simply visible.
</task>

<must_haves>
truths:
- The page has one CSS scroll owner and no Lenis on the same page.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not add Lenis or a second scroll library.
</must_haves>

<verify>
Scroll {{section}} and confirm the stylesheet is the only driver.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
