# Goal

Bind one anime.js effect on one element.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: anime.js effect

Import only {{library}} for {{element}} in {{section}} of {{page}}. Edit {{files}}. Do not also bind this element with another library. Animate only transform and opacity. The effect plays once. Duration stays under 700ms. Reduced motion: everything is simply visible. Motion must feel confident and quick but never bouncy.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- {{element}} has one anime.js effect and reduced motion stays visible.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not import a second motion library.
- Do not paste site-rules.ts into this prompt.

# Verify

Play the effect, then reload with prefers-reduced-motion.

<objective>
Bind one anime.js effect on one element.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: anime.js effect

Import only {{library}} for {{element}} in {{section}} of {{page}}. Edit {{files}}. Do not also bind this element with another library. Animate only transform and opacity. The effect plays once. Duration stays under 700ms. Reduced motion: everything is simply visible. Motion must feel confident and quick but never bouncy.
</task>

<must_haves>
truths:
- {{element}} has one anime.js effect and reduced motion stays visible.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not import a second motion library.
</must_haves>

<verify>
Play the effect, then reload with prefers-reduced-motion.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
