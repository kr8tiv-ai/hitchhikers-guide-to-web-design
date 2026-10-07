# Goal

Keep the motion that has a job, and remove the rest.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: Motion pass

Audit every animation on {{section}}. Remove anything that moves just because it can. For what is left, give each one a job (guide the eye, reveal the story, or give feedback) and say which job in the report. Use one shared set of eases and durations from src/scripts/motion.ts. Stagger related elements, never animate everything at once, animate only transform and opacity, and make sure reduced motion gets a calm, complete version. Report what you removed, what you kept and what you added. Edit {{files}} for {{page}}. Import only {{library}} on {{element}} when this section already owns that library. Do not also bind this element with another library. At most eight ranked changes.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- Each remaining animation has a named job, and reduced motion stays complete.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not add a second library on {{element}}.
- Do not paste site-rules.ts into this prompt.

# Verify

Read the report and the diff. Confirm every new tween names its job.

<objective>
Keep the motion that has a job, and remove the rest.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: Motion pass

Audit every animation on {{section}}. Remove anything that moves just because it can. For what is left, give each one a job (guide the eye, reveal the story, or give feedback) and say which job in the report. Use one shared set of eases and durations from src/scripts/motion.ts. Stagger related elements, never animate everything at once, animate only transform and opacity, and make sure reduced motion gets a calm, complete version. Report what you removed, what you kept and what you added. Edit {{files}} for {{page}}. Import only {{library}} on {{element}} when this section already owns that library. Do not also bind this element with another library. At most eight ranked changes.
</task>

<must_haves>
truths:
- Each remaining animation has a named job, and reduced motion stays complete.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not add a second library on {{element}}.
</must_haves>

<verify>
Read the report and the diff. Confirm every new tween names its job.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
