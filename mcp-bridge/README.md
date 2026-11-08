# silverbullet-ai-mcp

MCP server that exposes the [silverbullet-ai](https://github.com/justyns/silverbullet-ai) tools in a [SilverBullet](https://silverbullet.md) space to MCP clients like Claude Code, Claude Desktop and Cursor.

Full docs: https://ai.silverbullet.md/MCP%20Server/

## Requirements

- The [Runtime API](https://silverbullet.md/Runtime+API) enabled on your SilverBullet server.
- The silverbullet-ai plug installed in the space, preferably the same version as this package.
- Node.js 20+.

## Usage

Claude Code:

```bash
claude mcp add silverbullet --env SB_URL=http://localhost:3000 -- npx -y silverbullet-ai-mcp
```

Claude Desktop (`claude_desktop_config.json`):

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

## HTTP/container configuration

Set `MCP_PORT` to serve Streamable HTTP instead of stdio, and `MCP_TOKEN` to require `Authorization: Bearer ...`. `SB_URL` selects the target space URL (including its multi-space path); `SB_AUTH_TOKEN` supplies its account API token. `MCP_READ_ONLY=1` exposes only tools explicitly marked read-only; the default standalone behavior is unchanged when this variable is unset. HTTP mode listens on the container interfaces; publish it only if you deliberately need external access.

See [the rootless Podman deployment](../deploy/README.md) for the complete authenticated SilverBullet/ACP/MCP stack.
