#### Features

# Worktrees

A worktree session runs in an isolated copy of your repository, so parallel agents cannot overwrite each other's files. Worktrees require a git repository, live under `~/.grok/worktrees/<repo>/<name>`, and start from your current HEAD, including uncommitted changes. [Subagents](/build/features/subagents) can also request worktree isolation when the parent delegates parallel work.

## Starting one

```bash customLanguage="bash"
grok -w
grok --worktree=feat "refactor module X" # = keeps the prompt out of the name
grok -w --ref main "fix the flaky test"  # clean checkout of the ref
grok -w -r <session-id>                  # resume in a fresh worktree
```

In the TUI: `/fork --worktree` forks the current session into a worktree, `Ctrl+W` on the welcome screen opens the New Worktree dialog, and `Ctrl+W` in the [Agent Dashboard](/build/features/dashboard) dispatches new agents into worktrees. Whether `/new` and `/fork` offer a worktree is configurable — see [TOML Values](/build/settings/reference#toml-values).

A worktree is a real git checkout, detached at its base commit; land changes with ordinary git.

## Housekeeping

Worktrees persist until you remove them: ending or deleting a session leaves its worktree in place, and `gc` runs only when you invoke it.

| Command | What it does |
| ------- | ------------ |
| `grok worktree list` | List tracked worktrees |
| `grok worktree show <id>` | Show details for one worktree |
| `grok worktree rm <ids...>` | Remove worktrees (`--dry-run` to preview) |
| `grok worktree gc` | Remove entries whose directory is gone; `--max-age 7d` also expires idle worktrees not in use by a running process |
