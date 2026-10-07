# Goal

Add one feature component and no second job.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: Feature

Add the named feature on {{page}} in {{section}}. Edit only {{files}}. Say what the visitor sees, where it lives, and the calm phone version. If a fact is missing, mark it TODO. Do not import {{library}} onto {{element}}. Keys come from the environment.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- The feature does one job and leaves missing facts as TODO.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not add a second feature in this prompt.
- Do not paste site-rules.ts into this prompt.

# Verify

Load {{page}} and use the feature once at 375 and at 1440.

<objective>
Add one feature component and no second job.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: Feature

Add the named feature on {{page}} in {{section}}. Edit only {{files}}. Say what the visitor sees, where it lives, and the calm phone version. If a fact is missing, mark it TODO. Do not import {{library}} onto {{element}}. Keys come from the environment.
</task>

<must_haves>
truths:
- The feature does one job and leaves missing facts as TODO.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not add a second feature in this prompt.
</must_haves>

<verify>
Load {{page}} and use the feature once at 375 and at 1440.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>
