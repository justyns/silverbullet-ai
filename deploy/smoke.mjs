// Run inside acp-bridge. No session/new or session/prompt and no model requests.
import assert from "node:assert/strict";
import { lookup } from "node:dns/promises";
import { execFileSync } from "node:child_process";
import { AcpClient } from "../acp-bridge/acp.mjs";
for (const host of ["silverbullet", "mcp-bridge", "acp-bridge"]) {
  await lookup(host);
  console.log(`DNS: ${host} OK`);
}
const acp = "http://acp-bridge:3210";
assert.equal((await fetch(acp + "/health")).status, 401);
const auth = { Authorization: `Bearer ${process.env.ACP_BRIDGE_TOKEN}` };
assert.equal((await fetch(acp + "/health", { headers: auth })).status, 200);
assert.equal(
  (
    await fetch(acp + "/health", {
      headers: { ...auth, Origin: "https://invalid.example" },
    })
  ).status,
  403,
);
console.log("ACP authentication, configured Host, and Origin checks OK");
const rpc = async (method, params, authorized = true) =>
  fetch(process.env.ACP_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(authorized
        ? { Authorization: `Bearer ${process.env.ACP_MCP_TOKEN}` }
        : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(90000),
  });
const init = {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "deployment-smoke", version: "1" },
};
assert.equal((await rpc("initialize", init, false)).status, 401);
const initialized = await rpc("initialize", init);
assert.equal(initialized.status, 200);
assert.match(await initialized.text(), /protocolVersion/);
const listed = await rpc("tools/list", {});
assert.equal(listed.status, 200);
const listedText = await listed.text();
const payload = listedText.startsWith("{")
  ? listedText
  : listedText
      .split("\n")
      .find((line) => line.startsWith("data:"))
      .slice(5)
      .trim();
const tools = JSON.parse(payload).result.tools;
assert.ok(tools.length > 1);
if (!process.argv.includes("--allow-write-tools"))
  assert.ok(tools.every((tool) => tool.annotations?.readOnlyHint === true));
console.log(`MCP tools listed: ${tools.length}; read-only annotations checked`);
if (!process.argv.includes("--allow-write-tools")) {
  const blocked = await rpc("tools/call", {
    name: "create_note",
    arguments: { page: "must-not-be-created" },
  });
  assert.match(await blocked.text(), /Unknown tool: create_note/);
}
const refreshed = await rpc("tools/call", {
  name: "refresh_tools",
  arguments: {},
});
assert.equal(refreshed.status, 200);
const text = await refreshed.text();
assert.match(text, /Reloaded/);
assert.doesNotMatch(text, /"isError":true/);
console.log(
  "MCP auth and authenticated SilverBullet Runtime API tool refresh OK",
);
console.log(
  execFileSync("codex-acp", ["--version"], { encoding: "utf8" }).trim(),
);
console.log(execFileSync("codex", ["--version"], { encoding: "utf8" }).trim());
assert.match(
  execFileSync("codex", ["login", "--help"], { encoding: "utf8" }),
  /--device-auth/,
);
console.log("Codex device-login flag verified (login not performed)");
const client = new AcpClient({
  command: "codex-acp",
  cwd: "/workspace",
  timeout: 30000,
  env: {
    INITIAL_AGENT_MODE: "read-only",
    ACP_BRIDGE_TOKEN: undefined,
    ACP_MCP_TOKEN: undefined,
  },
});
try {
  const initialized = await client.start();
  assert.equal(initialized.protocolVersion, 1);
  assert.equal(initialized.agentCapabilities.mcpCapabilities.http, true);
  console.log(
    "Real ACP adapter/App Server initialization OK (no prompt submitted)",
  );
} finally {
  await client.shutdown();
}
