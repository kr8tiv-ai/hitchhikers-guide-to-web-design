# Goal

Record the approved page ids and titles.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: Routes

Write the approved page ids and titles into {{files}}. {{page}} is one id. {{section}} is not a route. Do not import {{library}} onto {{element}}. Do not create the page files in this prompt.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- The route module lists only approved page ids and titles.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not add a page the plan did not name.
- Do not paste site-rules.ts into this prompt.

# Verify

Read {{files}} and match each id to the section plan.

<objective>
Record the approved page ids and titles.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: Routes

Write the approved page ids and titles into {{files}}. {{page}} is one id. {{section}} is not a route. Do not import {{library}} onto {{element}}. Do not create the page files in this prompt.
</task>

<must_haves>
truths:
- The route module lists only approved page ids and titles.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not add a page the plan did not name.
</must_haves>

<verify>
Read {{files}} and match each id to the section plan.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>
