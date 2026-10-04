import { describe, expect, test } from "vitest";

// Exercises skill discovery against SilverBullet's real index and the import
// command against GitHub through net.readURI.

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

type ToolInfo = { name: string; source: string; parameters: any };

async function waitForSkills(names: string[]): Promise<ToolInfo> {
  for (let i = 0; i < 30; i++) {
    const tools = (await evalLua(
      `system.invokeFunction("silverbullet-ai.listTools")`,
    )) as ToolInfo[];
    const tool = tools.find((t) => t.name === "activate_skill");
    const found: string[] = tool?.parameters.properties.name.enum ?? [];
    if (names.every((n) => found.includes(n))) return tool!;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Skills not discovered: ${names.join(", ")}`);
}

describe("Skills integration", () => {
  test("discovers SKILL pages and tagged pages and activates them", async () => {
    await evalLua(`space.writePage("Library/AISkills/itest-skill/SKILL", ${JSON.stringify(
      "---\nname: itest-skill\ndescription: Integration test skill.\n---\n# Itest body\n",
    )})`);
    await evalLua(`space.writePage("Library/AISkills/itest-skill/references/REF", "ref text")`);
    await evalLua(`space.writePage("Notes/Itest Tagged", ${JSON.stringify(
      "---\ntags: meta/aiSkill\ndescription: Tagged test skill.\n---\nTagged body\n",
    )})`);

    const tool = await waitForSkills(["itest-skill", "Itest Tagged"]);
    expect(tool.source).toBe("skill");

    const activated = (await evalLua(
      `system.invokeFunction("silverbullet-ai.callTool", "activate_skill", {name = "itest-skill"})`,
    )) as { success: boolean; result: string };
    expect(activated.success).toBe(true);
    expect(activated.result).toContain("# Itest body");
    expect(activated.result).toContain("<file>references/REF.md</file>");

    const file = (await evalLua(
      `system.invokeFunction("silverbullet-ai.callTool", "activate_skill", {name = "itest-skill", file = "references/REF.md"})`,
    )) as { success: boolean; result: string };
    expect(file.result).toBe("ref text");
  }, 120_000);

  test("imports a skill folder from GitHub", async () => {
    const page = await evalLua(
      `system.invokeFunction("silverbullet-ai.importSkill", "https://github.com/anthropics/skills/tree/main/skills/pdf")`,
      120,
    );
    expect(page).toBe("Library/AISkills/pdf/SKILL");
    const files = (await evalLua(
      `(function()
        local names = {}
        for _, f in ipairs(space.listFiles()) do table.insert(names, f.name) end
        return names
      end)()`,
    )) as string[];
    const skillFiles = files.filter((f) => f.startsWith("Library/AISkills/pdf/"));
    expect(skillFiles).toContain("Library/AISkills/pdf/SKILL.md");
    expect(skillFiles.length).toBeGreaterThan(1);
    await waitForSkills(["pdf"]);

    const skillText = (await evalLua(
      `space.readPage("Library/AISkills/pdf/SKILL")`,
    )) as string;
    expect(skillText).toContain(
      `share.uri: "https://github.com/anthropics/skills/blob/main/skills/pdf/SKILL.md"`,
    );
    expect(skillText).toContain("share.mode: pull");
    expect(skillText).toContain("license: Proprietary");

    const changed = await evalLua(
      `system.invokeFunction("silverbullet-ai.updateSkill", "pdf")`,
      120,
    );
    expect(changed).toBe(false);
  }, 180_000);
});
