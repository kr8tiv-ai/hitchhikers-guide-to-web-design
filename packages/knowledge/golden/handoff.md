# Goal

Write the handoff and the launch drafts. Do not post them.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: Handoff

Write how to edit content, run another upgrade pass, add a blog post, and renew the domain. Draft the launch kit in the brand voice and do not post it. Limit later upgrades to 8, ranked by impact versus effort. Protect everything that already works. Edit {{files}} for {{page}}. {{section}} is the handoff. Do not import {{library}} onto {{element}}.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- The handoff explains edits, posts, and renewal, and nothing is posted.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not post, and do not deploy from this prompt.
- Do not paste site-rules.ts into this prompt.

# Verify

Read {{files}} and confirm it says the drafts are not posted.

<objective>
Write the handoff and the launch drafts. Do not post them.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: Handoff

Write how to edit content, run another upgrade pass, add a blog post, and renew the domain. Draft the launch kit in the brand voice and do not post it. Limit later upgrades to 8, ranked by impact versus effort. Protect everything that already works. Edit {{files}} for {{page}}. {{section}} is the handoff. Do not import {{library}} onto {{element}}.
</task>

<must_haves>
truths:
- The handoff explains edits, posts, and renewal, and nothing is posted.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not post, and do not deploy from this prompt.
</must_haves>

<verify>
Read {{files}} and confirm it says the drafts are not posted.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
