#### Features

# Background Tasks

Grok can run commands, subagents, and monitors in the background while the conversation continues. Press `Ctrl+G` to open the tasks pane listing everything currently running, or run `/tasks` for a snapshot in the scrollback; press `Ctrl+B` to demote a running foreground command to the background instead of waiting for it. This is separate from the agent’s [todos](/build/features/sessions#todos) (`Ctrl+T` on the agent screen), which track planned multi-step work rather than running processes.

## Background commands

The agent starts dev servers, builds, and other long-running commands as background tasks on its own, and collects their output when needed. Ask for it directly ("run the dev server in the background") or let the agent decide. In the scrollback, select a background task and press `x` to kill it.

## Scheduled prompts

`/loop` runs a prompt on a recurring interval:

```text
/loop 5m Check if the test suite passes and report any failures
```

The interval accepts `Ns` (minimum 60), `Nm`, `Nh`, and `Nd`. The prompt fires immediately, then repeats; each firing is a new agent turn. Loops expire after 7 days, and at most 50 scheduled tasks can be active at once. Cancel from the tasks pane, or ask the agent to.

## Monitors

For real-time event streams rather than periodic checks, the agent can attach a monitor to a script: each line the script prints becomes a notification in the conversation. Ask for one when you want to watch a log, a CI run, or a port ("watch the deploy logs and tell me if anything errors"). Keep monitor scripts selective — every output line interrupts the conversation.

## Prompt queue

Prompts submitted while a turn is running are queued, not dropped. `Ctrl+;` toggles the queue panel and `/queue` lists it.
