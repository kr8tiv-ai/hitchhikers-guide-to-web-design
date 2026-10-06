#### Features

# Plan Mode

In plan mode the agent explores the codebase and drafts a plan for your approval before it edits anything.

## When to use

| | |
| --- | --- |
| **Use for** | Ambiguous architecture, unclear requirements, or high-impact restructures |
| **Skip for** | Clear one-path changes, obvious bug fixes, renames, formatting, pure research ([explore](/build/features/subagents) instead) |

## Enter plan mode

* **`/plan`** — Enter plan mode (active on your next prompt). `/plan <description>` enters and starts a turn.
* **`Shift+Tab`** — Cycle modes. From Normal, one press lands on Plan (then Auto when available, then Always-approve).

The agent can enter plan mode on its own when a task looks ambiguous. That is not a permission prompt. Leave with `Shift+Tab` when idle, or with `q` on the approval screen.

## Review and approve

When planning finishes, the TUI opens a plan preview. Auto and always-approve do not skip this review. Use **`/view-plan`** (aliases `/show-plan`, `/plan-view`) to reopen a saved preview.

| Shortcut | Action |
| -------- | ------ |
| `a` | Approve and start building (or approve with pending comments) |
| `s` | Request changes (type notes, then Enter) |
| `c` | Comment on the selected line or range |
| `q` | Quit plan and turn plan mode off |
| `Tab` | Focus between plan preview and prompt |

An empty plan still opens this surface. Plan mode stays on until you approve or quit.

## Caveats

* Only the session plan file may be edited until you approve. Other edit tools are rejected, including under auto or always-approve. Reads, bash, and MCP still follow [permission mode](/build/features/permissions). Plan mode gates edit tools, not the shell — bash can still write via redirection.
* [Subagents](/build/features/subagents) are not edit-gated by the parent’s plan mode; they do inherit permission mode (including auto and always-approve).
* Status shows `plan` while planning and `plan approval` on the review screen. The `auto` or always-approve flag returns when plan mode ends.
