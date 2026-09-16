# Project Context Files

Liora injects project-level instructions into the system prompt by reading context files from the working directory. The discovery order is **first match wins** — only one project context source is loaded per session.

| File (in priority order) | Discovery | Use when |
|---|---|---|
| `.liora.md` / `LIORA.md` | Walks parents up to the git root, stops at git root | You want hierarchical project rules (root + per-package overrides) |
| `AGENTS.md` / `agents.md` | **Cwd only** — subdirectory and parent copies are ignored | You want portable agent instructions that work the same in Liora, Claude Code, Codex, etc. |
| `CLAUDE.md` / `claude.md` | Cwd only | Same as AGENTS.md, Claude-flavored |
| `.cursorrules` / `.cursor/rules/*.mdc` | Cwd only | Migrating from Cursor |

`SOUL.md` (in `$LIORA_HOME`) is independent and always loaded when present — it sets the agent's identity, not project rules.

### Pick the right one

- **Use `.liora.md`** when you want Liora-specific behavior that lives above the cwd (root + subtree), or when you want rules to inherit from a parent directory. The parent walk stops at the git root, so a home-level `.liora.md` won't leak into every project (a git repo's root is the boundary).
- **Use `AGENTS.md`** when the same project will also be worked on by other agents (Codex, Claude Code, OpenCode). Those tools all have their own conventions for `AGENTS.md`, and the "cwd only" contract keeps the file portable.
- **Don't put project rules in `~/.liora/AGENTS.md`** (or any other home-level location). When Liora runs with that directory as cwd, the file loads — but only for that one directory. For cross-project context, use `SOUL.md` (in `$LIORA_HOME`, identity-only) or install a skill via `liora skills install`.

### Size and truncation

Each context file is capped at 20,000 characters. Files longer than that get **head + tail** truncated (the middle is dropped, with a `[...truncated...]` marker). For large project rules, prefer splitting into multiple skills over cramming one file.

### Security

All context files pass through the threat-pattern scanner before reaching the system prompt. Patterns matching prompt injection or promptware are replaced with a `[BLOCKED: ...]` placeholder. This means an `AGENTS.md` containing obvious injection attempts won't reach the model — the scanner blocks the content, not the file, so the rest of the file still loads.

### Disable for one session

`liora --ignore-rules` skips auto-injection of all project context files (`.liora.md`, `AGENTS.md`, `CLAUDE.md`, `.cursorrules`) **and** `SOUL.md` identity, plus user config, plugins, and MCP servers. Use it to isolate whether a problem is your setup or Liora itself.

### Example: a small `.liora.md`

```markdown
# My Project

Liora: when working in this repo, follow these rules.

## Build
- Always run `make test` before declaring a change done.
- Use `uv run` for Python, not `pip install`.

## Style
- Prefer `pathlib.Path` over `os.path`.
- No `print()` in production code — use the `logger`.
```

That file at `/home/me/projects/myrepo/.liora.md` is auto-loaded when Liora runs in any subdirectory of `/home/me/projects/myrepo`, but not when it runs in `/home/me/other-project`.
