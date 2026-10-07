# Goal

Build one section layout with real structure and no effect.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: One section

Build the {{section}} component and add it to {{page}} in {{files}}. Purpose: the one job named in the section plan. Layout uses only brand fonts and colors. Mobile first, then desktop. No effects yet; motion comes in a later prompt. Do not import {{library}} onto {{element}}.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- The section has one job and sits on the named page only.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not add motion, a scroll library, or a second section.
- Do not paste site-rules.ts into this prompt.

# Verify

Load {{page}} and confirm {{section}} follows the previous section and nothing animates.

<objective>
Build one section layout with real structure and no effect.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: One section

Build the {{section}} component and add it to {{page}} in {{files}}. Purpose: the one job named in the section plan. Layout uses only brand fonts and colors. Mobile first, then desktop. No effects yet; motion comes in a later prompt. Do not import {{library}} onto {{element}}.
</task>

<must_haves>
truths:
- The section has one job and sits on the named page only.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not add motion, a scroll library, or a second section.
</must_haves>

<verify>
Load {{page}} and confirm {{section}} follows the previous section and nothing animates.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
