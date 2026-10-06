# Prompt index

Run the files in this order. Each file is a fresh Grok Build session. Checkpoint rows are reviewer sessions (Zaphod) after every three build prompts within a phase and at each phase end (phase-end reviews run at xhigh). They are not feature work. The last file is the xhigh once-over.

Build prompts: 117. Reviewer checkpoints: 41. Once-over: 1. Files: 159.

| Phase | Build prompts | Review checkpoints | Once-over | Files |
|---|---:|---:|---:|---:|
| Don't Panic | 33 | 11 | 0 | 44 |
| Babel Fish | 17 | 6 | 0 | 23 |
| Deep Thought | 21 | 7 | 0 | 28 |
| Improbability Drive | 19 | 7 | 0 | 26 |
| Mostly Harmless | 13 | 5 | 0 | 18 |
| So Long and Thanks for All the Fish | 14 | 5 | 1 | 20 |
| **Total** | **117** | **41** | **1** | **159** |


## Critical path

The shortest chain that proves the Guide is real. Prompts off this chain are still required. A break off the chain blocks only the rows that list that dependency.

1. Repo, TypeScript, package boundaries, and CI (001–003, 005).
2. Config, the `STATE.md` lock, and `/hh-doctor` (006–009).
3. The Guide design system (010) and the Grok adapter (011), then the ACP client (013).
4. `interview/tree.yaml` covering DP-0.1 through DP-9.5 (014–017).
5. Interview engine, pushback, persona (018–021), the desk (030–033), the local server (034), and the live Guide (035).
6. Babel Fish compilers and the live brand modules (045–059, 061), logo export set (063), brand kit (065).
7. Motion spec with the coexistence rules (073, 074), site templates (086).
8. Site prompt skeleton and validator (090), then Grok-authored prompts (092) and the three-yes approval (093).
9. Headless runner, deny policy, git discipline, Marvin, Zaphod (096–113).
10. Real gates and the live drive, including real-mobile Lighthouse at 90 in all four categories and the console gate (122–124, 126).
11. Real deploy adapters behind a yes (140, 146).
12. Prompt 159, the xhigh once-over.

A break on this chain blocks later phases. A break off the chain blocks only its dependents, which are listed per row.

## All prompts

