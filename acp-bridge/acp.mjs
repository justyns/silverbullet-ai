import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

/** A single-use ACP v1 connection. Each HTTP request owns its process. */
export class AcpClient {
  constructor({
    command,
    args = [],
    cwd,
    env = {},
    timeout = 300000,
    secrets = [],
    diagnostic = () => {},
  }) {
    Object.assign(this, { command, args, cwd, env, timeout, secrets });
    this.diagnostic = diagnostic;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.toolCalls = new Map();
    this.failure = null;
    this.child = null;
    this.closing = null;
  }

  redact(text) {
    for (const secret of this.secrets)
      if (secret) text = text.replaceAll(secret, "[redacted]");
    return text;
  }

  async start() {
    if (this.child || this.failure)
      throw new Error("ACP connection is single-use");
    const child = (this.child = spawn(this.command, this.args, {
      cwd: this.cwd,
      env: { ...process.env, ...this.env },
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      // Separate process group lets shutdown also reap agent-owned subprocesses.
      detached: process.platform !== "win32",
    }));
    this.exited = new Promise((resolve) => child.once("close", resolve));
    let buffer = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (data) => {
      if (this.failure) return;
      buffer += data;
      try {
        let end;
        while ((end = buffer.indexOf("\n")) !== -1) {
          if (end > 2_000_000) throw new Error("ACP protocol line exceeds 2MB");
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 1);
          if (line.trim()) this.receive(JSON.parse(line));
        }
        if (buffer.length > 2_000_000)
          throw new Error("ACP protocol line exceeds 2MB");
      } catch (error) {
        this.fail(new Error(`Invalid ACP protocol: ${error.message}`));
        void this.shutdown();
      }
    });
    child.stdout.on("end", () =>
      this.fail(new Error("ACP stdout closed before request completed")),
    );
    // Agent stderr can contain tool arguments, note text or unknown credentials.
    // Emit categories only; never forward the raw line.
    createInterface({ input: child.stderr }).on("line", (line) => {
      this.diagnostic({
        event: /mcp/i.test(line) ? "mcp_agent_stderr" : "agent_stderr",
        failure: /error|fail|unauthorized|timed out/i.test(line),
      });
    });
    child.stdin.on("error", (error) => this.fail(error));
    child.on("error", (error) => this.fail(error));
    child.on("exit", (code, signal) =>
      this.fail(new Error(`ACP process exited (${code ?? signal})`)),
    );
    const result = await this.call(
      "initialize",
      {
        protocolVersion: 1,
        clientCapabilities: {},
        clientInfo: { name: "silverbullet-acp-bridge", version: "0.1.0" },
      },
      Math.min(30000, this.timeout),
    );
    if (result?.protocolVersion !== 1)
      throw new Error(
        `Unsupported ACP protocol version: ${result?.protocolVersion}`,
      );
    return result;
  }

  fail(error) {
    this.failure ??= error;
    for (const task of this.pending.values()) {
      clearTimeout(task.timer);
      task.reject(this.failure);
    }
    this.pending.clear();
  }

  send(message) {
    if (this.failure) throw this.failure;
    if (!this.child?.stdin.writable)
      throw new Error("ACP process is not running");
    this.child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n",
    );
  }

  call(method, params, timeout = this.timeout) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`ACP ${method} timed out after ${timeout}ms`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.send({ id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  notify(method, params) {
    this.send({ method, params });
  }

  subscribe(sessionId, fn) {
    this.listeners.set(sessionId, fn);
    return () => this.listeners.delete(sessionId);
  }

  receive(msg) {
    if (!msg || msg.jsonrpc !== "2.0" || Array.isArray(msg))
      throw new Error("Expected a JSON-RPC 2.0 object");
    if (msg.method !== undefined && typeof msg.method !== "string")
      throw new Error("Invalid JSON-RPC method");
    if (msg.id !== undefined && !msg.method) {
      const task = this.pending.get(msg.id);
      if (!task) return;
      if ("result" in msg === "error" in msg)
        throw new Error("Expected result or error");
      clearTimeout(task.timer);
      this.pending.delete(msg.id);
      if (msg.error)
        task.reject(
          new Error(this.redact(`ACP ${msg.error.code}: ${msg.error.message}`)),
        );
      else task.resolve(msg.result);
    } else if (msg.id !== undefined) {
      if (msg.method === "session/request_permission") {
        const observed = this.toolCalls.get(msg.params?.toolCall?.toolCallId);
        const permitted =
          this.noteWriteSession === msg.params?.sessionId &&
          typeof this.noteWriteSession === "string" &&
          msg.params?._meta?.is_mcp_tool_approval === true &&
          observed?.mcp === true &&
          ["pending", "in_progress"].includes(observed.status) &&
          observed.sessionId === this.noteWriteSession &&
          !observed.approved &&
          /^mcp\.silverbullet\.(?:create_note|update_note|search_replace|update_frontmatter|rename_note)$/.test(
            observed.tool,
          );
        const allowedOption = permitted
          ? msg.params?.options?.find((o) => o.kind === "allow_once")
          : undefined;
        const option =
          allowedOption ??
          msg.params?.options?.find(
            (o) => o.kind === "reject_once" || o.kind === "reject_always",
          );
        if (allowedOption) observed.approved = true;
        else this.permissionDenied = true;
        this.diagnostic({
          event: allowedOption
            ? "note_write_permission_authorized"
            : "permission_denied",
          reason: allowedOption
            ? "deployment_authorization"
            : "interactive_approval_unsupported",
        });
        this.send({
          id: msg.id,
          result: {
            outcome: option
              ? { outcome: "selected", optionId: option.optionId }
              : { outcome: "cancelled" },
          },
        });
      } else {
        this.send({
          id: msg.id,
          error: {
            code: -32601,
            message: `Client method not supported: ${msg.method}`,
          },
        });
      }
    } else if (msg.method === "session/update") {
      const update = msg.params?.update;
      const diagnostic = diagnosticForUpdate(update);
      if (diagnostic) {
        // Correlate incremental updates without logging agent-supplied IDs.
        if (
          update.sessionUpdate === "tool_call" &&
          typeof update.toolCallId === "string"
        ) {
          this.toolCalls.set(update.toolCallId, {
            call: this.toolCalls.size + 1,
            tool: diagnostic.tool,
            mcp: update._meta?.is_mcp_tool_call === true,
            sessionId: msg.params.sessionId,
            status: update.status,
          });
        }
        const observed = this.toolCalls.get(update.toolCallId);
        if (observed && update.status) observed.status = update.status;
        if (update.status === "failed") this.toolFailed = true;
        this.diagnostic({
          ...diagnostic,
          ...(observed ? { call: observed.call, tool: observed.tool } : {}),
        });
      }
      this.listeners.get(msg.params?.sessionId)?.(msg.params.update);
    } else if (!msg.method) throw new Error("Invalid JSON-RPC notification");
  }

  shutdown() {
    if (this.closing) return this.closing;
    this.fail(new Error("ACP connection closed"));
    this.listeners.clear();
    const child = this.child;
    if (!child) return Promise.resolve();
    // EOF gives codex-acp a chance to shut down its app-server cleanly.
    child.stdin.end();
    const kill = (signal) => {
      try {
        if (process.platform !== "win32" && child.pid)
          process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch (error) {
        if (error.code !== "ESRCH") console.error(error.message);
      }
    };
    this.closing = (async () => {
      const term = setTimeout(() => kill("SIGTERM"), 2500);
      const hard = setTimeout(() => kill("SIGKILL"), 3500);
      await this.exited;
      clearTimeout(term);
      // Kill any surviving descendants even when the direct child exited first.
      kill("SIGKILL");
      clearTimeout(hard);
    })();
    return this.closing;
  }
}

export function selectOption(options, category, id = category) {
  return options?.find((item) => item.category === category || item.id === id);
}

export function listOptionValues(option) {
  return (option?.options ?? [])
    .flatMap((x) => (Array.isArray(x.options) ? x.options : [x]))
    .map((x) => x.value)
    .filter((x) => typeof x === "string");
}

export async function setOption(
  client,
  sessionId,
  options,
  category,
  desired,
  id = category,
) {
  if (!desired) return options;
  const option = selectOption(options, category, id);
  if (!option || option.type !== "select")
    throw new Error(
      `ACP agent does not advertise a ${category} selector; cannot select ${desired}`,
    );
  if (!listOptionValues(option).includes(desired)) {
    throw new Error(
      `ACP ${category} '${desired}' unavailable. Choices: ${listOptionValues(option).join(", ")}`,
    );
  }
  if (option.currentValue === desired) return options;
  const result = await client.call("session/set_config_option", {
    sessionId,
    configId: option.id,
    value: desired,
  });
  if (!Array.isArray(result?.configOptions))
    throw new Error("ACP config response missing configOptions");
  return result.configOptions;
}

export function modelIds(session) {
  const option = selectOption(session.configOptions, "model");
  return option
    ? listOptionValues(option)
    : (session.models?.availableModels ?? []).map((m) => m.modelId);
}

export async function configureSession(client, session, model, effort) {
  const sessionId = session.sessionId;
  let config = session.configOptions;
  if (model && model !== "default") {
    if (selectOption(config, "model"))
      config = await setOption(client, sessionId, config, "model", model);
    else {
      if (!modelIds(session).includes(model))
        throw new Error(`ACP model '${model}' unavailable`);
      await client.call("session/set_model", { sessionId, modelId: model });
    }
  }
  if (effort)
    config = await setOption(
      client,
      sessionId,
      config,
      "thought_level",
      effort,
      "reasoning_effort",
    );
  const mode = selectOption(config, "mode");
  if (mode && listOptionValues(mode).includes("read-only")) {
    await setOption(client, sessionId, config, "mode", "read-only");
  } else if (
    !mode &&
    session.modes?.availableModes?.some((m) => m.id === "read-only")
  ) {
    await client.call("session/set_mode", { sessionId, modeId: "read-only" });
  }
}

/** Allowlisted metadata only: titles, arguments, content and errors may contain notes. */
export function diagnosticForUpdate(update) {
  const type = update?.sessionUpdate ?? update?.type;
  if (!["tool_call", "tool_call_update"].includes(type)) return null;
  const title = typeof update.title === "string" ? update.title : "";
  const tool =
    /^(?:mcp\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+|mcp__[a-zA-Z0-9_-]+__[a-zA-Z0-9_-]+)$/.test(
      title,
    )
      ? title
      : "[withheld]";
  const status = ["pending", "in_progress", "completed", "failed"].includes(
    update.status,
  )
    ? update.status
    : "unknown";
  return { event: type, tool, status, failed: status === "failed" };
}
