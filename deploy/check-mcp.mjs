const response = await fetch("http://127.0.0.1:3001/mcp", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.MCP_TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "healthcheck", version: "1" },
    },
  }),
  signal: AbortSignal.timeout(8000),
});
if (!response.ok || !(await response.text()).includes("protocolVersion"))
  process.exit(1);
