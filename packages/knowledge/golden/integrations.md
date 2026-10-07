# Goal

Wire one integration. Keys stay in the environment.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: Integration

Wire {{section}} for {{page}} in {{files}}. Read the key from the environment. Do not print it, log it, or commit it. If the key is absent, fail with a clear message and send nothing. Do not import {{library}} onto {{element}}.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- The integration reads its key from the environment and sends nothing when the key is absent.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not write a token into source, fixtures, logs, or commits.
- Do not paste site-rules.ts into this prompt.

# Verify

Run the dry path without a key and confirm it refuses to send.

<objective>
Wire one integration. Keys stay in the environment.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: Integration

Wire {{section}} for {{page}} in {{files}}. Read the key from the environment. Do not print it, log it, or commit it. If the key is absent, fail with a clear message and send nothing. Do not import {{library}} onto {{element}}.
</task>

<must_haves>
truths:
- The integration reads its key from the environment and sends nothing when the key is absent.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not write a token into source, fixtures, logs, or commits.
</must_haves>

<verify>
Run the dry path without a key and confirm it refuses to send.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>
