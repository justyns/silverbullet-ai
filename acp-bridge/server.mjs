#!/usr/bin/env node
import http from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { AcpClient, configureSession, modelIds } from "./acp.mjs";
import { eventForUpdate, formatTranscript } from "./format.mjs";

function parseArgs(raw) {
  const value = JSON.parse(raw);
  if (!Array.isArray(value) || !value.every((x) => typeof x === "string"))
    throw new Error("ACP_AGENT_ARGS must be a JSON array of strings");
  return value;
}

export function makeBridge(options = {}) {
  const host = options.host ?? process.env.ACP_BRIDGE_HOST ?? "127.0.0.1";
  const network = options.allowNetwork ?? process.env.ACP_ALLOW_NETWORK === "1";
  if (
    !["127.0.0.1", "::1", "localhost"].includes(host) &&
    !(network && host === "0.0.0.0")
  )
    throw new Error("Bridge only supports loopback binding");
  const port = Number(options.port ?? process.env.ACP_BRIDGE_PORT ?? 3210);
  const origin =
    options.origin ?? process.env.ACP_ALLOWED_ORIGIN ?? "http://localhost:3000";
  const parsedOrigin = new URL(origin);
  if (
    !["http:", "https:"].includes(parsedOrigin.protocol) ||
    parsedOrigin.origin !== origin
  )
    throw new Error(
      "ACP_ALLOWED_ORIGIN must be an exact HTTP(S) origin without a path",
    );
  const token =
    options.token ??
    process.env.ACP_BRIDGE_TOKEN ??
    randomBytes(24).toString("hex");
  if (typeof token !== "string" || !token.trim() || /[\r\n]/.test(token))
    throw new Error("Bridge token must be nonempty and contain no newlines");
  if (network && !process.env.ACP_BRIDGE_TOKEN && !options.token)
    throw new Error("Network binding requires an explicit ACP_BRIDGE_TOKEN");
  const allowedHosts = new Set([
    "127.0.0.1",
    "localhost",
    "[::1]",
    ...(options.allowedHosts ??
      (process.env.ACP_ALLOWED_HOSTS ?? "").split(",").filter(Boolean)),
  ]);
  if (
    [...allowedHosts].some(
      (value) => !/^(?:[a-zA-Z0-9][a-zA-Z0-9.-]*|\[::1\])$/.test(value),
    )
  )
    throw new Error(
      "ACP_ALLOWED_HOSTS must contain exact hostnames without ports",
    );
  const mcpUrl = options.mcpUrl ?? process.env.ACP_MCP_URL;
  const mcpToken = options.mcpToken ?? process.env.ACP_MCP_TOKEN;
  if (mcpUrl) {
    const parsed = new URL(mcpUrl);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      throw new Error(
        "ACP_MCP_URL must be an HTTP(S) URL without embedded credentials",
      );
  }
  const mcpServers =
    options.mcpServers ??
    (mcpUrl
      ? [
          {
            type: "http",
            name: "silverbullet",
            url: mcpUrl,
            headers: mcpToken
              ? [{ name: "Authorization", value: `Bearer ${mcpToken}` }]
              : [],
          },
        ]
      : []);
  const cwd = resolve(options.cwd ?? process.env.ACP_WORKDIR ?? process.cwd());
  const timeout = Number(
    options.timeout ?? process.env.ACP_AGENT_TIMEOUT_MS ?? 300000,
  );
  const maxConcurrent = options.maxConcurrent ?? 4;
  if (!Number.isSafeInteger(timeout) || timeout <= 0 || timeout > 2147483647)
    throw new Error("Invalid ACP timeout");
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("Invalid bridge port");
  const active = new Set();
  let closing = false;
  const agentOptions = {
    command: options.command ?? process.env.ACP_AGENT_COMMAND ?? "codex-acp",
    args: options.args ?? parseArgs(process.env.ACP_AGENT_ARGS ?? "[]"),
    cwd,
    timeout,
    secrets: [token, mcpToken].filter(Boolean),
    env: {
      ...options.agentEnv,
      INITIAL_AGENT_MODE: "read-only",
      ACP_BRIDGE_TOKEN: undefined,
      ACP_MCP_TOKEN: undefined,
    },
  };

  function authorized(req) {
    const a = Buffer.from(req.headers.authorization ?? "");
    const b = Buffer.from(`Bearer ${token}`);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    // Reject DNS rebinding Host values, even on requests without Origin.
    const authority = req.headers.host;
    if (!authority || !allowedHosts.has(authority.replace(/:\d+$/, ""))) {
      res.writeHead(403).end("Host not allowed");
      return;
    }
    if (req.headers.origin && req.headers.origin !== origin) {
      res.writeHead(403).end("Origin not allowed");
      return;
    }
    if (req.headers.origin === origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type",
      );
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Max-Age", "600");
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    if (!authorized(req)) {
      res.writeHead(401).end("Unauthorized");
      return;
    }
    if (req.method === "GET" && req.url === "/health") {
      res
        .writeHead(200, { "Content-Type": "application/json" })
        .end(JSON.stringify({ status: "ok" }));
      return;
    }
    const models = req.method === "GET" && req.url === "/models";
    const chat = req.method === "POST" && req.url === "/chat";
    if (!models && !chat) {
      res.writeHead(404).end("Not found");
      return;
    }
    if (closing || active.size >= maxConcurrent) {
      res.writeHead(503).end("Bridge busy; try again later");
      return;
    }
    const acp = new AcpClient(agentOptions);
    active.add(acp);
    let sessionId;
    let disconnected = false;
    let timeoutError;
    let promptRequest;
    let cancelling = false;
    const cancel = () => {
      if (cancelling) return;
      cancelling = true;
      if (sessionId) {
        try {
          acp.notify("session/cancel", { sessionId });
        } catch {}
      }
      if (promptRequest) {
        // Keep stdio open until the agent acknowledges cancellation, or the
        // grace period expires. EOF otherwise races Codex turn/interrupt.
        const grace = setTimeout(() => void acp.shutdown(), 1000);
        const settled = () => {
          clearTimeout(grace);
          void acp.shutdown();
        };
        void promptRequest.then(settled, settled);
      } else {
        void acp.shutdown();
      }
    };
    const onClose = () => {
      if (!res.writableEnded) {
        disconnected = true;
        cancel();
      }
    };
    res.on("close", onClose);
    let timer;
    let status = 502;
    try {
      let body;
      let prompt;
      if (chat) {
        status = 400;
        if (
          req.headers["content-type"]?.split(";")[0].trim() !==
          "application/json"
        )
          throw new Error("Expected application/json");
        let bytes = 0;
        const chunks = [];
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 2_000_000) {
            status = 413;
            throw new Error("Request exceeds 2MB");
          }
          chunks.push(chunk);
        }
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!body || typeof body !== "object")
          throw new Error("Expected request object");
        if (body.tools?.length)
          throw new Error(
            "SilverBullet function tools are not supported by ACP",
          );
        if (body.response_format && body.response_format.type !== "text")
          throw new Error(
            "Structured response formats are not supported by ACP",
          );
        for (const key of ["model", "reasoningEffort"]) {
          if (body[key] !== undefined && typeof body[key] !== "string")
            throw new Error(`${key} must be a string`);
        }
        prompt = formatTranscript(body.messages);
      }
      status = 502;
      if (disconnected) return;
      timer = setTimeout(() => {
        timeoutError = new Error(`ACP request timed out after ${timeout}ms`);
        cancel();
      }, timeout);
      const initialized = await acp.start();
      if (
        mcpServers.some((server) => server.type === "http") &&
        !initialized.agentCapabilities?.mcpCapabilities?.http
      )
        throw new Error("ACP agent does not support HTTP MCP servers");
      const session = await acp.call("session/new", { cwd, mcpServers });
      sessionId = session?.sessionId;
      if (typeof sessionId !== "string" || !sessionId)
        throw new Error("ACP session/new did not return sessionId");
      if (models) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            models: [...new Set(["default", ...modelIds(session)])],
          }),
        );
        return;
      }
      await configureSession(acp, session, body.model, body.reasoningEffort);
      res.writeHead(200, {
        "Content-Type": "application/x-ndjson; charset=utf-8",
      });
      res.flushHeaders();
      const send = (event) => {
        if (!disconnected && !res.destroyed) {
          res.write(JSON.stringify(event) + "\n");
          if (res.writableLength > 2_000_000)
            throw new Error("Client is too slow to consume ACP stream");
        }
      };
      acp.subscribe(sessionId, (update) => {
        const event = eventForUpdate(update);
        if (event) send(event);
      });
      promptRequest = acp.call("session/prompt", {
        sessionId,
        prompt: [{ type: "text", text: prompt }],
      });
      const answer = await promptRequest;
      if (timeoutError) throw timeoutError;
      if (
        ![
          "end_turn",
          "max_tokens",
          "max_turn_requests",
          "cancelled",
          "refusal",
        ].includes(answer?.stopReason)
      )
        throw new Error("ACP prompt returned an invalid stopReason");
      send({ type: "done", stopReason: answer.stopReason });
      res.end();
    } catch (error) {
      cancel();
      if (!disconnected && !res.destroyed) {
        const message = acp.redact((timeoutError ?? error).message);
        if (!res.headersSent)
          res.writeHead(timeoutError ? 504 : status, {
            "Content-Type": "application/json",
          });
        if (res.getHeader("Content-Type")?.startsWith("application/x-ndjson"))
          res.write(JSON.stringify({ type: "error", message }) + "\n");
        else res.write(JSON.stringify({ error: message }));
        res.end();
      }
    } finally {
      clearTimeout(timer);
      res.off("close", onClose);
      await acp.shutdown();
      active.delete(acp);
    }
  });
  server.requestTimeout = 30000;
  return {
    server,
    token,
    origin,
    host,
    port,
    close: async () => {
      closing = true;
      const closed = new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await Promise.all([...active].map((client) => client.shutdown()));
      server.closeAllConnections();
      await closed;
    },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const bridge = makeBridge();
  bridge.server.listen(bridge.port, bridge.host, () => {
    console.error(
      `SilverBullet ACP bridge: http://${bridge.host}:${bridge.port}`,
    );
    console.error(`Allowed browser origin: ${bridge.origin}`);
    if (!process.env.ACP_BRIDGE_TOKEN)
      console.error(`Generated Bearer token: ${bridge.token}`);
  });
  process.on("SIGINT", () => void bridge.close());
  process.on("SIGTERM", () => void bridge.close());
}
