# Goal

Bind one effect with vanilla JS and no motion package.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: Vanilla effect

On {{element}} in {{section}} of {{page}}, write the effect in vanilla JS. Add no package. Edit {{files}}. Import only {{library}}. Do not also bind this element with another library. Animate only transform and opacity. The effect plays once. Reduced motion: everything is simply visible.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- The effect adds no package and plays once.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not import a motion library.
- Do not paste site-rules.ts into this prompt.

# Verify

Confirm package.json did not change, then scroll {{element}} into view.

<objective>
Bind one effect with vanilla JS and no motion package.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: Vanilla effect

On {{element}} in {{section}} of {{page}}, write the effect in vanilla JS. Add no package. Edit {{files}}. Import only {{library}}. Do not also bind this element with another library. Animate only transform and opacity. The effect plays once. Reduced motion: everything is simply visible.
</task>

<must_haves>
truths:
- The effect adds no package and plays once.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not import a motion library.
</must_haves>

<verify>
Confirm package.json did not change, then scroll {{element}} into view.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
