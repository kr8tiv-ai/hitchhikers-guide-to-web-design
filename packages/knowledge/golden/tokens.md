# Goal

Set color and type tokens from the approved brand.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: Tokens

Add CSS variables for every brand color in {{files}}. Record the type scale roles the brand already named. Use only brand fonts and colors on {{section}} of {{page}}. If a hex value is missing, mark it TODO. Do not import {{library}} onto {{element}}.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- Token names match the approved brand and missing values stay TODO.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not invent a hex, a font, or a gradient.
- Do not paste site-rules.ts into this prompt.

# Verify

Read {{files}} and confirm each variable traces to the brand notes for {{anchor}}.

<objective>
Set color and type tokens from the approved brand.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: Tokens

Add CSS variables for every brand color in {{files}}. Record the type scale roles the brand already named. Use only brand fonts and colors on {{section}} of {{page}}. If a hex value is missing, mark it TODO. Do not import {{library}} onto {{element}}.
</task>

<must_haves>
truths:
- Token names match the approved brand and missing values stay TODO.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not invent a hex, a font, or a gradient.
</must_haves>

<verify>
Read {{files}} and confirm each variable traces to the brand notes for {{anchor}}.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
