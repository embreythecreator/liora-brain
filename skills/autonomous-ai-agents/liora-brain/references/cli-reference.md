# Liora CLI Reference

Live sources when anything looks stale: `liora --help`, `liora <command> --help`,
https://liora-brain.nousresearch.com/docs/reference/cli-commands

### Global Flags

```
liora [flags] [command]        (no subcommand = interactive chat)

  --version, -V             Show version
  -z, --oneshot PROMPT      One-shot: print ONLY the final response (for scripts/pipes)
  -m MODEL  --provider P    Model/provider override for this invocation
  -t, --toolsets LIST       Comma-separated toolsets for this invocation
  --resume, -r SESSION      Resume session by ID or title
  --continue, -c [NAME]     Resume by name, or most recent session
  --worktree, -w            Isolated git worktree mode (parallel agents)
  --skills, -s SKILL        Preload skills (comma-separate or repeat)
  --profile, -p NAME        Use a named profile
  --yolo                    Skip dangerous command approval
  --tui / --cli             Force the Ink TUI / classic REPL
  --ignore-rules            Skip AGENTS.md/SOUL.md/memory/skill injection
  --safe-mode               Disable ALL customizations (troubleshooting)
  --pass-session-id         Include session ID in system prompt
```

### Chat

```
liora chat [flags]
  -q, --query TEXT          Single query, non-interactive
  --image PATH              Attach a local image to a single query
  -Q, --quiet               Suppress banner, spinner, tool previews
  --checkpoints             Enable filesystem checkpoints (/rollback)
  --max-turns N             Cap tool-calling iterations
  --source TAG              Session source tag (default: cli)
```
(plus the global flags above)

### Configuration

```
liora setup [section]      Wizard (model|tts|terminal|gateway|tools|agent)
liora model                Interactive model/provider picker
liora fallback [add|remove|list]  Fallback provider chain
liora config [show|edit|get|set|unset|path|env-path|check|migrate]
liora login / logout       OAuth sign-in / clear stored auth
liora doctor [--fix]       Check dependencies and config
liora status [--all]       Component status
```

### Tools & Skills

```
liora tools [list|enable NAME|disable NAME]   Per-platform toolsets (curses UI with no args)

liora skills list|browse|search QUERY|inspect ID
liora skills install ID    Hub identifier OR a direct https://…/SKILL.md URL
liora skills config        Enable/disable skills per platform
liora skills check|update|uninstall|publish PATH
liora skills tap add REPO  Add a GitHub repo as a skill source
liora bundles              Skill bundles (one /<name> alias loads several skills)
```

### MCP Servers

```
liora mcp add NAME (--url or --command) | remove | list | test NAME
liora mcp catalog | install NAME     Curated catalog install
liora mcp configure NAME             Toggle tool selection
liora mcp serve                      Run Liora as an MCP server
```
Details (transport, tool discovery, catalog): `references/native-mcp.md`.

### Gateway (Messaging Platforms)

```
liora gateway run|install|start|stop|restart|status|setup
```

20+ platforms: Telegram, Discord, Slack, WhatsApp (Baileys + Business Cloud API), iMessage (Photon — `liora photon setup`), Signal, Email, SMS, Matrix, Mattermost, Teams, LINE, SimpleX, ntfy, Google Chat, Home Assistant, DingTalk, Feishu, WeCom, Weixin, API Server, Webhooks. Open WebUI connects via the API Server adapter. Most adapters ship under `plugins/platforms/`.
Docs: https://liora-brain.nousresearch.com/docs/user-guide/messaging/

### Sessions

```
liora sessions list|browse|rename ID TITLE|delete ID|export OUT|prune|stats
```

### Cron / Webhooks

```
liora cron list|create SCHED|edit ID|pause|resume|run ID|remove|status
    Schedules: '30m', 'every 2h', '0 9 * * *', ISO timestamp
liora webhook subscribe NAME|list|remove NAME|test NAME
```
Webhook payloads/routes: `references/webhooks.md`.

### Profiles

```
liora profile list|create NAME (--clone|--clone-all|--clone-from)|use|show|delete
liora profile rename A B | alias NAME | export NAME | import FILE
```

### Credentials & Pools

```
liora auth                 Interactive credential manager
liora auth add [PROVIDER]  Add OAuth or API-key credential (nous, openai-codex, qwen-oauth, …)
liora auth list|remove P IDX|reset PROVIDER|status
```
Multiple credentials per provider form a pool that rotates automatically and skips exhausted keys.

### Other

```
liora desktop / gui        Native desktop app
liora dashboard            Web admin panel + embedded chat (--stop / --status)
liora proxy                OpenAI-compatible local proxy backed by an OAuth provider
liora portal               Quick setup / sign in via Nous Portal
liora kanban <verb>        Multi-agent work-queue board
liora project              Named multi-folder workspaces
liora skin list|use|set    Switch/tweak skins (see references/themes.md)
liora pets <verb>          Pet mascots (see references/petdex.md)
liora memory setup|status|off|reset   Memory provider
liora secrets bitwarden|onepassword   External secret stores
liora moa                  Mixture-of-Agents slots
liora hooks / security / backup / import / checkpoints / console
liora logs [-f] [errors]   View agent/error logs
liora send                 One-off message through a gateway platform
liora pairing / plugins / insights / journey / computer-use
liora acp                  ACP server (IDE integration)
liora completion bash|zsh|fish
liora update / uninstall / claw migrate
```

Plugin- and provider-supplied subcommands (e.g. `liora photon setup`) only appear once their plugin is installed/active.

### Where to Find Things

| Looking for... | Location |
|---|---|
| Config options | `liora config edit` · [Configuration docs](https://liora-brain.nousresearch.com/docs/user-guide/configuration) |
| Tools / toolsets | `liora tools list` · [Tools reference](https://liora-brain.nousresearch.com/docs/reference/tools-reference) |
| Skills catalog | `liora skills browse` · [Skills catalog](https://liora-brain.nousresearch.com/docs/reference/skills-catalog) |
| Provider setup | `liora model` · [Providers guide](https://liora-brain.nousresearch.com/docs/integrations/providers) |
| Env variables | `liora config env-path` · [Env vars reference](https://liora-brain.nousresearch.com/docs/reference/environment-variables) |
| Gateway logs | `~/.liora/logs/gateway.log` (or `liora logs`) |
| Sessions | `liora sessions browse` (reads state.db) |
