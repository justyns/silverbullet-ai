/**
 * Minimal hello-world MCP server over the Streamable HTTP transport.
 *
 * Used as a real (non-mocked) server to exercise the silverbullet-ai MCP client
 * end to end. It is deliberately tiny and lives in its own npm package so the
 * `@modelcontextprotocol/sdk` dependency never leaks into the plug bundle.
 *
 * Tools:
 *   - echo(message)  -> returns the message verbatim
 *   - add(a, b)      -> returns a + b
 *   - boom()         -> always returns a tool error (isError: true)
 *
 * Env:
 *   PORT / MCP_PORT      port to listen on (default 9000)
 *   MCP_PATH             endpoint path (default "/mcp")
 *   MCP_JSON_RESPONSE    "1" (default) => application/json replies; "0" => SSE replies
 *   MCP_AUTH_TOKEN       if set, require "Authorization: Bearer <token>" (else 401)
 */
import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const PORT = Number(process.env.PORT ?? process.env.MCP_PORT ?? 9000);
const MCP_PATH = process.env.MCP_PATH ?? "/mcp";
const JSON_RESPONSE = (process.env.MCP_JSON_RESPONSE ?? "1") !== "0";
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN ?? "";

function buildServer(): McpServer {
  const server = new McpServer({ name: "mcp-test-server", version: "0.0.0" });

  server.registerTool(
    "echo",
    {
      title: "Echo",
      description: "Echo back the provided text",
      inputSchema: { message: z.string().describe("Text to echo back") },
    },
    ({ message }) => ({ content: [{ type: "text", text: String(message) }] }),
  );

  server.registerTool(
    "add",
    {
      title: "Add",
      description: "Add two numbers and return the sum",
      inputSchema: {
        a: z.number().describe("First addend"),
        b: z.number().describe("Second addend"),
      },
    },
    ({ a, b }) => ({ content: [{ type: "text", text: String(a + b) }] }),
  );

  server.registerTool(
    "boom",
    {
      title: "Boom",
      description: "Always fails, used to test tool error handling",
      inputSchema: {},
    },
    () => ({
      content: [{ type: "text", text: "intentional failure" }],
      isError: true,
    }),
  );

  return server;
}

const app = express();
app.use(express.json());

// Optional static bearer-token auth, to exercise the client's `token` config.
if (AUTH_TOKEN) {
  app.use(MCP_PATH, (req, res, next) => {
    if (req.headers["authorization"] !== `Bearer ${AUTH_TOKEN}`) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Unauthorized" },
        id: null,
      });
      return;
    }
    next();
  });
}

// Stateful: one transport per MCP session, keyed by Mcp-Session-Id.
const transports: Record<string, StreamableHTTPServerTransport> = {};

app.post(MCP_PATH, async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport | undefined;

    if (sessionId) {
      transport = transports[sessionId];
      if (!transport) {
        // Unknown/expired session -> 404 so the client re-initializes (per spec).
        res.status(404).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Session not found" },
          id: null,
        });
        return;
      }
    } else if (isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: JSON_RESPONSE,
        onsessioninitialized: (sid) => {
          transports[sid] = transport!;
        },
      });
      transport.onclose = () => {
        const sid = transport!.sessionId;
        if (sid && transports[sid]) delete transports[sid];
      };
      await buildServer().connect(transport);
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: missing session id for non-initialize request",
        },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("[mcp-test-server] error handling POST:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal error" },
        id: null,
      });
    }
  }
});

// GET (server->client stream) and DELETE (session teardown) reuse the session transport.
async function handleSessionRequest(
  req: express.Request,
  res: express.Response,
) {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  const transport = sessionId ? transports[sessionId] : undefined;
  if (!transport) {
    res.status(404).send("Unknown or expired session");
    return;
  }
  await transport.handleRequest(req, res);
}
app.get(MCP_PATH, handleSessionRequest);
app.delete(MCP_PATH, handleSessionRequest);

app.listen(PORT, "127.0.0.1", () => {
  console.log(
    `[mcp-test-server] listening on http://127.0.0.1:${PORT}${MCP_PATH} ` +
      `(json=${JSON_RESPONSE}, auth=${AUTH_TOKEN ? "on" : "off"})`,
  );
});
