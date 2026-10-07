# Goal

Add one form that asks permission and stores no secrets in the repo.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: Form

Add one form for {{section}} on {{page}} in {{files}}. Collect only the fields the plan named. Make sure it gets permission and follows the email marketing rules when it collects an address. The submit control says what happens. Errors sit on the fields. Do not import {{library}} onto {{element}}. Do not write a key into source.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- The form posts the named fields and shows an error on the field that failed.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not invent a testimonial, and do not store a secret in the repo.
- Do not paste site-rules.ts into this prompt.

# Verify

Submit an empty form and a valid one. Confirm the empty case names the field.

<objective>
Add one form that asks permission and stores no secrets in the repo.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: Form

Add one form for {{section}} on {{page}} in {{files}}. Collect only the fields the plan named. Make sure it gets permission and follows the email marketing rules when it collects an address. The submit control says what happens. Errors sit on the fields. Do not import {{library}} onto {{element}}. Do not write a key into source.
</task>

<must_haves>
truths:
- The form posts the named fields and shows an error on the field that failed.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not invent a testimonial, and do not store a secret in the repo.
</must_haves>

<verify>
Submit an empty form and a valid one. Confirm the empty case names the field.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
