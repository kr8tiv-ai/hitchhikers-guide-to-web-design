# Goal

Run the phone Lighthouse gate and the lab vitals.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: Phone gate

Run Lighthouse on real mobile for {{page}}. Lighthouse mobile 90 in all four categories: performance, accessibility, best practices, and SEO. Check LCP at most 2.5 seconds, CLS at most 0.1, and the INP lab proxy at most 200 milliseconds. Edit {{files}}. {{section}} is the page under test. Do not import {{library}} onto {{element}}. A desktop score is not the gate.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- The phone run is at least 90 in all four categories.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not treat a desktop score as the phone gate.
- Do not paste site-rules.ts into this prompt.

# Verify

Record the four phone scores and the three lab vitals in the test output.

<objective>
Run the phone Lighthouse gate and the lab vitals.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: Phone gate

Run Lighthouse on real mobile for {{page}}. Lighthouse mobile 90 in all four categories: performance, accessibility, best practices, and SEO. Check LCP at most 2.5 seconds, CLS at most 0.1, and the INP lab proxy at most 200 milliseconds. Edit {{files}}. {{section}} is the page under test. Do not import {{library}} onto {{element}}. A desktop score is not the gate.
</task>

<must_haves>
truths:
- The phone run is at least 90 in all four categories.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not treat a desktop score as the phone gate.
</must_haves>

<verify>
Record the four phone scores and the three lab vitals in the test output.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
