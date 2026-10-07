# Goal

Add one SEO item with a real title, description, and canonical.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: SEO item

Add {{section}} in {{files}} for {{page}}. One title, one meta description, one h1, and a canonical URL that points at that page. Do not invent a search volume or a rank. If a fact is missing, mark it TODO. Do not import {{library}} onto {{element}}.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- The page has one title, one description, one h1, and one canonical.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not invent a search volume, a rank, or a second h1.
- Do not paste site-rules.ts into this prompt.

# Verify

View source for {{page}} and count titles, descriptions, and h1 elements.

<objective>
Add one SEO item with a real title, description, and canonical.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: SEO item

Add {{section}} in {{files}} for {{page}}. One title, one meta description, one h1, and a canonical URL that points at that page. Do not invent a search volume or a rank. If a fact is missing, mark it TODO. Do not import {{library}} onto {{element}}.
</task>

<must_haves>
truths:
- The page has one title, one description, one h1, and one canonical.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not invent a search volume, a rank, or a second h1.
</must_haves>

<verify>
View source for {{page}} and count titles, descriptions, and h1 elements.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>
