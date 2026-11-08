// Opt-in installed-handler test using only the official container's Runtime.
// Creates disposable pages; never saves configuration or test credentials.
import assert from "node:assert/strict";
if (process.env.ACP_E2E !== "1") throw new Error("Set ACP_E2E=1");
const page = `ACP interface test ${Date.now()}`;
const target = `${page} target`;
async function lua(body) {
  const r = await fetch(`${process.env.SB_URL}/.runtime/lua_script`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SB_AUTH_TOKEN}`, "Content-Type": "text/plain", "X-Timeout": "180" },
    body, signal: AbortSignal.timeout(190000),
  });
  const data = await r.json();
  assert.ok(r.ok && !data.error, `Runtime HTTP ${r.status} failed (details withheld)`);
  return data.result;
}
const pause = () => new Promise(resolve => setTimeout(resolve, 500));
async function onPage(prompt) {
  await lua(`editor.setText(${JSON.stringify(`**user**: ${prompt}`)})`);
  // Release Runtime before the agent calls back into Runtime through MCP.
  await lua('js.window.__sbAcpPageTestDone = false; js.window.setTimeout(function() system.invokeFunction("silverbullet-ai.streamChatOnPage"); js.window.__sbAcpPageTestDone = true end, 0)');
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    if (await lua("return js.window.__sbAcpPageTestDone")) {
      const text = await lua("return editor.getText()");
      assert.ok(/\*\*assistant\*\*:\s+[^\s*]/.test(text), "Chat-on-page must contain an answer");
      return;
    }
    await pause();
  }
  throw new Error("Chat-on-page timed out");
}
function literal(value) {
  if (value == null) return "nil";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `{${value.map(literal).join(",")}}`;
  return `{${Object.entries(value).map(([k, v]) => `[${JSON.stringify(k)}]=${literal(v)}`).join(",")}}`;
}
async function panel(messages) {
  const started = await lua(`return system.invokeFunction("silverbullet-ai.startPanelChat", ${literal(messages)})`);
  assert.ok(started.streamId && !started.error, "Panel must start");
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const chunk = await lua(`return system.invokeFunction("silverbullet-ai.getPanelChatChunk", ${JSON.stringify(started.streamId)})`);
    assert.notEqual(chunk.status, "error", "Panel stream must succeed");
    if (chunk.status === "complete") return;
    await pause();
  }
  throw new Error("Panel timed out");
}
const previous = await lua('return config.get("ai", {})');
try {
  // Runtime has its own provider selection, separate from the user's browser.
  if (process.env.ACP_BRIDGE_TOKEN) {
    await lua(`config.set {ai={providers={acp={provider="acp", baseUrl=${JSON.stringify(process.env.ACP_E2E_BRIDGE_URL ?? "http://acp-bridge:3210")}, apiKey=${JSON.stringify(process.env.ACP_BRIDGE_TOKEN)}, useProxy=false, fetchModels=false, preferredModels={"default"}}}, defaultTextModel="acp:default", chat={searchEmbeddings=false, parseWikiLinks=false}}}`);
    await lua('system.invokeFunction("silverbullet-ai.resetSelectedModels")');
  }
  await lua(`space.writePage(${JSON.stringify(page)}, "")\neditor.navigate(${JSON.stringify(page)})`);
  await lua('system.invokeFunction("silverbullet-ai.refreshConfig")');
  await onPage("Use SilverBullet MCP list_pages with limit 3. Report actual pages. Do not use local tools.");
  console.log("PASS: existing chat-on-page read handler completed");
  await panel([
    { role: "user", content: "List notes" },
    { role: "assistant", content: "MCP tools are unavailable." },
    { role: "user", content: "Try again using SilverBullet MCP list_pages with limit 3. Do not use local tools." },
  ]);
  console.log("PASS: existing panel read handler completed with history and page context");
  if (process.env.ACP_E2E_WRITES === "1") {
    await onPage(`Use silverbullet.create_note to create "${target}" with exactly "ACP interface original marker". Use only SilverBullet MCP.`);
    assert.ok((await lua(`return space.readPage(${JSON.stringify(target)})`)).includes("ACP interface original marker"));
    await panel([{ role: "user", content: `Use silverbullet.update_note to replace "${target}" with exactly "ACP interface edited marker". Use only SilverBullet MCP.` }]);
    assert.ok((await lua(`return space.readPage(${JSON.stringify(target)})`)).includes("ACP interface edited marker"));
    console.log(`PASS: existing page/panel write handlers, independent Runtime readback. Target: ${target}`);
  }
  console.log(`Disposable conversation page: ${page}`);
  // Also require ACP diagnostics showing completed calls for these requests.
  // Handler completion or generated text alone does not prove tool execution.
} finally {
  await lua(`config.set {ai=${literal(previous)}}`);
  await lua('system.invokeFunction("silverbullet-ai.resetSelectedModels")');
}
