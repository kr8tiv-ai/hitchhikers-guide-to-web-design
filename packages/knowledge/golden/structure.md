# Goal

Register pages and sections before any effect.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: Structure

Structure: site map, navigation, then each page and section. Register {{page}} and {{section}} in {{files}} with the component path and the one job of the section. Do not import {{library}} onto {{element}}. No effects yet.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- Each section id has one component path and one job.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not build the visual layout in this prompt.
- Do not paste site-rules.ts into this prompt.

# Verify

Read {{files}} and confirm {{section}} points at one component.

<objective>
Register pages and sections before any effect.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: Structure

Structure: site map, navigation, then each page and section. Register {{page}} and {{section}} in {{files}} with the component path and the one job of the section. Do not import {{library}} onto {{element}}. No effects yet.
</task>

<must_haves>
truths:
- Each section id has one component path and one job.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not build the visual layout in this prompt.
</must_haves>

<verify>
Read {{files}} and confirm {{section}} points at one component.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
