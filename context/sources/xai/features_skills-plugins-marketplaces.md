#### Features

# Skills, Plugins & Marketplaces

## Skills

Skills are reusable folders containing markdown instructions, script files, and resources for agents.

Grok discovers skills from:

* `./.grok/skills/` (walked up to the repo root)
* `~/.grok/skills/`
* Any enabled plugin's `skills/` directory
* Extra paths under `[skills] paths` in `~/.grok/config.toml`

User-invocable skills also appear as slash commands, for example `/<skill-name>`.

`SKILL.md` starts with YAML frontmatter. Extra keys are ignored.

| Field | Description |
| ----- | ----------- |
| `name` | Identifier. Directory name if omitted. |
| `description` | What it does and when to use it. First body paragraph if omitted. |
| `when-to-use` | Extra trigger phrases. Alias: `when_to_use`. |
| `paths` | Gitignore globs. Hidden until a matching file is touched. |
| `allowed-tools` | Does not grant or restrict tools. Accepts a YAML list or a comma/space-separated string. |
| `argument-hint` | Slash-command autocomplete hint. |
| `user-invocable` | Show as a slash command. Default `true`. `false` hides it from you and from the model. Only the literal `true` counts; `yes` is false. |
| `disable-model-invocation` | Slash command only; no automatic invoke. Default `false`. |
| `metadata` | String map. `author` and `short-description` are shown in the UI. |

Grok accepts `model`, `effort`, `license`, and `compatibility` and does not apply them.

## Plugins

Plugins extend Grok with additional skills, agents, hooks, MCP servers, and LSP servers.

Grok loads plugins from:

* `./.grok/plugins/`
* `~/.grok/plugins/`
* Marketplace installs under `~/.grok/plugins/marketplaces/`
* Extra paths under `[plugins] paths` in `~/.grok/config.toml`
* `--plugin-dir <PATH>` on the CLI

Manage plugins, hooks, skills, and MCP servers from a single extensions modal in the TUI — open it with any of `/plugins`, `/hooks`, `/skills`, or `/mcps`.

## Hooks

Hooks run scripts on tool and session lifecycle events, such as before or after tool calls.

Grok discovers hooks from:

* `~/.grok/hooks/` (extra roots via `~/.grok/hooks-paths`)
* Project `.grok/hooks/` (requires `/hooks-trust`)
* Enabled plugins

Plugin hooks additionally receive `GROK_PLUGIN_ROOT` and `GROK_PLUGIN_DATA` in their environment. For events, the JSON format, and the script contract, see [Hooks](/build/features/hooks).

## Marketplaces

The TUI includes a Marketplace tab for browsing and installing plugins from configured sources.

Marketplace sources come from `[[marketplace.sources]]` in `~/.grok/config.toml` and `~/.grok/plugins/known_marketplaces.json`.

## Subagents

Subagents spawn independent child sessions that handle tasks in parallel. Types and personas are under [Subagents](/build/features/subagents).

## Claude Code compatibility

Grok is fully compatible with Claude Code with zero configuration needed.

Grok automatically reads Claude Code marketplaces, plugins, skills, MCPs, agents, hooks, and instruction files (`CLAUDE.md`, `Claude.md`, `CLAUDE.local.md`, and `.claude/rules/`) alongside `.grok/`. No extra setup is needed.

## Agents.md compatibility

Grok also reads the `AGENTS.md` instruction-file family (`AGENTS.md`, `Agents.md`, `AGENT.md`) walked from cwd to the repo root — see [AGENTS.md](/build/features/project-rules) — and discovers user-level skills and commands from:

* `~/.agents/skills/`
* `~/.agents/commands/`
