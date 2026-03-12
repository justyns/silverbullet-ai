# MCP (Model Context Protocol)

[MCP](https://modelcontextprotocol.io/) is an open protocol that lets AI applications connect to external tools and data sources through a standardised interface. silverbullet-ai can act as an **MCP client**, connecting to one or more MCP servers and making their tools available to the assistant alongside the built-in Space Lua tools.

## How it works

1. You configure one or more MCP servers in your Space Lua config under `ai.mcpServers`.
2. On startup (and every time you run `AI: Refresh Config`) silverbullet-ai connects to each server, runs the MCP handshake, and fetches the server's tool list.
3. MCP tools are merged with Space Lua tools and made available to all agents and chat sessions — no extra steps needed.
4. When the assistant calls an MCP tool the request is forwarded to the server and the result is returned to the conversation.

## Supported transports

| Transport | Config value | When to use |
|-----------|-------------|-------------|
| **Streamable HTTP** (MCP 2025-03-26) | `"http"` (default) | Modern HTTP-based MCP servers |
| **HTTP + SSE** (MCP 2024-11-05) | `"sse"` | Older MCP servers that use a persistent SSE channel |

Both transports use standard `fetch()` and work inside SilverBullet's plugin sandbox. Stdio-based MCP servers (the most common type for local CLI tools) are **not** supported directly; use a bridge like [`mcp-proxy`](https://github.com/sparfenyuk/mcp-proxy) to expose them over HTTP.

## Configuration

Add an `mcpServers` block inside `ai` in your Space Lua config:

```lua
config.set {
  ai = {
    providers = { ... },
    defaultTextModel = "openai:gpt-4o",

    mcpServers = {
      -- Each key is an arbitrary name used to identify the server in logs
      brave_search = {
        url = "http://localhost:3001",
        transport = "http",   -- optional, "http" is the default
      },
      internal_api = {
        url = "https://mcp.example.com",
        apiKey = "secret",    -- sent as: Authorization: Bearer secret
        timeout = 60000,
        useProxy = false
      },
      legacy_server = {
        url = "http://localhost:3002",
        transport = "sse"     -- older SSE-based server
      }
    }
  }
}
```

After saving, run **`AI: Refresh Config`** to connect to the new servers. Check the browser console for `[MCP]` log lines to confirm each server initialized successfully.

### Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | string | — | Base URL of the MCP server. Required. |
| `transport` | `"http"` \| `"sse"` | `"http"` | Transport protocol to use. |
| `apiKey` | string | — | Bearer token sent as `Authorization: Bearer <apiKey>`. |
| `headers` | object | — | Additional HTTP headers to include with every request. |
| `timeout` | number | `30000` | Per-request timeout in milliseconds. |
| `useProxy` | boolean | `false` | Route requests through SilverBullet's network proxy. |
| `oauth` | object | — | OAuth 2.1 configuration (see below). Cannot be combined with `apiKey`. |

## OAuth 2.1 authentication

Some MCP servers require OAuth 2.1 (authorization code flow + PKCE) instead of a static API key. When `oauth` is set, silverbullet-ai will:

1. Discover the authorization and token endpoints from `/.well-known/oauth-authorization-server` on the server's origin (or use the URLs you provide directly)
2. Register a public OAuth client dynamically (RFC 7591) if no `clientId` is configured
3. Open a popup window so you can log in — once redirected back, the authorization code is exchanged for tokens automatically
4. Cache the access token and silently refresh it using the refresh token before it expires

You will only be prompted to log in again when the refresh token itself expires (typically every 30 days, depending on the server).

```lua
config.set {
  ai = {
    mcpServers = {
      my_server = {
        url = "https://api.example.com/mcp",
        oauth = {
          -- Optional: pre-registered client ID.
          -- Omit to use dynamic client registration.
          clientId = "my-app-client-id",

          -- Optional: override endpoint discovery.
          -- Omit to auto-discover from /.well-known/oauth-authorization-server.
          authorizationUrl = "https://auth.example.com/authorize",
          tokenUrl = "https://auth.example.com/token",

          -- Optional: OAuth scopes to request.
          scopes = {"tools:read", "tools:write"},
        }
      }
    }
  }
}
```

The minimal configuration (auto-discovery + dynamic registration) is just:

```lua
my_server = {
  url = "https://api.example.com/mcp",
  oauth = {}
}
```

### OAuth configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `clientId` | string | — | Pre-registered OAuth client ID. If omitted, dynamic client registration is attempted. |
| `authorizationUrl` | string | — | Authorization endpoint URL. If omitted, discovered via `/.well-known/oauth-authorization-server`. |
| `tokenUrl` | string | — | Token endpoint URL. If omitted, discovered alongside `authorizationUrl`. |
| `scopes` | string[] | — | OAuth scopes to request. |

## Using MCP tools

Once the servers are connected, MCP tools appear automatically in:

- **All chat sessions** (chat panel and chat-on-page) when `enableTools = true`
- **Agent tool whitelists/blacklists** — use the tool's exact name as reported by the server

Example: if your MCP server exposes a `web_search` tool, you can restrict an agent to use only that tool:

```lua
ai.agents.researcher = {
  name = "Researcher",
  description = "Web search only",
  systemPrompt = "You are a research assistant. Use web_search to answer questions.",
  tools = {"web_search"}
}
```

## Tool name conflicts

If an MCP server exposes a tool with the same name as an existing Space Lua tool, the **Lua tool wins** and the MCP version is skipped. A warning is logged to the browser console. Rename conflicting tools by wrapping them in a custom Lua tool, or raise an issue with the MCP server author to change their tool name.

## Connecting stdio-based MCP servers

Most off-the-shelf MCP servers (e.g. the official `@modelcontextprotocol/server-filesystem`) communicate over stdio and cannot be called directly from the browser. You need a proxy that bridges stdio ↔ HTTP:

```bash
# Install mcp-proxy (example)
npm install -g mcp-proxy

# Run the filesystem MCP server behind HTTP on port 3001
mcp-proxy --port 3001 -- npx -y @modelcontextprotocol/server-filesystem /path/to/notes
```

Then configure it in silverbullet-ai:

```lua
mcpServers = {
  filesystem = {
    url = "http://localhost:3001",
    transport = "sse"   -- mcp-proxy uses the legacy SSE transport
  }
}
```

## Troubleshooting

**Server shows as failed in the console**
- Check that the server URL is reachable from your browser (open it in a new tab)
- If using `useProxy = true`, make sure SilverBullet's proxy is configured and accessible
- For SSE transport, verify the server exposes a `/sse` endpoint

**Tools from a server are not appearing**
- Run `AI: Refresh Config` to re-initialize all servers
- Check the browser console for `[MCP]` log lines; errors are logged per-server
- Confirm `enableTools = true` is set in `ai.chat`

**Tool call returns an error**
- The MCP server's error message is surfaced directly in the chat as a tool result
- Some servers require specific argument types — check the server's documentation
