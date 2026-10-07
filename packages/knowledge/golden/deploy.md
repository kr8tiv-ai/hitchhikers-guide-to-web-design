# Goal

Deploy only after an explicit yes, and record the rollback.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: Deploy

Deploy only after an explicit yes. Record the host, the command, and the rollback in {{files}}. Confirm domain, DNS, email, analytics, and legal pages when this entry is the prelaunch check. After a deploy, check live routes, the form inbox, the analytics event, OG, and HTTPS when this entry is the post-deploy check. The host token stays in the environment. Treat it like a password. Do not paste it into the prompt, the repo, or the log. {{page}} is the production origin. {{section}} is this step. Do not import {{library}} onto {{element}}.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- Nothing deploys without an explicit yes, and the rollback is written down.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not write a token into source, fixtures, logs, or commits.
- Do not paste site-rules.ts into this prompt.

# Verify

Read the deploy note and confirm it names the rollback and does not contain a token.

<objective>
Deploy only after an explicit yes, and record the rollback.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: Deploy

Deploy only after an explicit yes. Record the host, the command, and the rollback in {{files}}. Confirm domain, DNS, email, analytics, and legal pages when this entry is the prelaunch check. After a deploy, check live routes, the form inbox, the analytics event, OG, and HTTPS when this entry is the post-deploy check. The host token stays in the environment. Treat it like a password. Do not paste it into the prompt, the repo, or the log. {{page}} is the production origin. {{section}} is this step. Do not import {{library}} onto {{element}}.
</task>

<must_haves>
truths:
- Nothing deploys without an explicit yes, and the rollback is written down.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not write a token into source, fixtures, logs, or commits.
</must_haves>

<verify>
Read the deploy note and confirm it names the rollback and does not contain a token.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
