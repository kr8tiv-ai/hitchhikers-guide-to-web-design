# Goal

Open every page in a real browser and catch what broke. Pass Lighthouse mobile 90 in all four categories on real mobile runs.

# Files

- tests/qa.spec.ts
- /qa/screenshots

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: QA pass

Install Playwright as a dev dependency. Write tests/qa.spec.ts that, for every page at 375px, 768px, 1440px and 1920px: loads the page, fails on any console error or 404, takes a full-page screenshot into /qa/screenshots, checks every internal link resolves, checks every image has alt text, and checks the menu opens and closes with the keyboard. Also run it once with reduced motion on. Run npm run build, then the tests. Fix anything you broke. Report what you fixed and anything you need me to decide. Confirm with git diff that the protected files are unchanged.

Run Lighthouse on real mobile. Lighthouse mobile 90 in all four categories: performance, accessibility, best practices, and SEO. Zero console errors at 375 and at 1440. Run axe. Any serious or critical axe issue is a failure.

No em dashes, no exclamation points.

# must_haves

truths:

- Every page loads at 375 and at 1440 with zero console errors.
- Lighthouse mobile 90 holds in all four categories on real mobile runs.
- axe reports nothing serious or critical.
- The menu opens and closes from the keyboard, including with reduced motion on.

artifacts:

- tests/qa.spec.ts
- /qa/screenshots at 375 and at 1440

key_links:

- The suite walks 375 and 1440 for every page.
- The phone gate is a real mobile Lighthouse run, a median of three runs, not a desktop score.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not skip 375 or 1440.
- Do not ship with console errors.
- Do not treat a desktop Lighthouse score as the real mobile gate.
- Do not paste site-rules.ts into this prompt.

# Verify

Run npm run build, the Playwright tests, axe, and Lighthouse on real mobile. All four scores are at least 90. Console errors are zero at 375 and at 1440. Protected files are unchanged in git diff.

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
