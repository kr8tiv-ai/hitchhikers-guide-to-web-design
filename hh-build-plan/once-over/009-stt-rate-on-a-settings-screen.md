# 009. No settings screen shows the speech-to-text rate

Status: **applied** in the post-159 pass.

## Miss

v2 §4 says the settings screen shows the xAI speech-to-text rate before that engine is enabled. Local whisper.cpp stays the default.

`packages/voice/src/xai-stt.ts` `quoteStt` returns `Speech-to-text in rest mode is $0.10 per hour` and the streaming line at `$0.20`. `packages/grok-plugin/skills/hh-settings/SKILL.md` tells the Guide to show the rate before Grok Voice is turned on. The companion app has no settings route. `packages/app/src/server/routes.ts` does not mention settings. Nothing on the desk renders `quoteStt().label` before a choice.

## Fix

Render the existing `quoteStt` label on the settings surface that already exists (the `/hh-settings` skill output, or a panel if one is added by a later prompt). The xAI engine stays off until that label has been shown. Do not change the rates. Do not make xAI the default.

## Why this pass did not do it

Adding a settings route would be a new product surface. This pass does not invent one.

## Applied

`/hh-settings` now prints both `quoteStt` labels before xAI speech-to-text can be turned on. Local whisper.cpp stays the default. The rates stay $0.10 per hour REST and $0.20 per hour streaming. No settings route was added.

Files: `packages/grok-plugin/skills/hh-settings/SKILL.md`, `packages/voice/test/settings-rate.test.ts`.

Test: `hh-settings renders quoteStt labels before xAI speech-to-text can be turned on`.
