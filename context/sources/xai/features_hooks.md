#### Features

# Hooks

A hook is a shell command or HTTP endpoint that Grok calls when a lifecycle event occurs: block a dangerous command before it runs, log tool use, run a formatter after edits, or send a notification when a turn ends.

## Configuration

Hooks are JSON files. Personal hooks live in `~/.grok/hooks/*.json`; project hooks live in `<project>/.grok/hooks/*.json`. Claude Code (`.claude/settings.json`) and Cursor (`.cursor/hooks.json`) hook files are read as well, including Cursor's camelCase event names.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "bin/safety-check.sh", "timeout": 10 }]
      }
    ]
  }
}
```

`matcher` is a regular expression tested against the tool name (Claude tool names such as `Bash`, `Read`, and `Edit` are mapped to Grok's automatically); omit it to match everything. `type` is `"command"` or `"http"` (with a `url` to POST the event to). `timeout` is in seconds, default 5. Manage and inspect loaded hooks in the `/hooks` tab of the extensions modal.

Project hooks require trust before they run: the first time you open a repo with hooks, grant it with `/hooks-trust` or by launching with `--trust`. The decision is stored in `~/.grok/trusted_folders.toml` and covers project MCP and LSP servers too.

## Events

| Event | Fires when |
| ----- | ---------- |
| `SessionStart`, `SessionEnd` | A session starts or ends |
| `UserPromptSubmit` | You submit a prompt |
| `PreToolUse` | A tool is about to run — the only blocking event |
| `PostToolUse`, `PostToolUseFailure` | A tool completes or fails |
| `PermissionDenied` | The permission system denies a tool call |
| `Stop`, `StopFailure` | A turn ends, or ends with an API error |
| `Notification` | The agent sends a notification |
| `SubagentStart`, `SubagentStop` | A subagent starts or finishes |
| `PreCompact`, `PostCompact` | Conversation compaction runs |

## The script contract

The event arrives as JSON on stdin, including `hookEventName`, `sessionId`, `cwd`, `workspaceRoot`, and for tool events `toolName` and `toolInput`. Every hook process also receives `GROK_HOOK_EVENT`, `GROK_HOOK_NAME`, `GROK_SESSION_ID`, and `GROK_WORKSPACE_ROOT` in its environment.

A `PreToolUse` hook decides by writing JSON to stdout:

```json
{ "decision": "deny", "reason": "Unsafe command detected" }
```

Exit code 0 allows, exit code 2 denies. Everything else — timeouts, crashes, malformed output — is fail-open: the failure is recorded in the session but the tool call proceeds. Only an explicit `deny` blocks. For passive events, stdout is ignored; exit 0 on success.
