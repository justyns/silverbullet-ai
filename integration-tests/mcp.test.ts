import { describe, expect, test } from "vitest";

// These run against a real SilverBullet instance (spawned in globalSetup) with a
// real hello-world MCP server configured under `ai.mcpServers`. They exercise the
// full path: plug -> SilverBullet `/.proxy/` -> MCP server.

const baseUrl = () => {
  const url = process.env.SB_TEST_URL;
  if (!url) throw new Error("SB_TEST_URL not set; globalSetup did not run");
  return url;
};

async function evalLua(expr: string, timeoutSec = 60): Promise<unknown> {
  const res = await fetch(`${baseUrl()}/.runtime/lua`, {
    method: "POST",
    headers: { "Content-Type": "text/plain", "X-Timeout": String(timeoutSec) },
    body: expr,
  });
  const json = JSON.parse(await res.text()) as {
    result?: unknown;
    error?: string;
  };
  if (json.error) throw new Error(`Lua error: ${json.error}`);
  return json.result;
}

describe("MCP integration", () => {
  test("testMcpConnection discovers the MCP server's tools through SilverBullet", async () => {
    const report = (await evalLua(
      `system.invokeFunction("silverbullet-ai.testMcpConnection")`,
      60,
    )) as string;

    expect(report).toContain("testmcp");
    expect(report).toContain("echo");
    expect(report).toContain("add");
    expect(report).not.toContain("❌");
  }, 120_000);

  test("chat with tools invokes a real MCP tool end to end", async () => {
    const lua = `system.invokeFunction("silverbullet-ai.chat", {
      messages = {
        {
          role = "user",
          content = "Add 2 and 3 using the available add tool, then reply with only the resulting number.",
        },
      },
      useTools = true,
    })`;
    const result = (await evalLua(lua, 150)) as {
      response?: string;
      toolCalls?: string;
    };

    // Require the MCP add tool to have actually been invoked (not just the model
    // answering "5" arithmetically), and that its result reached the answer.
    expect(result.toolCalls ?? "").toContain("mcp__testmcp__add");
    expect(`${result.response ?? ""}\n${result.toolCalls ?? ""}`).toContain("5");
  }, 180_000);
});
