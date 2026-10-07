# Goal

Score the site the way a jury would, with the Guide weights.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: Jury

Score Design, Usability, Creativity, and Content. Weights are 40, 30, 20, and 10. Score it out of 10 on Design, Usability, Creativity and Content, the way Awwwards does, with two lines of honest reasoning for each score. Then tell me: the first impression in 3 seconds, the single thing holding it back the most, anything that looks like AI slop or a template, and what is already good enough to keep. Finish with a numbered fix list, most important first, each fix specific enough that a developer could do it without asking a question. No flattery. If it's a 6, say 6. Write the score into {{files}} for {{page}} and {{section}}. Do not import {{library}} onto {{element}}.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- The four scores use weights 40, 30, 20, and 10, and a 6 is called a 6.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not raise a score to be kind, and do not implement the fixes in this prompt.
- Do not paste site-rules.ts into this prompt.

# Verify

Read the score file and confirm the four weights and the numbered list.

<objective>
Score the site the way a jury would, with the Guide weights.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: Jury

Score Design, Usability, Creativity, and Content. Weights are 40, 30, 20, and 10. Score it out of 10 on Design, Usability, Creativity and Content, the way Awwwards does, with two lines of honest reasoning for each score. Then tell me: the first impression in 3 seconds, the single thing holding it back the most, anything that looks like AI slop or a template, and what is already good enough to keep. Finish with a numbered fix list, most important first, each fix specific enough that a developer could do it without asking a question. No flattery. If it's a 6, say 6. Write the score into {{files}} for {{page}} and {{section}}. Do not import {{library}} onto {{element}}.
</task>

<must_haves>
truths:
- The four scores use weights 40, 30, 20, and 10, and a 6 is called a 6.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not raise a score to be kind, and do not implement the fixes in this prompt.
</must_haves>

<verify>
Read the score file and confirm the four weights and the numbered list.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
