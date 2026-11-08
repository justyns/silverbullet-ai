import { request } from "node:http";
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeBridge } from "../server.mjs";
const auth = {
  Authorization: "Bearer test-token",
  Origin: "http://localhost:3000",
  "Content-Type": "application/json",
};
async function setup(t, options = {}) {
  const bridge = makeBridge({
    token: "test-token",
    command: process.execPath,
    args: [fileURLToPath(new URL("./fake-agent.mjs", import.meta.url))],
    port: 0,
    ...options,
  });
  await new Promise((resolve) => bridge.server.listen(0, "127.0.0.1", resolve));
  t.after(() => bridge.close());
  const url = `http://127.0.0.1:${bridge.server.address().port}`;
  const chat = (content, extra = {}, signal) =>
    fetch(url + "/chat", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ messages: [{ role: "user", content }], ...extra }),
      signal,
    });
  return { bridge, url, chat };
}
const records = async (res) =>
  (await res.text()).trim().split("\n").map(JSON.parse);

test("HTTP authentication, exact Origin, Host, and preflight security", async (t) => {
  const { url } = await setup(t);
  assert.equal((await fetch(url + "/health")).status, 401);
  assert.equal(
    (
      await fetch(url + "/health", {
        headers: { ...auth, Authorization: "Bearer wrong" },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await fetch(url + "/health", {
        headers: { ...auth, Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  const hostStatus = await new Promise((resolve, reject) => {
    const req = request(
      url + "/health",
      { headers: { ...auth, Host: "evil.example" } },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.on("error", reject);
    req.end();
  });
  assert.equal(hostStatus, 403);
  const preflight = await fetch(url + "/chat", {
    method: "OPTIONS",
    headers: { Origin: auth.Origin },
  });
  assert.equal(preflight.status, 204);
  assert.equal(
    preflight.headers.get("access-control-allow-origin"),
    auth.Origin,
  );
  assert.equal((await fetch(url + "/health", { headers: auth })).status, 200);
  assert.throws(() => makeBridge({ host: "0.0.0.0" }), /loopback/);
  assert.throws(() => makeBridge({ token: "" }), /token/);
  assert.throws(() => makeBridge({ origin: "*" }), /URL|origin/);
});
test("discovers grouped config models and legacy models", async (t) => {
  for (const mode of ["", "legacy"]) {
    const { url } = await setup(t, { agentEnv: { ACP_FAKE_MODE: mode } });
    const res = await fetch(url + "/models", { headers: auth });
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).models, [
      "default",
      "model-a",
      "model-b",
    ]);
  }
});
test("selects model, dependent reasoning options, and read-only mode", async (t) => {
  const { chat } = await setup(t);
  const res = await chat("CONFIG", {
    model: "model-b",
    reasoningEffort: "high",
  });
  assert.equal(res.status, 200);
  const events = await records(res);
  assert.deepEqual(JSON.parse(events.find((e) => e.type === "text").text), [
    ["model", "model-b"],
    ["reasoning_effort", "high"],
    ["mode", "read-only"],
  ]);
  assert.deepEqual(events[0], { type: "reasoning", text: "thinking" });
  assert.deepEqual(events.at(-1), { type: "done", stopReason: "end_turn" });
});
test("invalid model and reasoning selection fail explicitly", async (t) => {
  const { chat } = await setup(t);
  for (const extra of [{ model: "missing" }, { reasoningEffort: "missing" }]) {
    const res = await chat("hello", extra);
    assert.equal(res.status, 502);
    assert.match(await res.text(), /unavailable/);
  }
});
test("preserves ordered full history in a single prompt without replaying turns", async (t) => {
  const { chat } = await setup(t);
  const res = await chat("", {
    messages: [
      { role: "system", content: "Rule" },
      { role: "user", content: "First" },
      { role: "assistant", content: "Answer" },
      { role: "user", content: "TRANSCRIPT" },
    ],
  });
  const text = (await records(res)).find((e) => e.type === "text").text;
  assert.match(text, /\[system\]\nRule\n\[\/system\]/);
  assert.ok(text.indexOf("First") < text.indexOf("Answer"));
  assert.ok(text.indexOf("Answer") < text.indexOf("TRANSCRIPT"));
});
test("simultaneous sessions with identical IDs do not mix streams; crash is isolated", async (t) => {
  const { chat } = await setup(t);
  const [a, b, crash] = await Promise.all([
    chat("SLOW MARKER_ALPHA").then(records),
    chat("MARKER_BETA").then(records),
    chat("CRASH").then((r) => r.text()),
  ]);
  assert.equal(a.find((e) => e.type === "text").text, "MARKER_ALPHA");
  assert.equal(b.find((e) => e.type === "text").text, "MARKER_BETA");
  assert.match(crash, /exited|stdout closed/);
  assert.equal((await chat("recovered").then(records)).at(-1).type, "done");
});
test("denies permission and client filesystem execution", async (t) => {
  const { chat } = await setup(t);
  const events = await chat("PERMISSION").then(records);
  assert.equal(events[0].text, "denied");
  assert.equal(events.at(-1).type, "error");
  assert.match(events.at(-1).message, /permission request denied/);
});
test("reports ACP errors, authentication, malformed protocol, version mismatch and spawn errors", async (t) => {
  const { chat } = await setup(t);
  assert.match(await (await chat("FAIL")).text(), /Intentional agent error/);
  for (const [mode, pattern] of [
    ["auth", /Authentication required/],
    ["malformed", /Invalid ACP protocol/],
    ["v2", /Unsupported ACP protocol version/],
  ]) {
    const { url } = await setup(t, { agentEnv: { ACP_FAKE_MODE: mode } });
    const res = await fetch(url + "/models", { headers: auth });
    assert.equal(res.status, 502);
    assert.match(await res.text(), pattern);
  }
  const { url } = await setup(t, { command: "/nonexistent/acp-agent" });
  assert.match(
    await (await fetch(url + "/models", { headers: auth })).text(),
    /ENOENT/,
  );
});
test("rejects malformed input and unsupported tools, attachments and JSON formats", async (t) => {
  const { chat, url } = await setup(t);
  for (const extra of [
    { messages: [] },
    { tools: [{}] },
    { model: 1 },
    { response_format: { type: "json_object" } },
    {
      messages: [
        { role: "user", content: "hi", attachments: [{ binary: {} }] },
      ],
    },
  ]) {
    assert.equal((await chat("hi", extra)).status, 400);
  }
  assert.equal(
    (
      await fetch(url + "/chat", {
        method: "POST",
        headers: auth,
        body: "{bad",
      })
    ).status,
    400,
  );
});
test("enforces initialization and streaming timeouts", async (t) => {
  const { chat } = await setup(t, { timeout: 250 });
  const events = await chat("HANG").then(records);
  assert.equal(events.at(-1).type, "error");
  assert.match(events.at(-1).message, /timed out/);
  const { url } = await setup(t, {
    timeout: 150,
    agentEnv: { ACP_FAKE_MODE: "hang-init" },
  });
  const res = await fetch(url + "/models", { headers: auth });
  assert.equal(res.status, 504);
});
test("disconnect sends session/cancel and releases process slot", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "acp-cancel-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "cancel");
  const { chat } = await setup(t, {
    agentEnv: { ACP_FAKE_CANCEL_FILE: path },
    maxConcurrent: 1,
  });
  const controller = new AbortController();
  const res = await chat("HANG", {}, controller.signal);
  const reader = res.body.getReader();
  await reader.read();
  controller.abort();
  await reader.cancel().catch(() => {});
  let log;
  for (let i = 0; i < 100; i++) {
    try {
      log = await readFile(path, "utf8");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  assert.equal(log, "session-1\n");
  let recovered;
  for (let i = 0; i < 100; i++) {
    recovered = await chat("after cancellation");
    if (recovered.status !== 503) break;
    await recovered.text();
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.equal(recovered.status, 200);
  assert.equal((await records(recovered)).at(-1).type, "done");
});

test("default works without model selectors; legacy selection works", async (t) => {
  const minimal = await setup(t, { agentEnv: { ACP_FAKE_MODE: "no-models" } });
  assert.deepEqual(
    (await (await fetch(minimal.url + "/models", { headers: auth })).json())
      .models,
    ["default"],
  );
  assert.equal(
    (await minimal.chat("hello", { model: "default" }).then(records)).at(-1)
      .type,
    "done",
  );
  assert.equal((await minimal.chat("hello", { model: "missing" })).status, 502);
  const legacy = await setup(t, { agentEnv: { ACP_FAKE_MODE: "legacy" } });
  assert.equal(
    (await legacy.chat("hello", { model: "model-b" }).then(records)).at(-1)
      .type,
    "done",
  );
});
test("rejects oversized input and unsupported output", async (t) => {
  const { chat } = await setup(t);
  const oversized = await chat("x".repeat(2_000_001));
  assert.equal(oversized.status, 413);
  const events = await chat("IMAGE").then(records);
  assert.equal(events.at(-1).type, "error");
  assert.match(events.at(-1).message, /unsupported agent content/);
});
test("enforces concurrency limit while another prompt is running", async (t) => {
  const { chat } = await setup(t, { maxConcurrent: 1 });
  const controller = new AbortController();
  const first = await chat("HANG", {}, controller.signal);
  const reader = first.body.getReader();
  await reader.read();
  assert.equal((await chat("second")).status, 503);
  controller.abort();
  await reader.cancel().catch(() => {});
});

test("keeps stdio open while the agent acknowledges cancellation", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "acp-cancel-ack-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "cancel");
  const { chat } = await setup(t, {
    agentEnv: { ACP_FAKE_CANCEL_FILE: path, ACP_FAKE_CANCEL_DELAY_MS: "100" },
  });
  const controller = new AbortController();
  const response = await chat("HANG", {}, controller.signal);
  const reader = response.body.getReader();
  await reader.read();
  controller.abort();
  await reader.cancel().catch(() => {});
  let log = "";
  for (let i = 0; i < 100; i++) {
    try {
      log = await readFile(path, "utf8");
      if (log.includes("ack:")) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(log, "session-1\nack:false\n");
});

test("terminates a timed-out agent that ignores cancellation", async (t) => {
  const { chat } = await setup(t, {
    timeout: 250,
    agentEnv: { ACP_FAKE_IGNORE_CANCEL: "1" },
  });
  const events = await chat("HANG").then(records);
  assert.equal(events.at(-1).type, "error");
  assert.match(events.at(-1).message, /timed out/);
});

test("container binding is opt-in, authenticated, and Host restricted", async (t) => {
  const previousToken = process.env.ACP_BRIDGE_TOKEN;
  delete process.env.ACP_BRIDGE_TOKEN;
  t.after(() => {
    if (previousToken !== undefined)
      process.env.ACP_BRIDGE_TOKEN = previousToken;
  });
  assert.throws(
    () => makeBridge({ host: "0.0.0.0", allowNetwork: true }),
    /explicit ACP_BRIDGE_TOKEN/,
  );
  assert.throws(() => makeBridge({ allowedHosts: ["*"] }), /exact hostnames/);
  const { url } = await setup(t, {
    host: "0.0.0.0",
    allowNetwork: true,
    allowedHosts: ["acp-bridge"],
  });
  const status = await new Promise((resolve, reject) => {
    const req = request(
      url + "/health",
      { headers: { ...auth, Host: "acp-bridge:3210" } },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.on("error", reject);
    req.end();
  });
  assert.equal(status, 200);
});
test("passes configured authenticated MCP servers to every fresh session", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "acp-mcp-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "sessions");
  const { url, chat } = await setup(t, {
    mcpUrl: "http://mcp-bridge:3001/mcp",
    mcpToken: "test-mcp-secret",
    agentEnv: { ACP_FAKE_SESSION_FILE: path },
  });
  assert.equal((await fetch(url + "/models", { headers: auth })).status, 200);
  assert.equal((await chat("hello").then(records)).at(-1).type, "done");
  const sessions = (await readFile(path, "utf8"))
    .trim()
    .split("\n")
    .map(JSON.parse);
  assert.equal(sessions.length, 2);
  for (const session of sessions)
    assert.deepEqual(session.mcpServers, [
      {
        type: "http",
        name: "silverbullet",
        url: "http://mcp-bridge:3001/mcp",
        headers: [{ name: "Authorization", value: "Bearer test-mcp-secret" }],
      },
    ]);
  assert.throws(() => makeBridge({ mcpUrl: "file:///tmp/not-http" }), /HTTP/);
});

test("redacts configured credentials from agent error responses", async (t) => {
  const { chat } = await setup(t, {
    mcpUrl: "http://localhost:3001/mcp",
    mcpToken: "secret-mcp-value",
    agentEnv: {
      ACP_FAKE_ERROR_MESSAGE: "MCP rejected secret-mcp-value and test-token",
    },
  });
  const response = await chat("FAIL");
  const text = await response.text();
  assert.doesNotMatch(text, /secret-mcp-value|test-token/);
  assert.match(text, /\[redacted\]/);
});

test("rejects an agent without the configured HTTP MCP capability", async (t) => {
  const { url } = await setup(t, {
    mcpUrl: "http://mcp-bridge:3001/mcp",
    agentEnv: { ACP_FAKE_NO_HTTP_MCP: "1" },
  });
  const response = await fetch(url + "/models", { headers: auth });
  assert.equal(response.status, 502);
  assert.match(await response.text(), /does not support HTTP MCP/);
});

test("requires deployment authorization regardless of request fields", async (t) => {
  const disabled = await setup(t, { allowNoteWrites: false });
  assert.equal(
    (await disabled.chat("edit", { allowNoteWrites: true })).status,
    200,
  );
  const dir = await mkdtemp(join(tmpdir(), "acp-writes-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "sessions");
  const enabled = await setup(t, {
    allowNoteWrites: true,
    mcpUrl: "http://mcp-bridge:3001/mcp",
    agentEnv: { ACP_FAKE_SESSION_FILE: path },
  });
  await enabled.chat("edit", { allowNoteWrites: true }).then(records);
  await enabled.chat("read").then(records);
  const sessions = (await readFile(path, "utf8"))
    .trim()
    .split("\n")
    .map(JSON.parse);
  assert.deepEqual(sessions[0].mcpServers[0].headers, [
    { name: "X-SilverBullet-Note-Writes", value: "allow" },
  ]);
  assert.deepEqual(sessions[1].mcpServers[0].headers, sessions[0].mcpServers[0].headers);
});

test("observes protocol tool events without leaking tool arguments, results or errors", async (t) => {
  const logs = [];
  const { chat } = await setup(t, {
    diagnostics: true,
    log: (event) => logs.push(event),
  });
  const events = await chat("TOOL_EVENTS").then(records);
  assert.equal(events.at(-1).type, "error");
  assert.ok(
    logs.some(
      (e) =>
        e.event === "tool_call" && e.tool === "mcp.silverbullet.list_pages",
    ),
  );
  assert.ok(
    logs.some((e) => e.event === "tool_call_update" && e.status === "failed"),
  );
  assert.doesNotMatch(
    JSON.stringify(logs),
    /private-note|secret-argument|secret-error|Authorization/,
  );
});

test("detects duplicate global MCP registrations without exposing configuration", async () => {
  const { assertNoDuplicateMcpServers } = await import("../server.mjs");
  await assert.rejects(
    assertNoDuplicateMcpServers([{ name: "silverbullet" }], async () => [
      { name: "silverbullet", token: "secret" },
    ]),
    /Duplicate global\/session/,
  );
  await assertNoDuplicateMcpServers([{ name: "silverbullet" }], async () => [
    { name: "other" },
  ]);
});

test("retains mistaken assistant history but instructs current tool verification", async (t) => {
  const { chat } = await setup(t);
  const res = await chat("", {
    messages: [
      { role: "system", content: "Use configured MCP tools." },
      { role: "user", content: "List notes" },
      { role: "assistant", content: "MCP is unavailable." },
      { role: "user", content: "TRANSCRIPT Try again" },
    ],
  });
  const text = (await records(res)).find((e) => e.type === "text").text;
  assert.match(text, /MCP is unavailable/);
  assert.match(text, /Retry relevant tools/);
  assert.match(text, /Do not execute shell commands/);
  assert.match(text, /remote MCP tools/);
});

test("only a correlated SilverBullet note writer can use deployment ACP permission", async (t) => {
  for (const [tool, authorized, mcp, allowed] of [
    ["mcp.silverbullet.update_note", true, true, true],
    ["mcp.silverbullet.update_note", false, true, false],
    ["mcp.silverbullet.eval_lua", true, true, false],
    ["mcp.other.update_note", true, true, false],
    ["mcp.codex_apps.update_note", true, true, false],
    ["mcp.codex_apps.eval_lua", true, true, false],
    ["mcp.codex_apps.execute_document_command", true, true, false],
    ["shell", true, true, false],
    ["mcp.silverbullet.update_note", true, false, false],
  ]) {
    const logs = [];
    const { chat } = await setup(t, {
      allowNoteWrites: authorized,
      mcpUrl: "http://mcp-bridge:3001/mcp",
      diagnostics: true,
      log: (event) => logs.push(event),
      agentEnv: {
        ACP_FAKE_PERMISSION_TOOL: tool,
        ACP_FAKE_PERMISSION_NO_MCP: mcp ? "0" : "1",
      },
    });
    const events = await chat("NOTE_PERMISSION", {
      allowNoteWrites: authorized,
    }).then(records);
    assert.equal(events[0].text, allowed ? "note-allowed" : "note-denied");
    assert.equal(events.at(-1).type, allowed ? "done" : "error");
    assert.ok(
      logs.some(
        (e) =>
          e.event ===
          (allowed ? "note_write_permission_authorized" : "permission_denied"),
      ),
    );
  }
});

test("note-write approvals require matching active session/call metadata and cannot be reused or persisted", async () => {
  const { AcpClient } = await import("../acp.mjs");
  const client = new AcpClient({ command: "unused" });
  const sent = [];
  client.send = (message) => sent.push(message);
  client.noteWriteSession = "authorized-session";
  const notification = {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "authorized-session",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "one-call",
        title: "mcp.silverbullet.create_note",
        status: "in_progress",
        _meta: { is_mcp_tool_call: true },
      },
    },
  };
  client.receive(notification);
  const permission = {
    jsonrpc: "2.0",
    id: 1,
    method: "session/request_permission",
    params: {
      sessionId: "authorized-session",
      _meta: { is_mcp_tool_approval: true },
      toolCall: { toolCallId: "one-call" },
      options: [
        { kind: "allow_always", optionId: "always" },
        { kind: "allow_once", optionId: "once" },
        { kind: "reject_once", optionId: "deny" },
      ],
    },
  };
  for (const params of [
    { ...permission.params, sessionId: "other-session" },
    { ...permission.params, toolCall: { toolCallId: "unknown" } },
    { ...permission.params, _meta: {} },
    {
      ...permission.params,
      options: permission.params.options.filter((o) => o.kind !== "allow_once"),
    },
  ]) {
    client.receive({ ...permission, params });
    assert.equal(sent.at(-1).result.outcome.optionId, "deny");
  }
  client.receive(permission);
  assert.equal(sent.at(-1).result.outcome.optionId, "once");
  client.receive(permission);
  assert.equal(sent.at(-1).result.outcome.optionId, "deny");
  client.receive(notification);
  client.receive({
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "authorized-session",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "one-call",
        status: "completed",
      },
    },
  });
  client.receive(permission);
  assert.equal(sent.at(-1).result.outcome.optionId, "deny");
});

 test("rejects missing, invalid and duplicate MCP configuration", () => {
   assert.throws(() => makeBridge({mcpToken: "unused"}), /requires ACP_MCP_URL/);
   for (const url of ["file:///tmp/mcp", "http://user:pass@localhost/mcp", "http://localhost/mcp?secret=value"]) {
     assert.throws(() => makeBridge({mcpUrl: url}));
   }
   assert.throws(() => makeBridge({mcpServers: [1, 2].map(() => ({name: "silverbullet", type: "http", url: "http://localhost/mcp"}))}), /duplicate/);
 });
