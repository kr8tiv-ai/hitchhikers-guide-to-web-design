# Goal

Add a blog directory with Schema.org on each article.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: SEO blog

Add a blog directory so a person can read the posts the plan already named. Ensure every single article page uses standard Schema.org markup. Use BlogPosting only when the page is a real post. One title, one description, one h1. Edit {{files}} for {{page}} and {{section}}. Do not invent a search volume or promise a rank. Do not import {{library}} onto {{element}}.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- Each article has schema only when it is a real post, plus one h1.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not invent a post, an author, or a search volume.
- Do not paste site-rules.ts into this prompt.

# Verify

Open one article and confirm the JSON-LD type is BlogPosting and the h1 count is one.

<objective>
Add a blog directory with Schema.org on each article.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: SEO blog

Add a blog directory so a person can read the posts the plan already named. Ensure every single article page uses standard Schema.org markup. Use BlogPosting only when the page is a real post. One title, one description, one h1. Edit {{files}} for {{page}} and {{section}}. Do not invent a search volume or promise a rank. Do not import {{library}} onto {{element}}.
</task>

<must_haves>
truths:
- Each article has schema only when it is a real post, plus one h1.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not invent a post, an author, or a search volume.
</must_haves>

<verify>
Open one article and confirm the JSON-LD type is BlogPosting and the h1 count is one.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
