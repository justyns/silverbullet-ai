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
  assert.equal(events.at(-1).type, "done");
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
