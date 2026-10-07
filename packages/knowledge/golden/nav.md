# Goal

Add the site nav from the route module.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: Navigation and menu

Build a slim top bar (about 56px): logo left, text links from the route module, and one outlined action on the right. Transparent over the hero, soft frosted background after 80px of scroll, hides on scroll down and comes back on scroll up. Under 1024px show only the logo and a Menu button that opens a full-screen menu with big links. Menu button: 44px minimum tap target, aria-expanded, Escape closes, focus stays inside the open menu and returns to the button on close. Add the same links to the footer. Edit {{files}} for {{page}}. The bar mounts in {{section}}. Do not import {{library}} onto {{element}} in this prompt. If scroll behavior needs a library, leave a TODO for the later motion prompt.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- The nav lists the real routes, traps focus when open, and closes on Escape.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not add a page that is not in the route module.
- Do not paste site-rules.ts into this prompt.

# Verify

Tab through the menu at 375 and at 1440. Confirm Escape returns focus to the button.

<objective>
Add the site nav from the route module.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: Navigation and menu

Build a slim top bar (about 56px): logo left, text links from the route module, and one outlined action on the right. Transparent over the hero, soft frosted background after 80px of scroll, hides on scroll down and comes back on scroll up. Under 1024px show only the logo and a Menu button that opens a full-screen menu with big links. Menu button: 44px minimum tap target, aria-expanded, Escape closes, focus stays inside the open menu and returns to the button on close. Add the same links to the footer. Edit {{files}} for {{page}}. The bar mounts in {{section}}. Do not import {{library}} onto {{element}} in this prompt. If scroll behavior needs a library, leave a TODO for the later motion prompt.
</task>

<must_haves>
truths:
- The nav lists the real routes, traps focus when open, and closes on Escape.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not add a page that is not in the route module.
</must_haves>

<verify>
Tab through the menu at 375 and at 1440. Confirm Escape returns focus to the button.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
