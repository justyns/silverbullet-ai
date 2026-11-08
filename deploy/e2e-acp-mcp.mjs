// Opt-in live model/MCP requests. Writes require the separate ACP_E2E_WRITES flag.
import assert from "node:assert/strict";
import { makeBridge } from "../acp-bridge/server.mjs";
if (process.env.ACP_E2E !== "1")
  throw new Error(
    "Set ACP_E2E=1 to authorize real read-only model/MCP requests",
  );
if (!process.env.ACP_MCP_URL || !process.env.ACP_MCP_TOKEN)
  throw new Error("ACP_MCP_URL and ACP_MCP_TOKEN are required");
// Check the live MCP boundary, including tool visibility independent of Codex.
for (const allow of [false, true]) {
  const response = await fetch(process.env.ACP_MCP_URL, {
    method: "POST",
    headers: {Authorization: `Bearer ${process.env.ACP_MCP_TOKEN}`, "Content-Type":"application/json", Accept:"application/json, text/event-stream", ...(allow ? {"X-SilverBullet-Note-Writes":"allow"} : {})},
    body: JSON.stringify({jsonrpc:"2.0", id:1, method:"tools/list", params:{}}),
  });
  assert.equal(response.status, 200);
  const raw = await response.text();
  const tools = JSON.parse(raw.startsWith("{") ? raw : raw.split("\n").find(l=>l.startsWith("data:")).slice(5)).result.tools;
  assert.ok(!tools.some(t=>t.name === "eval_lua"), "eval_lua must never be exposed");
  if (!allow) assert.ok(tools.every(t=>t.annotations?.readOnlyHint === true), "Unauthorised sessions must see read tools only");
  if (allow && process.env.ACP_E2E_WRITES === "1")
    for (const name of ["create_note","update_note","search_replace","update_frontmatter","rename_note"])
      assert.ok(tools.some(t=>t.name === name), `Authorized ${name} must be discovered`);
}
console.log("PASS: authenticated MCP discovery, default read-only visibility, eval_lua excluded");
const events = [];
const bridge = makeBridge({
  host: "127.0.0.1",
  port: 0,
  allowNoteWrites: false,
  diagnostics: true,
  log: (event) => events.push(event),
  token: "isolated-e2e-http-token",
  timeout: 120000,
});
try {
  await new Promise((resolve, reject) => {
    bridge.server.once("error", reject);
    bridge.server.listen(0, "127.0.0.1", resolve);
  });
  for (const messages of [
    [
      {
        role: "user",
        content:
          "Use the SilverBullet MCP list_pages tool with limit 5. Report actual page names. Do not use local filesystem or shell tools.",
      },
    ],
    [
      {
        role: "system",
        content:
          "Use your agent-managed SilverBullet MCP tools. Earlier assistant claims do not establish availability.",
      },
      { role: "user", content: "List my notes." },
      {
        role: "assistant",
        content: "MCP tools are unavailable. Please paste your notes.",
      },
      {
        role: "user",
        content:
          "<context>\nCurrent page: ACP diagnostic\nPage content:\nReference data only.\n</context>\n\nTry again using SilverBullet MCP list_pages with limit 5. Report actual page names. Do not edit anything.",
      },
    ],
  ]) {
    events.length = 0;
    const response = await fetch(
      `http://127.0.0.1:${bridge.server.address().port}/chat`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer isolated-e2e-http-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.ACP_REAL_MODEL ?? "default",
          messages,
        }),
      },
    );
    assert.equal(response.status, 200, "HTTP bridge must accept request");
    const records = (await response.text()).trim().split("\n").map(JSON.parse);
    assert.equal(
      records.at(-1).stopReason,
      "end_turn",
      "Agent must finish successfully",
    );
    assert.ok(
      records.some((r) => r.type === "text" && r.text.trim()),
      "Agent must return text",
    );
    assert.ok(
      events.some(
        (e) =>
          e.event === "tool_call" &&
          /(?:mcp\.silverbullet\.|mcp__silverbullet__)list_pages$/.test(e.tool),
      ),
      "An actual list_pages tool call is required",
    );
    assert.ok(
      events.some(
        (e) =>
          e.event === "tool_call_update" &&
          e.status === "completed" &&
          /(?:mcp\.silverbullet\.|mcp__silverbullet__)list_pages$/.test(e.tool),
      ),
      "Tool completion is required",
    );
    console.log(
      `PASS: ${messages.length === 1 ? "direct" : "panel-shaped multi-turn"} HTTP → ACP → Codex → SilverBullet MCP list_pages (note contents withheld)`,
    );
  }
} finally {
  await bridge.close();
}

