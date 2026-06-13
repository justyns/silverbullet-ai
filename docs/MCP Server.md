# MCP Server (silverbullet-ai-mcp)

`silverbullet-ai-mcp` is a small bridge that exposes your space's [[Tools]] (built-in tools from this plug and any you define) to external MCP clients like Claude Code, Claude Desktop, Cursor, etc.

If you're wanting to call other MCP servers from your space's tools, see [[MCP]] instead.

The bridge lives in the [`mcp-bridge/`](https://github.com/justyns/silverbullet-ai/tree/main/mcp-bridge) directory of the plug repo and is published to npm as `silverbullet-ai-mcp`.

## Requirements

- The **Runtime API** must be enabled on your SilverBullet server. See [Runtime API](https://silverbullet.md/Runtime+API).
- A silverbullet-ai version that includes the bridge, preferably the same version.
- Node.js 20+ on the machine running the bridge.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SB_URL` | yes | Base URL of your SilverBullet server, e.g. `http://localhost:3000` |
| `SB_AUTH_TOKEN` | no | Same value as the server's `SB_AUTH_TOKEN`, if it runs with token auth |
| `MCP_PORT` | no | If set, the bridge serves streamable HTTP on this port instead of stdio |
| `MCP_TOKEN` | no | In HTTP mode, require `Authorization: Bearer <token>` on requests |

## Claude Code

```bash
claude mcp add silverbullet --env SB_URL=http://localhost:3000 -- npx -y silverbullet-ai-mcp
```

## Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "silverbullet": {
      "command": "npx",
      "args": ["-y", "silverbullet-ai-mcp"],
      "env": { "SB_URL": "http://localhost:3000" }
    }
  }
}
```

## HTTP mode

Set `MCP_PORT` to run as a streamable HTTP server (e.g. as a sidecar next to SilverBullet) instead of stdio:

```bash
SB_URL=http://localhost:3000 MCP_PORT=3033 MCP_TOKEN=secret npx -y silverbullet-ai-mcp
```

Point streamable-HTTP clients at `http://host:3033/mcp` and set `Authorization: Bearer secret`.

## What's exposed

The bridge reads the tool list from `silverbullet-ai.listTools` at startup and exposes each as an MCP tool, alongside a built-in `refresh_tools` tool. Call `refresh_tools` to reload the list without restarting the bridge.  Everything is exposed except:

- `ask_user` and `navigate`, which don't make sense without a client ui.
- Tools from your configured [[MCP]] servers.

Tools marked `readOnly` in their definition (the built-in `read_note`, `list_pages`, `get_page_info`, and the bridge's own `refresh_tools`) are exposed with the MCP `readOnlyHint` annotation, which clients use to decide what's safe to run without prompting. Mark your own tools by setting `readOnly = true` (see [[Tools]]).

> **warning** Writes happen without approval
> Tool calls run through the Runtime API with no in-editor approval modal, so write tools (`create_note`, `update_note`, `search_replace`, etc.) modify pages directly. Anyone who can reach the bridge can read and write your space. Treat connected MCP clients as trusted, and in HTTP mode protect the port with `MCP_TOKEN` and network controls.
