#### Features

# Permissions

Permissions decide which tool calls may run. The [sandbox](/build/features/sandbox) is separate: it limits what an approved call can do on the filesystem and network.

## Modes

| Mode | Behavior | Enter via |
| ---- | -------- | --------- |
| Ask (default) | Prompt for anything not already allowed | — |
| Auto | Classifier auto-approves safe tools; dangerous ones may still prompt (`deny` rules and hooks still apply) | `/auto`, `Shift+Tab` when the feature is on |
| Always-approve | Auto-approve tool calls (`deny` rules and PreToolUse hooks still apply) | `/always-approve`, `Ctrl+O`, `Shift+Tab`, `grok --always-approve` |

`Shift+Tab` cycles Normal → Plan → Auto (when available) → Always-approve. `/auto` only appears when the auto permission-mode feature is enabled. Running `/auto` while always-approve is on (or the reverse) switches modes rather than stacking them. Status shows `auto` when auto is active and plan mode is not.

Default in user config only (`~/.grok/config.toml` or managed/requirements — not project `.grok/config.toml`):

```text
[ui]
permission_mode = "auto" # or "ask" | "always-approve"
```

Legacy keys `approval_mode` and `yolo = true` still work; `permission_mode` wins when more than one is set.

[Plan mode](/build/features/plan-mode) is independent: edit tools stay limited while planning, and the plan review UI is not skipped under auto or always-approve.

Headless modes such as `dontAsk` and locking always-approve off: [Enterprise Deployments](/build/enterprise#permissions).

## Allow and deny rules

```text
[permission]
rules = [
  { action = "allow", tool = "bash", pattern = "git *" },
  { action = "allow", tool = "read" },
  { action = "deny",  tool = "bash", pattern = "rm -rf *" },
]
```

`--allow` / `--deny` take the same patterns per invocation. Supported filters include `Bash`, `Edit`, `Read`, `Grep`, `MCPTool`, `WebFetch`, and `WebSearch`. `deny` always wins over `allow`.

A remembered “always allow” grant still prompts for dangerous patterns such as `rm` and `git push`. An explicit config or CLI allow rule auto-approves them. Under always-approve they run unless you add a deny.