| # | Kind | Phase | Slice | Title | Tier | Effort | Depends on | Checkpoint |
|---|---|---|---|---|---|---|---|---|
| 001 | build | Don't Panic | Towel Check | Scaffold the MIT monorepo and NOTICE | Towel | medium | — | — |
| 002 | build | Don't Panic | Towel Check | Port GSD spine templates into the engine | Cup of Tea | medium | 001 | — |
| 003 | build | Don't Panic | Towel Check | Lock package boundaries and project references | Cup of Tea | medium | 001 | embedded + next file |
| 004 | checkpoint | Don't Panic | Zaphod | Review 001–003 | Heart of Gold | high | 001, 002, 003 | yes |
| 005 | build | Don't Panic | Towel Check | CI workflows | Cup of Tea | medium | 003 | — |
| 006 | build | Don't Panic | Towel Check | Validate .hitchhiker config.json | Cup of Tea | medium | 002 | — |
| 007 | build | Don't Panic | Towel Check | Lock STATE.md writes with a stale-pid takeover | Gargle Blaster | high | 002 | embedded + next file |
| 008 | checkpoint | Don't Panic | Zaphod | Review 005–007 | Heart of Gold | high | 005, 006, 007 | yes |
| 009 | build | Don't Panic | Towel Check | Add the hh binary and /hh-doctor probes | Gargle Blaster | high | 006, 007 | — |
| 010 | build | Don't Panic | Don't Panic Desk | Design the Guide's own brand and design system | Forty-Two | xhigh | 001 | — |
| 011 | build | Don't Panic | The Guide | Grok adapter for structured AI calls | Forty-Two | xhigh | 009, 006 | embedded + next file |
| 012 | checkpoint | Don't Panic | Zaphod | Review 009–011 | Heart of Gold | high | 009, 010, 011 | yes |
| 013 | build | Don't Panic | Eddie | Speak to grok agent over stdio ACP | Heart of Gold | xhigh | 011 | — |
| 014 | build | Don't Panic | The Guide | Write interview tree modules 0 and 1 | Gargle Blaster | high | 006 | — |
| 015 | build | Don't Panic | The Guide | Append interview modules 2 through 5 | Gargle Blaster | high | 014 | embedded + next file |
| 016 | checkpoint | Don't Panic | Zaphod | Review 013–015 | Heart of Gold | high | 013, 014, 015 | yes |
| 017 | build | Don't Panic | The Guide | Finish the tree, Guide Entry, and required fields | Gargle Blaster | high | 015 | — |
| 018 | build | Don't Panic | The Guide | Run the interview one question at a time | Heart of Gold | xhigh | 007, 017 | — |
| 019 | build | Don't Panic | The Guide | Push back on soft answers and write coverage | Gargle Blaster | high | 018 | embedded + next file |
| 020 | checkpoint | Don't Panic | Zaphod | Review 017–019 | Heart of Gold | high | 017, 018, 019 | yes |
| 021 | build | Don't Panic | The Guide | Write the Guide persona system prompt | Forty-Two | xhigh | 018 | — |
| 022 | build | Don't Panic | Sub-Etha | Wrap whisper.cpp for local push-to-talk | Heart of Gold | high | 009 | — |
| 023 | build | Don't Panic | Sub-Etha | Add an opt-in xAI speech-to-text adapter | Gargle Blaster | high | 022 | embedded + next file |
| 024 | checkpoint | Don't Panic | Zaphod | Review 021–023 | Heart of Gold | high | 021, 022, 023 | yes |
| 025 | build | Don't Panic | Sub-Etha | Ingest a brand PDF and grade an image file | Gargle Blaster | high | 006, 011 | — |
| 026 | build | Don't Panic | Vogon Neighbors | Crawl a public page with robots.txt and screenshots | Heart of Gold | high | 001 | — |
| 027 | build | Don't Panic | Vogon Neighbors | Turn a crawl into competitor and SEO notes | Gargle Blaster | high | 026 | embedded + next file |
| 028 | checkpoint | Don't Panic | Zaphod | Review 025–027 | Heart of Gold | high | 025, 026, 027 | yes |
| 029 | build | Don't Panic | Vogon Neighbors | Ship a curated gallery pack and a polite refresh hook | Gargle Blaster | high | 026 | — |
| 030 | build | Don't Panic | Don't Panic Desk | Build the local chat shell without a default theme | Gargle Blaster | high | 001, 010 | — |
| 031 | build | Don't Panic | Don't Panic Desk | Render one question card with Answer, Suggest, and Skip | Heart of Gold | xhigh | 018, 030, 010 | embedded + next file |
| 032 | checkpoint | Don't Panic | Zaphod | Review 029–031 | Heart of Gold | high | 029, 030, 031 | yes |
| 033 | build | Don't Panic | Don't Panic Desk | Show phase progress and resume from the home index | Gargle Blaster | high | 007, 030 | — |
| 034 | build | Don't Panic | Don't Panic Desk | Serve the companion app locally | Heart of Gold | high | 030, 031, 033, 007, 018 | — |
| 035 | build | Don't Panic | The Guide | Run the Guide live: persona, pushback, grounded Suggest, brief loop | Forty-Two | xhigh | 011, 013, 018, 019, 021, 029, 031, 034 | embedded + next file |
| 036 | checkpoint | Don't Panic | Zaphod | Review 033–035 | Heart of Gold | high | 033, 034, 035 | yes |
| 037 | build | Don't Panic | Point-of-View Gun | Gallery walk with clickable cards | Heart of Gold | high | 029, 034, 035 | — |
| 038 | build | Don't Panic | Pan Galactic Gargle Blaster | Motion family previews and the 1–10 slider | Heart of Gold | high | 010, 034 | — |
| 039 | build | Don't Panic | Ford's Field Notes | Pinterest, screenshots, and the mood analyzer | Gargle Blaster | high | 025, 026, 011 | embedded + next file |
| 040 | checkpoint | Don't Panic | Zaphod | Review 037–039 | Heart of Gold | high | 037, 038, 039 | yes |
| 041 | build | Don't Panic | Don't Panic Desk | Wire push-to-talk to the local transcriber | Heart of Gold | high | 022, 031, 034 | — |
| 042 | build | Don't Panic | Don't Panic Desk | Scaffold read-only X OAuth without posting | Gargle Blaster | high | 009 | — |
| 043 | build | Don't Panic | Don't Panic Desk | Prove the interview saves and resumes end to end | Heart of Gold | xhigh | 018, 019, 031, 033, 035 | embedded + next file |
| 044 | checkpoint | Don't Panic | Zaphod | Review 041–043 and close Don't Panic | Heart of Gold | xhigh | 041, 042, 043 | phase end |
| 045 | build | Babel Fish | Deep Why | Compile a one-sentence why and a longer finder | Gargle Blaster | high | 043 | — |
| 046 | build | Babel Fish | Heart of Gold | Draft archetype, positioning, and three story lengths | Gargle Blaster | high | 045 | — |
| 047 | build | Babel Fish | Heart of Gold | Fold competitor cards into the brand notes | Gargle Blaster | high | 027, 046 | embedded + next file |
| 048 | checkpoint | Babel Fish | Zaphod | Review 045–047 | Heart of Gold | high | 045, 046, 047 | yes |
| 049 | build | Babel Fish | Sens-O-Matic | Build palettes, type pairs, and contrast tokens | Gargle Blaster | high | 046 | — |
| 050 | build | Babel Fish | Sens-O-Matic | Write imagery rules and Imagine prompt stubs | Cup of Tea | medium | 049 | — |
| 051 | build | Babel Fish | Babel Voice | Compile VOICE.md and cut thirty taglines to five | Gargle Blaster | high | 045, 049 | embedded + next file |
| 052 | checkpoint | Babel Fish | Zaphod | Review 049–051 | Heart of Gold | high | 049, 050, 051 | yes |
| 053 | build | Babel Fish | Magrathean Logo Works | Price Imagine jobs and stop at the cap | Forty-Two | high | 006, 050 | — |
| 054 | build | Babel Fish | Magrathean Logo Works | List ten logo directions and render four flats | Heart of Gold | high | 053, 051 | — |
| 055 | build | Babel Fish | Magrathean Logo Works | Set the wordmark in a real font and trace the symbol | Forty-Two | xhigh | 054 | embedded + next file |
| 056 | checkpoint | Babel Fish | Zaphod | Review 053–055 | Heart of Gold | high | 053, 054, 055 | yes |
| 057 | build | Babel Fish | Hyperspace Bypass | Grade uploads and upscale with Real-ESRGAN, weights fetched on first use | Heart of Gold | high | 025, 053 | — |
| 058 | build | Babel Fish | Hyperspace Bypass | Block invented testimonials, awards, and metrics | Gargle Blaster | high | 046, 047 | — |
| 059 | build | Babel Fish | The Brand Brain | Compile BRAND.md under 1,500 words | Forty-Two | xhigh | 045, 046, 047, 049, 050, 051, 058 | embedded + next file |
| 060 | checkpoint | Babel Fish | Zaphod | Review 057–059 | Heart of Gold | high | 057, 058, 059 | yes |
| 061 | build | Babel Fish | Deep Why | Model-authored brand modules with validators | Forty-Two | xhigh | 011, 045, 046, 047, 049, 050, 051, 058 | — |
| 062 | build | Babel Fish | Hyperspace Bypass | Imagine asset jobs end to end | Heart of Gold | xhigh | 053, 050, 011 | — |
| 063 | build | Babel Fish | Magrathean Logo Works | Logo clean-up and export set | Heart of Gold | high | 055, 011 | embedded + next file |
| 064 | checkpoint | Babel Fish | Zaphod | Review 061–063 | Heart of Gold | high | 061, 062, 063 | yes |
| 065 | build | Babel Fish | The Brand Brain | Render the brand kit as an approval page with optional social frames | Heart of Gold | high | 059, 030, 055, 010, 063, 051 | — |
| 066 | build | Babel Fish | The Brand Brain | Approve each brand section before it leaves draft | Gargle Blaster | high | 059, 065 | embedded + next file |
| 067 | checkpoint | Babel Fish | Zaphod | Review 065–066 and close Babel Fish | Heart of Gold | xhigh | 065, 066 | phase end |
| 068 | build | Deep Thought | Seven and a Half Million Years | Write PROJECT, REQUIREMENTS, ROADMAP, and STATE for a site | Gargle Blaster | high | 002, 066 | — |
| 069 | build | Deep Thought | Seven and a Half Million Years | Generate the seventeen-section PRD and the assumptions list | Heart of Gold | high | 068, 059, 011 | — |
| 070 | build | Deep Thought | Seven and a Half Million Years | Write KPIS.md with ranges labeled as assumptions | Cup of Tea | medium | 069 | embedded + next file |
| 071 | checkpoint | Deep Thought | Zaphod | Review 068–070 | Heart of Gold | high | 068, 069, 070 | yes |
| 072 | build | Deep Thought | The Ultimate Question | Write the stack decision record | Gargle Blaster | high | 069 | — |
| 073 | build | Deep Thought | The Ultimate Question | Assign one library per effect in MOTION.md | Forty-Two | xhigh | 072, 017 | — |
| 074 | build | Deep Thought | The Ultimate Question | Encode the ticker, scroll, and WebGL coexistence rules | Heart of Gold | xhigh | 073 | embedded + next file |
| 075 | checkpoint | Deep Thought | Zaphod | Review 072–074 | Heart of Gold | high | 072, 073, 074 | yes |
| 076 | build | Deep Thought | Infinite Monkeys | Define the knowledge pack format | Cup of Tea | medium | 003 | — |
| 077 | build | Deep Thought | Infinite Monkeys | Add golden site prompts from Matt's method, with credit | Gargle Blaster | high | 076 | — |
| 078 | build | Deep Thought | Infinite Monkeys | Write the anti-slop, brand, and copy packs | Gargle Blaster | high | 076 | embedded + next file |
| 079 | checkpoint | Deep Thought | Zaphod | Review 076–078 | Heart of Gold | high | 076, 077, 078 | yes |
| 080 | build | Deep Thought | Reference Library | Write motion recipes for the full toolkit | Forty-Two | xhigh | 074, 076 | — |
| 081 | build | Deep Thought | Reference Library | Write stack usage notes for Astro, Next, and Vite | Gargle Blaster | high | 072, 076 | — |
| 082 | build | Deep Thought | Reference Library | Write typography, color, UX, and accessibility packs | Gargle Blaster | high | 076, 049 | embedded + next file |
| 083 | checkpoint | Deep Thought | Zaphod | Review 080–082 | Heart of Gold | high | 080, 081, 082 | yes |
| 084 | build | Deep Thought | Reference Library | Write SEO, sales, and award-site packs without fake numbers | Gargle Blaster | high | 076, 029 | — |
| 085 | build | Deep Thought | Earth Mk II Blueprints | 3D sourcing: CC0 GLBs and Tripo/Meshy tools | Heart of Gold | high | 073, 011 | — |
| 086 | build | Deep Thought | Infinite Monkeys | Site starter templates, feature recipes, tracking | Forty-Two | xhigh | 072, 074, 080, 081 | embedded + next file |
| 087 | checkpoint | Deep Thought | Zaphod | Review 084–086 | Heart of Gold | high | 084, 085, 086 | yes |
| 088 | build | Deep Thought | Earth Mk II Blueprints | Plan sections and name the hero Infinite Improbability | Gargle Blaster | high | 069, 073 | — |
| 089 | build | Deep Thought | Earth Mk II Blueprints | Assemble CONTEXT.md with anchors under the token budget | Heart of Gold | high | 069, 073, 088 | — |
| 090 | build | Deep Thought | Earth Mk II Blueprints | Generate the site prompt skeleton (50 to 150) and the package validator | Forty-Two | xhigh | 089, 074, 070, 077, 078, 080, 081, 082, 084 | embedded + next file |
| 091 | checkpoint | Deep Thought | Zaphod | Review 088–090 | Heart of Gold | high | 088, 089, 090 | yes |
| 092 | build | Deep Thought | Infinite Monkeys | Golden prompt library and Grok-authored site prompts | Forty-Two | xhigh | 090, 077, 076, 078, 080, 081, 082, 084, 011, 086 | — |
| 093 | build | Deep Thought | Approval Gate | Require a yes before Improbability Drive | Heart of Gold | high | 090, 089, 069, 010 | — |
| 094 | build | Deep Thought | Approval Gate | Edit a site prompt without losing its must_haves | Heart of Gold | high | 090, 093 | embedded + next file |
| 095 | checkpoint | Deep Thought | Zaphod | Review 092–094 and close Deep Thought | Heart of Gold | xhigh | 092, 093, 094 | phase end |
| 096 | build | Improbability Drive | Vogon Constructor Fleet | Launch one site prompt as a fresh headless session | Forty-Two | xhigh | 009, 094 | — |
| 097 | build | Improbability Drive | Vogon Constructor Fleet | Deny push, deploy, and unapproved destructive actions | Heart of Gold | xhigh | 096 | — |
| 098 | build | Improbability Drive | Vogon Constructor Fleet | Back up the branch and commit one prompt at a time | Heart of Gold | high | 097, 007 | embedded + next file |
| 099 | checkpoint | Improbability Drive | Zaphod | Review 096–098 | Heart of Gold | high | 096, 097, 098 | yes |
| 100 | build | Improbability Drive | Somebody Else's Problem Field | Discover and install tools, APIs, and MCP servers | Heart of Gold | high | 011, 097 | — |
| 101 | build | Improbability Drive | Vogon Constructor Fleet | Route effort, bump it once on retry, and gate the worktrees flag | Gargle Blaster | high | 096, 006, 098 | — |
| 102 | build | Improbability Drive | Vogon Constructor Fleet | Run preflight checks before the queue starts | Gargle Blaster | high | 098, 093 | embedded + next file |
| 103 | checkpoint | Improbability Drive | Zaphod | Review 100–102 | Heart of Gold | high | 100, 101, 102 | yes |
| 104 | build | Improbability Drive | Marvin | Detect stalls, crashes, and build failures | Heart of Gold | high | 096 | — |
| 105 | build | Improbability Drive | Marvin | Triage failures with three strikes and a rollback | Forty-Two | xhigh | 104, 098, 101 | — |
| 106 | build | Improbability Drive | Marvin | Write the escalation the user actually sees | Gargle Blaster | high | 105, 033 | embedded + next file |
| 107 | checkpoint | Improbability Drive | Zaphod | Review 104–106 | Heart of Gold | high | 104, 105, 106 | yes |
| 108 | build | Improbability Drive | Zaphod | Capture reviewer screenshots at four widths with same-environment baselines | Heart of Gold | high | 026 | — |
| 109 | build | Improbability Drive | Zaphod | Check a prompt's truths against evidence | Heart of Gold | high | 090 | — |
| 110 | build | Improbability Drive | Zaphod | Score the six pillars plus motion and brand | Heart of Gold | high | 109 | embedded + next file |
| 111 | checkpoint | Improbability Drive | Zaphod | Review 108–110 | Heart of Gold | high | 108, 109, 110 | yes |
| 112 | build | Improbability Drive | Zaphod | Lint generated copy for slop and allow Elevate only as a product name | Gargle Blaster | high | 078 | — |
| 113 | build | Improbability Drive | Zaphod | Write PASS, FIX, or ESCALATE after at most two fix rounds | Heart of Gold | high | 109, 110, 112 | — |
| 114 | build | Improbability Drive | Eddie | Read the drive queue from disk and schedule its reviews | Gargle Blaster | high | 007, 113, 090 | embedded + next file |
| 115 | checkpoint | Improbability Drive | Zaphod | Review 112–114 | Heart of Gold | high | 112, 113, 114 | yes |
| 116 | build | Improbability Drive | Eddie | Render the local drive dashboard | Heart of Gold | xhigh | 114, 030, 010, 034 | — |
| 117 | build | Improbability Drive | Eddie | Update STATE.md as each prompt finishes | Gargle Blaster | high | 114, 098 | — |
| 118 | build | Improbability Drive | Eddie | Show counts in subscription mode and measured tokens in API mode | Heart of Gold | high | 006, 116 | embedded + next file |
| 119 | checkpoint | Improbability Drive | Zaphod | Review 116–118 | Heart of Gold | high | 116, 117, 118 | yes |
| 120 | build | Improbability Drive | Eddie | Run the drive loop against a fixture spawn | Forty-Two | xhigh | 102, 105, 114, 117, 118 | embedded + next file |
| 121 | checkpoint | Improbability Drive | Zaphod | Review 120 and close Improbability Drive | Heart of Gold | xhigh | 120 | phase end |
| 122 | build | Mostly Harmless | Nutrimatic Test | Gate Lighthouse on real mobile runs: all four scores at 90 | Heart of Gold | xhigh | 074, 108 | — |
| 123 | build | Mostly Harmless | Nutrimatic Test | Check axe, keyboard, reduced motion, and contrast | Heart of Gold | high | 122, 049 | — |
| 124 | build | Mostly Harmless | Nutrimatic Test | Check titles, crawlable text, links, and weight budgets | Gargle Blaster | high | 122 | embedded + next file |
| 125 | checkpoint | Mostly Harmless | Zaphod | Review 122–124 | Heart of Gold | high | 122, 123, 124 | yes |
| 126 | build | Mostly Harmless | Vogon Constructor Fleet | Live drive, vision review, real gates, console gate, live dogfood | Forty-Two | xhigh | 096, 104, 105, 108, 109, 110, 113, 114, 120, 122, 123, 124, 011, 086 | — |
| 127 | build | Mostly Harmless | Total Perspective Vortex | Score the four-part jury | Gargle Blaster | high | 110, 122 | — |
| 128 | build | Mostly Harmless | Total Perspective Vortex | Plan at most eight Elevate upgrades | Gargle Blaster | high | 127, 078, 011 | embedded + next file |
| 129 | checkpoint | Mostly Harmless | Zaphod | Review 126–128 | Heart of Gold | high | 126, 127, 128 | yes |
| 130 | build | Mostly Harmless | Total Perspective Vortex | Apply an Elevate item only if the gates still pass | Heart of Gold | xhigh | 128, 123, 122 | — |
| 131 | build | Mostly Harmless | Slartibartfast's Fjords | Elevate loop live, detail pass, copy refinement | Heart of Gold | xhigh | 128, 130, 126 | — |
| 132 | build | Mostly Harmless | Before We Jump | Generate the last questions before launch | Gargle Blaster | high | 069, 059, 011 | embedded + next file |
| 133 | checkpoint | Mostly Harmless | Zaphod | Review 130–132 | Heart of Gold | high | 130, 131, 132 | yes |
| 134 | build | Mostly Harmless | Before We Jump | Before-we-jump at every phase start | Gargle Blaster | high | 132, 035, 034 | — |
| 135 | build | Mostly Harmless | Towel & Tea | Freeze the Towel and Tea eval fixture | Gargle Blaster | high | 043, 059 | — |
| 136 | build | Mostly Harmless | Towel & Tea | Replay Towel and Tea through brief and brand compilers | Heart of Gold | high | 135, 069, 073 | embedded + next file |
| 137 | checkpoint | Mostly Harmless | Zaphod | Review 134–136 | Heart of Gold | high | 134, 135, 136 | yes |
| 138 | build | Mostly Harmless | Towel & Tea | Add hh mostly-harmless and hh elevate commands with the QA report | Gargle Blaster | high | 132, 130, 122, 123, 124, 127 | embedded + next file |
| 139 | checkpoint | Mostly Harmless | Zaphod | Review 138 and close Mostly Harmless | Heart of Gold | xhigh | 138 | phase end |
| 140 | build | So Long and Thanks for All the Fish | Milliways at the End | Deploy to Hostinger only after a yes, then poll | Forty-Two | xhigh | 138, 097 | — |
| 141 | build | So Long and Thanks for All the Fish | Milliways at the End | Wrap Vercel, Netlify, and Cloudflare deploy clients behind a yes | Gargle Blaster | high | 140 | — |
| 142 | build | So Long and Thanks for All the Fish | Share and Enjoy | Generate DEPLOY.md and HANDOFF.md | Cup of Tea | medium | 140, 072 | embedded + next file |
| 143 | checkpoint | So Long and Thanks for All the Fish | Zaphod | Review 140–142 | Heart of Gold | high | 140, 141, 142 | yes |
| 144 | build | So Long and Thanks for All the Fish | Share and Enjoy | Draft a launch kit that does not auto-post | Gargle Blaster | high | 065, 142, 058 | — |
| 145 | build | So Long and Thanks for All the Fish | Share and Enjoy | Check a deployed URL with an injected fetch | Cup of Tea | medium | 140, 138 | — |
| 146 | build | So Long and Thanks for All the Fish | Milliways at the End | Real deploy adapters and post-deploy checks | Forty-Two | xhigh | 140, 141, 142, 145, 011 | embedded + next file |
| 147 | checkpoint | So Long and Thanks for All the Fish | Zaphod | Review 144–146 | Heart of Gold | high | 144, 145, 146 | yes |
| 148 | build | So Long and Thanks for All the Fish | NOTICE Board | Package the CLI so npx and hh install work | Heart of Gold | high | 009 | — |
| 149 | build | So Long and Thanks for All the Fish | NOTICE Board | Grok Build plugin command set | Heart of Gold | high | 148, 138, 009, 034 | — |
| 150 | build | So Long and Thanks for All the Fish | NOTICE Board | Write the README in the Guide's voice | Gargle Blaster | high | 021, 138, 148, 149 | embedded + next file |
| 151 | checkpoint | So Long and Thanks for All the Fish | Zaphod | Review 148–150 | Heart of Gold | high | 148, 149, 150 | yes |
| 152 | build | So Long and Thanks for All the Fish | Share and Enjoy | Reveals and agency exports | Heart of Gold | high | 065, 126, 146 | — |
| 153 | build | So Long and Thanks for All the Fish | Don't Panic Release | Agency-grade polish pass on the Guide app | Forty-Two | xhigh | 010, 030, 031, 033, 034, 037, 038, 065, 093, 116, 134, 152 | — |
| 154 | build | So Long and Thanks for All the Fish | Don't Panic Release | Scan for secrets, deny-list gaps, and keychain notes | Heart of Gold | high | 097, 148 | embedded + next file |
| 155 | checkpoint | So Long and Thanks for All the Fish | Zaphod | Review 152–154 | Heart of Gold | high | 152, 153, 154 | yes |
| 156 | build | So Long and Thanks for All the Fish | Don't Panic Release | Audit licenses and keep GPL and Theatre studio out | Heart of Gold | high | 001, 055, 080 | — |
| 157 | build | So Long and Thanks for All the Fish | Don't Panic Release | Write the release checklist and wire the root test | Heart of Gold | high | 140, 150, 154, 156, 120, 138 | embedded + next file |
| 158 | checkpoint | So Long and Thanks for All the Fish | Zaphod | Review 156–157 and close So Long and Thanks for All the Fish | Heart of Gold | xhigh | 156, 157 | phase end |
| 159 | once-over | So Long and Thanks for All the Fish | Forty-Two | Once-over: the Guide against the v2 spec | Forty-Two | xhigh | 158 | — |

