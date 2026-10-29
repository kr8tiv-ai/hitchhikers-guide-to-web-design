# Goal

Rewrite copy in the brand voice. Hide a missing fact or show an owner-neutral state, and never show TODO.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: Copy pass

Rewrite every headline, subline, button and caption on {{section}} in the brand voice. Remove every banned word and every generic line (Welcome to our website, We are passionate about, Learn more). Headlines: short, specific, a little surprising. Buttons: say exactly what happens (Book a call, not Submit). If a number, a name, or a quote is missing, hide that line or show Ask us linking to the inquiry form. Price on request only when the brief allows it. Do not invent it, and do not show TODO. Record the gap in .hitchhiker/MISSING-FACTS.md with the fact, the page, and the element. Report a before and after table. Edit {{files}} for {{page}}. Keep a ranked list. There is no fixed count. Rank the changes.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- Missing facts stay hidden or show as Ask us, and buttons say what happens.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not invent a number, a name, or a quote.
- Do not paste site-rules.ts into this prompt.

# Verify

Search {{files}} for a banned word and for a number that the brand notes do not contain.

<objective>
Rewrite copy in the brand voice. Hide a missing fact or show an owner-neutral state, and never show TODO.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: Copy pass

Rewrite every headline, subline, button and caption on {{section}} in the brand voice. Remove every banned word and every generic line (Welcome to our website, We are passionate about, Learn more). Headlines: short, specific, a little surprising. Buttons: say exactly what happens (Book a call, not Submit). If a number, a name, or a quote is missing, hide that line or show Ask us linking to the inquiry form. Price on request only when the brief allows it. Do not invent it, and do not show TODO. Record the gap in .hitchhiker/MISSING-FACTS.md with the fact, the page, and the element. Report a before and after table. Edit {{files}} for {{page}}. Keep a ranked list. There is no fixed count. Rank the changes.
</task>

<must_haves>
truths:
- Missing facts stay hidden or show as Ask us, and buttons say what happens.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not invent a number, a name, or a quote.
</must_haves>

<verify>
Search {{files}} for a banned word and for a number that the brand notes do not contain.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
