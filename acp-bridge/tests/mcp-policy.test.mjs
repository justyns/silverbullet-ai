import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

// Real MCP transport and Runtime API mapping; all notes exist only in this fixture.
for (const setting of [undefined, "1", "0"])
  test(`MCP HTTP policy MCP_READ_ONLY=${setting ?? "unset"}`, async (t) => {
    const readOnly = setting !== "0";
    let calls = [];
    let page = "original";
    const definitions = [
      ...["view_file", "read_note", "list_pages", "get_page_info"].map(
        (name) => ({ name, readOnly: true }),
      ),
      ...[
        "update_note",
        "search_replace",
        "create_note",
        "update_frontmatter",
        "rename_note",
        "eval_lua",
        "ask_user",
        "navigate",
        "custom_dangerous",
      ].map((name) => ({ name, readOnly: name === "update_note" })),
    ].map((tool) => ({
      ...tool,
      description: tool.name,
      source: "builtin",
      parameters: { type: "object", properties: {} },
    }));
    const runtime = createServer(async (req, res) => {
      let script = "";
      for await (const chunk of req) script += chunk;
      if (script.includes("listTools"))
        res.end(JSON.stringify({ result: definitions }));
      else {
        calls.push(script);
        if (script.includes('"error-prefix-note"')) {
          res.end(JSON.stringify({result:{success:true,result:"Error: valid note content",summary:"Read note"}}));
          return;
        }
        if (script.includes('"missing-page"')) {
          res.end(JSON.stringify({result:{success:true,result:"Error: Page not found"}}));
          return;
        }
        if (script.includes('"update_note"')) page = "updated";
        res.end(JSON.stringify({ result: { success: true, result: page } }));
      }
    });
    await new Promise((resolve) => runtime.listen(0, "127.0.0.1", resolve));
    t.after(() => new Promise((resolve) => runtime.close(resolve)));
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "mcp-bridge/index.ts"],
      {
        env: {
          ...process.env,
          SB_URL: `http://127.0.0.1:${runtime.address().port}`,
          MCP_PORT: "0",
          MCP_TOKEN: "test-mcp",
          MCP_READ_ONLY: setting,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    t.after(() => {
      child.kill();
    });
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("MCP startup timeout")),
        10000,
      );
      child.once("exit", () => {
        clearTimeout(timer);
        reject(new Error("MCP startup failed"));
      });
      createInterface({ input: child.stderr }).on("line", (line) => {
        const match = line.match(/listening on port (\d+)/);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      });
    });
    async function rpc(method, params = {}, allow = false) {
      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: "POST",
        headers: {
          Authorization: "Bearer test-mcp",
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          ...(allow ? { "X-SilverBullet-Note-Writes": "allow" } : {}),
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const text = await response.text();
      return JSON.parse(
        text.startsWith("{")
          ? text
          : text
              .split("\n")
              .find((line) => line.startsWith("data:"))
              .slice(5),
      );
    }
    assert.equal((await fetch(`http://127.0.0.1:${port}/mcp`, {method: "POST"})).status, 401);
    const restricted = await rpc("tools/list");
    assert.ok(!restricted.result.tools.some(t => t.name === "update_note"));
    const list = await rpc("tools/list", {}, true);
    const names = list.result.tools.map((tool) => tool.name);
    assert.deepEqual(names, [
      "refresh_tools",
      "view_file",
      "read_note",
      "list_pages",
      "get_page_info",
      ...(readOnly
        ? []
        : [
            "update_note",
            "search_replace",
            "create_note",
            "update_frontmatter",
            "rename_note",
          ]),
    ]);
    assert.equal(
      (
        await rpc("tools/call", {
          name: "read_note",
          arguments: { page: "disposable" },
        })
      ).result.isError,
      false,
    );
    assert.equal((await rpc("tools/call", {name:"read_note", arguments:{page:"missing-page"}})).result.isError, true);
    const validErrorPrefix = await rpc("tools/call", {name:"read_note", arguments:{page:"error-prefix-note"}});
    assert.equal(validErrorPrefix.result.isError, false);
    assert.equal(validErrorPrefix.result.content[0].text, "Error: valid note content");
    assert.ok(restricted.result.tools.every(t => t.annotations?.readOnlyHint === true));
    calls = [];
    assert.equal(
      (
        await rpc("tools/call", {
          name: "update_note",
          arguments: { page: "disposable", content: "updated" },
        })
      ).result.isError,
      true,
    );
    assert.equal(page, "original");
    assert.equal(calls.length, 0);
    const write = await rpc(
      "tools/call",
      {
        name: "update_note",
        arguments: { page: "disposable", content: "updated" },
      },
      true,
    );
    assert.equal(write.result.isError, readOnly);
    assert.equal(page, readOnly ? "original" : "updated");
    assert.equal(
      (
        await rpc(
          "tools/call",
          { name: "eval_lua", arguments: { code: "bad" } },
          true,
        )
      ).result.isError,
      true,
    );
  });
