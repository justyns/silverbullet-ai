#!/usr/bin/env node
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { basename, resolve } from "node:path";
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
  if (mcpToken && !mcpUrl && !options.mcpServers)
    throw new Error("ACP_MCP_TOKEN requires ACP_MCP_URL");
  const names = new Set();
  for (const server of mcpServers) {
    if (!/^[a-zA-Z0-9_-]+$/.test(server.name) || names.has(server.name))
      throw new Error("Invalid or duplicate session MCP server name");
    names.add(server.name);
    if (server.type !== "http")
      throw new Error("Only HTTP MCP servers are supported");
    const url = new URL(server.url);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username || url.password || url.search || url.hash
    )
      throw new Error("MCP URL must be HTTP(S) without credentials, query or fragment");
    if (!(server.headers ?? []).every((h) =>
      typeof h.name === "string" && typeof h.value === "string" &&
      !/[\r\n]/.test(h.name + h.value)
    ))
      throw new Error("Invalid MCP headers");
  }
  const cwd = resolve(options.cwd ?? process.env.ACP_WORKDIR ?? process.cwd());
  const timeout = Number(
    options.timeout ?? process.env.ACP_AGENT_TIMEOUT_MS ?? 300000,
  );
  const maxConcurrent = options.maxConcurrent ?? 4;
  if (!Number.isSafeInteger(timeout) || timeout <= 0 || timeout > 2147483647)
    throw new Error("Invalid ACP timeout");
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("Invalid bridge port");
  const allowNoteWrites =
    options.allowNoteWrites ?? process.env.ACP_ALLOW_NOTE_WRITES === "1";
  const diagnostics =
    options.diagnostics ?? process.env.ACP_DIAGNOSTICS === "1";
  const diagnostic = (event) => {
    if (diagnostics && event) {
      let encoded = JSON.stringify(event);
      for (const secret of agentOptions.secrets)
        encoded = encoded.replaceAll(secret, "[redacted]");
      (options.log ?? ((value) => console.error(JSON.stringify(value))))(
        JSON.parse(encoded),
      );
    }
  };
  const active = new Set();
  let closing = false;
  const agentOptions = {
    command: options.command ?? process.env.ACP_AGENT_COMMAND ?? "codex-acp",
    args: options.args ?? parseArgs(process.env.ACP_AGENT_ARGS ?? "[]"),
    cwd,
    timeout,
    secrets: [
      token,
      mcpToken,
      ...mcpServers.flatMap((s) => (s.headers ?? []).map((h) => h.value)),
    ].filter(Boolean),
    diagnostic,
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
        prompt = formatTranscript(body.messages, {
          allowNoteWrites,
          mcpNames: mcpServers.map((s) => s.name),
        });
        diagnostic({
          event: "chat_request",
          modelSelected: !!body.model,
          messages: body.messages.map((m) => ({
            role: m.role,
            characters: m.content.length,
          })),
          noteWrites: allowNoteWrites,
        });
      }
      status = 502;
      if (disconnected) return;
      timer = setTimeout(() => {
        timeoutError = new Error(`ACP request timed out after ${timeout}ms`);
        cancel();
      }, timeout);
      if (basename(agentOptions.command) === "codex-acp" && mcpServers.length) {
        await assertNoDuplicateMcpServers(
          mcpServers,
          options.listGlobalMcpServers,
          { cwd, env: { ...process.env, ...options.agentEnv } },
        );
      }
      diagnostic({ event: "agent_start" });
      const initialized = await acp.start();
      if (
        mcpServers.some((server) => server.type === "http") &&
        !initialized.agentCapabilities?.mcpCapabilities?.http
      )
        throw new Error("ACP agent does not support HTTP MCP servers");
      // The server enforces write authorization; the prompt alone is not a boundary.
      const sessionServers = mcpServers.map((server) =>
        server.type === "http"
          ? {
              ...server,
              headers: [
                ...(server.headers ?? []).filter(
                  (h) => h.name.toLowerCase() !== "x-silverbullet-note-writes",
                ),
                ...(chat && allowNoteWrites && server.name === "silverbullet"
                  ? [{ name: "X-SilverBullet-Note-Writes", value: "allow" }]
                  : []),
              ],
            }
          : server,
      );
      diagnostic({
        event: "session_new",
        mcpServers: sessionServers.map((s) => ({
          name: s.name,
          type: s.type,
          endpoint: new URL(s.url).origin + new URL(s.url).pathname,
          authenticated: !!s.headers?.some((h) => h.name.toLowerCase() === "authorization"),
        })),
      });
      const session = await acp.call("session/new", {
        cwd,
        mcpServers: sessionServers,
      });
      sessionId = session?.sessionId;
      if (typeof sessionId !== "string" || !sessionId)
        throw new Error("ACP session/new did not return sessionId");
      if (
        chat &&
        allowNoteWrites &&
        sessionServers.some(
          (s) => s.type === "http" && s.name === "silverbullet",
        )
      )
        acp.noteWriteSession = sessionId;
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
      diagnostic({
        event: "session_complete",
        stopReason: answer.stopReason,
        permissionDenied: acp.permissionDenied === true,
      });
      if (acp.permissionDenied)
        send({
          type: "error",
          message:
            "ACP permission request denied: interactive approval is unsupported. No permission was granted.",
        });
      else if (acp.toolFailed)
        send({ type: "error", message: "An ACP tool call failed; completion is not verified." });
      else send({ type: "done", stopReason: answer.stopReason });
      res.end();
    } catch (error) {
      diagnostic({
        event: "request_failed",
        phase: sessionId ? "prompt" : "startup",
        timeout: !!timeoutError,
      });
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

export async function assertNoDuplicateMcpServers(
  servers,
  list,
  execution = {},
) {
  list ??= async () => {
    try {
      const { stdout } = await promisify(execFile)(
        execution.env?.CODEX_PATH ?? process.env.CODEX_PATH ?? "codex",
        ["mcp", "list", "--json"],
        { ...execution, timeout: 15000, maxBuffer: 2000000 },
      );
      return JSON.parse(stdout);
    } catch {
      throw new Error(
        "Cannot inspect global Codex MCP configuration; check codex mcp list --json locally (may contain secrets).",
      );
    }
  };
  const global = await list();
  if (!Array.isArray(global))
    throw new Error("Invalid global Codex MCP configuration");
  if (
    servers.some((server) => global.some((item) => item.name === server.name))
  )
    throw new Error(
      "Duplicate global/session Codex MCP registration. Remove the global registration for the session server; credentials must come from ACP session/new.",
    );
}
