# Goal

Turn one review note into one ready-to-paste fix.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: Fix list

Give a numbered fix list, most important first. Each fix must be specific (headline is 14 words, cut to 6, not a vague note) and written as a ready-to-paste TASK with the RULES paragraph on top. Also tell me what to keep so I do not break the good stuff. This prompt applies one fix only, in {{files}}, for {{section}} on {{page}}. Do not import {{library}} onto {{element}}.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- One specific fix lands, and the notes say what was kept.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not apply a second fix, and do not touch a protected path.
- Do not paste site-rules.ts into this prompt.

# Verify

Read the diff and confirm it matches the one numbered fix.

<objective>
Turn one review note into one ready-to-paste fix.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: Fix list

Give a numbered fix list, most important first. Each fix must be specific (headline is 14 words, cut to 6, not a vague note) and written as a ready-to-paste TASK with the RULES paragraph on top. Also tell me what to keep so I do not break the good stuff. This prompt applies one fix only, in {{files}}, for {{section}} on {{page}}. Do not import {{library}} onto {{element}}.
</task>

<must_haves>
truths:
- One specific fix lands, and the notes say what was kept.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not apply a second fix, and do not touch a protected path.
</must_haves>

<verify>
Read the diff and confirm it matches the one numbered fix.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
