# Goal

Propose at most eight upgrades, ranked, and do not apply them all.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: Elevate plan

Review the live local site cold before changing it. Write an upgrade plan with no more than 8 upgrades, ranked by impact versus effort, each explained in one plain sentence. This prompt records the plan in {{files}}. It does not apply the upgrades. {{page}} and {{section}} are the scope. Do not import {{library}} onto {{element}}. Protect everything that already works. Do not write the word elevate in site copy. The name belongs to this pass only.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- The plan has at most eight ranked upgrades and changes no layout.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not apply the upgrades in this prompt, and do not put that product name in site copy.
- Do not paste site-rules.ts into this prompt.

# Verify

Count the upgrades in {{files}}. Confirm the count is at most 8 and the page files are untouched.

<objective>
Propose at most eight upgrades, ranked, and do not apply them all.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: Elevate plan

Review the live local site cold before changing it. Write an upgrade plan with no more than 8 upgrades, ranked by impact versus effort, each explained in one plain sentence. This prompt records the plan in {{files}}. It does not apply the upgrades. {{page}} and {{section}} are the scope. Do not import {{library}} onto {{element}}. Protect everything that already works. Do not write the word elevate in site copy. The name belongs to this pass only.
</task>

<must_haves>
truths:
- The plan has at most eight ranked upgrades and changes no layout.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not apply the upgrades in this prompt, and do not put that product name in site copy.
</must_haves>

<verify>
Count the upgrades in {{files}}. Confirm the count is at most 8 and the page files are untouched.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
