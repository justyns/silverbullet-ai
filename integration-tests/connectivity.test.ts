import { describe, expect, test } from "vitest";

const baseUrl = () => {
  const url = process.env.SB_TEST_URL;
  if (!url) throw new Error("SB_TEST_URL not set; globalSetup did not run");
  return url;
};

async function evalLua(expr: string, timeoutSec = 120): Promise<unknown> {
  const res = await fetch(`${baseUrl()}/.runtime/lua`, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "X-Timeout": String(timeoutSec),
    },
    body: expr,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Lua eval failed (${res.status}): ${text}`);
  const json = JSON.parse(text) as { result?: unknown; error?: string };
  if (json.error) throw new Error(`Lua error: ${json.error}`);
  return json.result;
}

describe("AI: Connectivity Test", () => {
  test("runs the full connectivity test against OpenRouter", async () => {
    await evalLua(
      `system.invokeFunction("silverbullet-ai.connectivityTestCommand")`,
      150,
    );

    const results = await evalLua(
      `system.invokeFunction("silverbullet-ai.getConnectivityTestResults")`,
    );
    expect(typeof results).toBe("string");
    const md = results as string;

    if (process.env.DUMP_CONNECTIVITY) console.error(md);

    expect(md).toContain("# 🛰️ AI Connectivity Test");
    expect(md).toContain("Provider successfully configured");
    expect(md).toMatch(/(?:Successfully connected to API)/);
    expect(md).not.toContain("Failed to configure provider");
    expect(md).not.toContain("Failed to connect to API");
  }, 180_000);
});