## Renumbering map (plan v2 → v3)

v2 build ids and the new N01–N22 prompts map to v3 numbers as follows. Merged v2 prompts point at the prompt that absorbed them. v2 checkpoint files were regenerated.

| v2 / new id | v3 | Note |
|---|---|---|
| 001 | 001 |  |
| 002 | 002 |  |
| 003 | 003 |  |
| 005 | 006 |  |
| 006 | 007 |  |
| 007 | 009 |  |
| 009 | 014 |  |
| 010 | 015 |  |
| 011 | 017 |  |
| 013 | 018 |  |
| 014 | 019 |  |
| 015 | 021 |  |
| 017 | 022 |  |
| 018 | 023 |  |
| 019 | 025 |  |
| 021 | 026 |  |
| 022 | 027 |  |
| 023 | 029 |  |
| 025 | 030 |  |
| 026 | 031 |  |
| 027 | 033 |  |
| 029 | 041 |  |
| 030 | 042 |  |
| 031 | 043 |  |
| 033 | 045 |  |
| 034 | 046 |  |
| 035 | 047 |  |
| 037 | 049 |  |
| 038 | 050 |  |
| 039 | 051 |  |
| 041 | 053 |  |
| 042 | 054 |  |
| 043 | 055 |  |
| 045 | 057 |  |
| 046 | 058 |  |
| 047 | 059 |  |
| 049 | 065 |  |
| 050 | 065 | merged into v2 049 |
| 051 | 066 |  |
| 053 | 068 |  |
| 054 | 069 |  |
| 055 | 070 |  |
| 057 | 072 |  |
| 058 | 073 |  |
| 059 | 074 |  |
| 061 | 088 |  |
| 062 | 089 |  |
| 063 | 090 |  |
| 065 | 077 |  |
| 066 | 076 |  |
| 067 | 078 |  |
| 069 | 080 |  |
| 070 | 081 |  |
| 071 | 082 |  |
| 073 | 084 |  |
| 074 | 093 |  |
| 075 | 094 |  |
| 077 | 096 |  |
| 078 | 097 |  |
| 079 | 098 |  |
| 081 | 101 |  |
| 082 | 102 |  |
| 083 | 104 |  |
| 085 | 105 |  |
| 086 | 106 |  |
| 087 | 108 |  |
| 089 | 109 |  |
| 090 | 110 |  |
| 091 | 112 |  |
| 093 | 113 |  |
| 094 | 114 | merged into v2 095 |
| 095 | 114 |  |
| 097 | 116 |  |
| 098 | 117 |  |
| 099 | 118 |  |
| 101 | 013 |  |
| 102 | 101 | merged into v2 081 |
| 103 | 120 |  |
| 105 | 122 |  |
| 106 | 123 |  |
| 107 | 124 |  |
| 109 | 108 | merged into v2 087 |
| 110 | 127 |  |
| 111 | 128 |  |
| 113 | 130 |  |
| 114 | 132 |  |
| 115 | 135 |  |
| 117 | 136 |  |
| 118 | 138 | merged into v2 119 |
| 119 | 138 |  |
| 121 | 140 |  |
| 122 | 141 |  |
| 123 | 141 | merged into v2 122 |
| 125 | 141 | merged into v2 122 |
| 126 | 142 |  |
| 127 | 144 |  |
| 129 | 145 |  |
| 130 | 150 |  |
| 131 | 148 |  |
| 133 | 154 |  |
| 134 | 156 |  |
| 135 | 157 |  |
| 137 | 159 |  |
| N01 | 010 | new (steward review §E) |
| N02 | 034 | new (steward review §E) |
| N03 | 011 | new (steward review §E) |
| N04 | 035 | new (steward review §E) |
| N05 | 037 | new (steward review §E) |
| N06 | 038 | new (steward review §E) |
| N07 | 039 | new (steward review §E) |
| N08 | 061 | new (steward review §E) |
| N09 | 062 | new (steward review §E) |
| N10 | 063 | new (steward review §E) |
| N11 | 085 | new (steward review §E) |
| N12 | 086 | new (steward review §E) |
| N13 | 100 | new (steward review §E) |
| N14 | 092 | new (steward review §E) |
| N15 | 149 | new (steward review §E) |
| N16 | 126 | new (steward review §E) |
| N17 | 131 | new (steward review §E) |
| N18 | 134 | new (steward review §E) |
| N19 | 146 | new (steward review §E) |
| N20 | 005 | new (steward review §E) |
| N21 | 153 | new (steward review §E) |
| N22 | 152 | new (steward review §E) |
