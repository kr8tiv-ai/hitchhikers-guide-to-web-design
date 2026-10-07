# Goal

Add the document shell for the chosen stack.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: Document shell

Add the document shell in {{files}} for {{page}}. One skip link, one main landmark, and the font and token stylesheets. The shell names {{section}} as the outlet for later sections. Do not import {{library}} onto {{element}}. Do not add a page section in this prompt.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- Every route shares one shell with a skip link and a main landmark.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not add motion, a menu, or a second layout.
- Do not paste site-rules.ts into this prompt.

# Verify

Load {{page}} and tab to the skip link. Confirm the main landmark wraps the outlet.

<objective>
Add the document shell for the chosen stack.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: Document shell

Add the document shell in {{files}} for {{page}}. One skip link, one main landmark, and the font and token stylesheets. The shell names {{section}} as the outlet for later sections. Do not import {{library}} onto {{element}}. Do not add a page section in this prompt.
</task>

<must_haves>
truths:
- Every route shares one shell with a skip link and a main landmark.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not add motion, a menu, or a second layout.
</must_haves>

<verify>
Load {{page}} and tab to the skip link. Confirm the main landmark wraps the outlet.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>
