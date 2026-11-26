# termalin-mcp

An SSH MCP server for AI agents, packaged as a small stdio bridge. Point Claude Code, Cursor, Codex, Windsurf, Claude Desktop or any other MCP client at it, and the agent can run commands, read and write files, query databases and read metrics on your own servers through [Termalin](https://termal.in/mcp/). The agent never receives an SSH key: each server is reached through a Termalin Connector with a short-lived certificate, under the rules you set for that key or app (full, allowlist or read-only), and every command is logged.

The bridge itself is about 150 lines of JavaScript with no dependencies. It reads JSON-RPC messages from stdin, posts each one to `https://termal.in/api/v1/mcp` with your API key, and writes the reply back to stdout. Long commands arrive as an event stream and are passed through as they come. Nothing is interpreted, cached or stored on the way.

If your client already supports remote MCP servers over HTTP, you do not need this package: add `https://termal.in/mcp` directly and sign in with OAuth (that is what claude.ai, ChatGPT and recent Claude Code builds do). The bridge is for clients that only speak stdio, for CI jobs and scripts that work with an API key, and for anyone who prefers a process they can read.

## Setup

1. Enroll a server: install the Termalin Connector on it from the [web cabinet](https://termal.in/account) (one command, Linux, Windows or macOS). No inbound ports, no SSH key handed out.
2. Create an API key in the cabinet under **AI access → API keys**. Choose which servers the key may reach and what it may run (full, allowlist or read-only), and give it an expiry.
3. Put the key in the `TERMALIN_API_KEY` environment variable of your MCP client (see the snippets below). The key goes in the environment, never on the command line.

Node.js 18 or newer is required. The snippets install straight from this repository; an npm package name will follow.

## Claude Code

```bash
claude mcp add termalin -e TERMALIN_API_KEY=tk_live_… -- npx -y github:termalinapp/termalin-mcp
```

Or, without this bridge, over HTTP with a sign-in:

```bash
claude mcp add --transport http termalin https://termal.in/mcp
```

## Cursor, Windsurf, Claude Desktop, Codex and others

Any client that takes a `mcpServers` JSON block:

```json
{
  "mcpServers": {
    "termalin": {
      "command": "npx",
      "args": ["-y", "github:termalinapp/termalin-mcp"],
      "env": { "TERMALIN_API_KEY": "tk_live_…" }
    }
  }
}
```

Codex CLI (`~/.codex/config.toml`):

```toml
[mcp_servers.termalin]
command = "npx"
args = ["-y", "github:termalinapp/termalin-mcp"]
env = { TERMALIN_API_KEY = "tk_live_…" }
```

## What the agent can do

The tool catalogue comes from the server, so it is always current; `tools/list` works without a key if you want to look first. At the time of writing it holds 36 tools in these groups:

| Group | Tools | Notes |
|---|---|---|
| Servers | `hosts_list`, `ssh_exec`, `ssh_exec_many` | one command on one server or the same command on many; 300 s per command |
| Long jobs | `job_start`, `job_status`, `job_stop`, `job_list` | for builds, migrations and anything over a few minutes |
| Files | `sftp_list`, `sftp_read`, `sftp_write`, `sftp_delete`, `sftp_rename`, `sftp_mkdir` | text files up to 512 KB |
| Databases | `data_tables`, `data_schema`, `data_query` | runs the engine's own client on the server, no database password passes through the agent; queries are read-only |
| Monitoring | `server_metrics`, `alerts_list`, `updates_list` | numbers Termalin already collects every minute, open alerts, pending package updates from the hourly check; nothing is run on the server |
| Backups | `backup_create`, `backup_list`, `backup_job_create` | encrypted server backups; a new job is saved as a draft for the owner to confirm |
| Internal web apps | `web_link_create`, `web_link_list`, `web_link_update`, `web_link_delete` | expose a service that listens only inside the server as an internal site in the owner's cabinet, without port forwarding |
| Remote desktops | `desktop_list`, `desktop_open`, `desktop_screenshot`, `desktop_click`, `desktop_type`, `desktop_key`, `desktop_move`, `desktop_scroll`, `desktop_wait` | RDP and VNC sessions the owner opened for AI in Termalin; the agent sees screenshots, never the saved password |
| Utility | `generate_password` | |

What a given key may do is decided on the server side: the key's own scope and policy, the Connector's policy for AI callers (full, allowlist, read-only), and the plan of the account. A command that is not allowed comes back as a refusal, not as output.

## Environment

| Variable | Meaning |
|---|---|
| `TERMALIN_API_KEY` | the API key (`tk_live_…`) |
| `TERMALIN_API_KEY_FILE` | a file that holds the key, for setups that keep secrets in files |
| `TERMALIN_MCP_URL` | endpoint override, default `https://termal.in/api/v1/mcp` |

## Test

```bash
npm test
```

The smoke test starts the bridge, sends `initialize` and `tools/list`, and checks that a tool call without a key is refused with a JSON-RPC error. It needs network access to termal.in and no key.

## Related

- [termal.in/mcp](https://termal.in/mcp/) — how the hosted MCP server works, policies, audit log.
- [termalin-plugin](https://github.com/termalinapp/termalin-plugin) — the same server packaged as a plugin for Claude Code, ChatGPT, Cursor, Kiro, Gemini CLI, Antigravity and Grok Build.
- The Termalin desktop app ships its own local MCP server (`termalin-mcp` binary) that drives the app and its hosts on your machine; that one is part of the app, not this package.

## License

MIT.
