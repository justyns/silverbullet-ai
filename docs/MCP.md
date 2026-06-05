# MCP (Model Context Protocol)

The Assistant can use tools exposed by external [Model Context Protocol](https://modelcontextprotocol.io) servers, in addition to the built-in [[Tools]] defined in Space Lua. This lets you plug the growing ecosystem of MCP tools into your chat without writing any Lua.

The plug acts as an MCP **client**: it connects to the servers you configure, discovers their tools, and makes them available to the LLM during a tool-enabled chat. MCP tools flow through the same agentic loop and approval flow as built-in tools.

## Requirements

- Tools must be enabled (see [[Tools]], `chat.enableTools = true`) and use a model that supports tool calling.
- Only streamable http mcp servers are currently supported, and must be reachable from your SilverBullet **server**. Local `stdio` servers are not supported, see [Reaching stdio servers](#reaching-stdio-servers).

## Configuration

Add servers under `ai.mcpServers`, keyed by a short name:

```lua
config.set("ai", {
  chat = { enableTools = true },
  mcpServers = {
    myserver = {
      url = "http://127.0.0.1:9000/mcp",
      trusted = false,
    },
    -- A remote server requiring custom headers (e.g. auth)
    weather = {
      url = "https://example.com/mcp",
      headers = {
        ["Authorization"] = "Bearer my-secret-token",
        -- hyphenated header names need bracketed keys
        ["X-Api-Version"] = "2024-10-01",
      },
    },
  },
})
```

### Per-server options

| Option | Default | Description |
|--------|---------|-------------|
| `url` | (required) | The server's Streamable HTTP endpoint |
| `enabled` | `true` | Set `false` to keep the config but skip the server |
| `trusted` | `false` | If `true`, this server's tool calls run automatically; otherwise each call requires approval |
| `headers` | - | Extra request headers sent verbatim, e.g. `headers = { ["Authorization"] = "Bearer …" }`. Header names with hyphens need the bracket form. |
| `timeout` | `30000` | Request timeout in milliseconds |

## How tools appear

Discovered tools are namespaced as `mcp__<server>__<tool>` so they never collide with built-in tools. They respect the same controls as built-in tools, including per-agent tool filtering ([[Agents]]).

Besides being offered to the LLM during chat, MCP tools can be invoked **directly** from a Space Lua script with `system.invokeFunction("silverbullet-ai.callTool", "mcp__<server>__<tool>", {...})`. Use `silverbullet-ai.listTools` to discover the namespaced names. See [[Tools#Calling Tools from Space Lua]] for details.

## Approval & trust

MCP tools require approval before running **unless** their server is marked `trusted: true`. The global `chat.skipToolApproval` setting still overrides everything. In short:

- `trusted = true` → tool calls run automatically.
- `trusted = false` (default) → each tool call prompts for approval.
- `chat.skipToolApproval = true` → no approvals for any tool.

## Testing a connection

Run the **`AI: Test MCP Connection`** command. It connects to every configured server, lists the tools each one exposes, and writes a status report page (`AI: MCP Connection Test`).

## Reaching stdio servers

Many MCP servers only speak the local `stdio` transport. Since silverbullet plugs run in the browser sandbox and cannot launch subprocesses, point the plug at a small **bridge** that exposes a stdio server over HTTP, for example:

- [`mcp-proxy`](https://github.com/sparfenyuk/mcp-proxy)
- [`supergateway`](https://github.com/supercorp-ai/supergateway)

Run the bridge next to your SilverBullet server and set the server's `url` to the bridge's HTTP endpoint.

**Note**: These projects are not associated with SilverBullet or SilverBullet-ai, please be sure to review their security and trustworthiness before running them on your machine.

## Authentication

Servers that require an interactive **OAuth** flow are not yet supported directly. For now, use a local **auth-handling bridge** (e.g. [`mcp-remote`](https://www.npmjs.com/package/mcp-remote)) that performs the OAuth flow on your machine and exposes a local endpoint the plug can reach with no auth (or a static token). Servers that take a static token or API key work out of the box via the `headers` option (e.g. `headers = { ["Authorization"] = "Bearer …" }`).