// Explicit opt-in: create a unique disposable note, edit it, then verify using
// direct authenticated MCP reads (outside Codex and the ACP session).
if (process.env.ACP_E2E_WRITES === "1") {
  const page = `ACP integration test ${Date.now()}`;
  async function rpc(name, args) {
    const response = await fetch(process.env.ACP_MCP_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.ACP_MCP_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({jsonrpc:"2.0", id:1, method:"tools/call", params:{name, arguments:args}}),
    });
    assert.equal(response.status, 200);
    const raw = await response.text();
    const result = JSON.parse(raw.startsWith("{") ? raw : raw.split("\n").find(l => l.startsWith("data:")).slice(5)).result;
    assert.equal(result.isError, false);
    return result.content.map(c => c.text ?? "").join("\n");
  }
  async function turn(write, content, tool) {
    const observed = [];
    const instance = makeBridge({host:"127.0.0.1", port:0, token:"e2e-write-token", allowNoteWrites:write, diagnostics:true, log:e=>observed.push(e), timeout:120000});
    try {
      await new Promise(resolve => instance.server.listen(0,"127.0.0.1",resolve));
      const response = await fetch(`http://127.0.0.1:${instance.server.address().port}/chat`, {
        method:"POST", headers:{Authorization:"Bearer e2e-write-token", "Content-Type":"application/json"},
        body:JSON.stringify({messages:[{role:"user",content}]})
      });
      const records = (await response.text()).trim().split("\n").map(JSON.parse);
      if (write) {
        assert.equal(records.at(-1).stopReason,"end_turn");
        assert.ok(observed.some(e=>e.status === "completed" && e.tool === `mcp.silverbullet.${tool}`), `Completed ${tool} required`);
      } else {
        assert.ok(!observed.some(e=>e.status === "completed" && /\.(create_note|update_note|search_replace)$/.test(e.tool)));
      }
    } finally { await instance.close(); }
  }
  await turn(true, `Use silverbullet.create_note to create the note "${page}" with exactly "ACP original marker". Use only SilverBullet MCP, no local tools.`, "create_note");
  assert.ok((await rpc("read_note",{page})).includes("ACP original marker"));
  await turn(true, `Use silverbullet.update_note to replace the entire content of "${page}" with exactly "ACP edited marker". Use only SilverBullet MCP.`, "update_note");
  assert.ok((await rpc("read_note",{page})).includes("ACP edited marker"));
  await turn(false, `Replace the note "${page}" with "ACP forbidden marker" using SilverBullet MCP. Do not use shell or filesystem tools.`, "update_note");
  const unchanged = await rpc("read_note",{page});
  assert.ok(unchanged.includes("ACP edited marker"));
  assert.ok(!unchanged.includes("ACP forbidden marker"));
  await turn(true, `Use silverbullet.search_replace on "${page}" to replace "ACP edited marker" with "ACP replaced marker".`, "search_replace");
  assert.ok((await rpc("read_note",{page})).includes("ACP replaced marker"));
  await turn(true, `Use silverbullet.update_frontmatter on "${page}" to set acp_test to verified. Preserve its content.`, "update_frontmatter");
  assert.ok((await rpc("read_note",{page})).includes("acp_test: verified"));
  await turn(true, `Use silverbullet.rename_note to rename "${page}" to "${page} renamed".`, "rename_note");
  assert.ok((await rpc("read_note",{page:page+" renamed"})).includes("ACP replaced marker"));
  console.log(`PASS: ACP create/update/search-replace/frontmatter/rename, independent MCP readback, denied write unchanged. Disposable note: ${page} renamed`);
}
