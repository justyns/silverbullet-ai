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
