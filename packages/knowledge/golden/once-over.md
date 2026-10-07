# Goal

Read the whole repo once for drift before the gates.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: Once-over

Read the requirements, the summaries, and the protected paths. Look for drift, dead code, token mismatches, and missed requirements. Write the fix list into {{files}}. Do not apply the fixes in this prompt. {{page}} and {{section}} name the scope of the note. Do not import {{library}} onto {{element}}.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- The note lists drift and does not change the site files.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not edit a protected path, and do not apply the fixes here.
- Do not paste site-rules.ts into this prompt.

# Verify

Confirm the diff is only {{files}}.

<objective>
Read the whole repo once for drift before the gates.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: Once-over

Read the requirements, the summaries, and the protected paths. Look for drift, dead code, token mismatches, and missed requirements. Write the fix list into {{files}}. Do not apply the fixes in this prompt. {{page}} and {{section}} name the scope of the note. Do not import {{library}} onto {{element}}.
</task>

<must_haves>
truths:
- The note lists drift and does not change the site files.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not edit a protected path, and do not apply the fixes here.
</must_haves>

<verify>
Confirm the diff is only {{files}}.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>
