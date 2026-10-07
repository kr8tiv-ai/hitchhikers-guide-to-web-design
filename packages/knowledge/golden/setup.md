# Goal

Set up the project and the first backup commit.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: Project setup and backup

Create the site in this folder from the chosen stack template (TypeScript strict). Set up git, a .gitignore for node_modules and .env, and make a first commit called "Fresh start". Create /src/assets/logo, /src/assets/img, /public/media and /_archive. Copy logo files into /src/assets/logo. Tell me the command to run the site locally and the URL. Touch only {{files}} for {{page}}. Do not import {{library}} onto {{element}}.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- The repo has a first commit, the asset folders, and a local run command.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not deploy. Do not delete files. Move unused files to /_archive.
- Do not paste site-rules.ts into this prompt.

# Verify

Run the local command. Confirm git status is clean except {{files}}, and the Fresh start commit exists.

<objective>
Set up the project and the first backup commit.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: Project setup and backup

Create the site in this folder from the chosen stack template (TypeScript strict). Set up git, a .gitignore for node_modules and .env, and make a first commit called "Fresh start". Create /src/assets/logo, /src/assets/img, /public/media and /_archive. Copy logo files into /src/assets/logo. Tell me the command to run the site locally and the URL. Touch only {{files}} for {{page}}. Do not import {{library}} onto {{element}}.
</task>

<must_haves>
truths:
- The repo has a first commit, the asset folders, and a local run command.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not deploy. Do not delete files. Move unused files to /_archive.
</must_haves>

<verify>
Run the local command. Confirm git status is clean except {{files}}, and the Fresh start commit exists.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
