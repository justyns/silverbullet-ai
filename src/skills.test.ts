import { beforeEach, describe, expect, test } from "vitest";
import "./mocks/syscalls.ts";
import { syscall } from "@silverbulletmd/silverbullet/syscalls";
import { initializeOpenAI } from "./init.ts";
import {
  buildSkillTool,
  discoverSkills,
  parseGitHubSkillUrl,
  splitFrontmatter,
} from "./skills.ts";
import { discoverAllTools, executeTool } from "./tools.ts";

const pdfSkill = `---
name: pdf-processing
description: Extract text from PDFs. Use when handling PDFs.
---

# PDF Processing

See references/REFERENCE.md.
`;

async function activate(args: Record<string, unknown>) {
  return await executeTool("activate_skill", args, await discoverAllTools());
}

async function setup(ai: Record<string, unknown> = {}) {
  await syscall("mock.setConfig", "ai", {
    textModels: [
      { name: "mock", provider: "mock", modelName: "mock", requireAuth: false },
    ],
    ...ai,
  });
  await syscall("mock.setConfig", "ai.keys", {});
  await initializeOpenAI();
  await syscall("mock.clearIndexedObjects");
}

beforeEach(async () => {
  await setup();
  await syscall("mock.setPage", "Library/AISkills/pdf-processing/SKILL", pdfSkill);
  await syscall(
    "mock.setPage",
    "Library/AISkills/pdf-processing/references/REFERENCE",
    "Reference text",
  );
  await syscall(
    "mock.setDocument",
    "Library/AISkills/pdf-processing/scripts/extract.py",
    new TextEncoder().encode("print('hi')"),
  );
  await syscall("mock.setPage", "Notes/Weekly Review", "---\ntags: meta/aiSkill\n---\nDo the review.");
  await syscall("mock.setIndexedObjects", "page", [
    { name: "Library/AISkills/pdf-processing/SKILL" },
    {
      name: "Notes/Weekly Review",
      description: "Run a weekly review.",
      itags: ["meta/aiSkill"],
    },
  ]);
});

describe("splitFrontmatter", () => {
  test("separates frontmatter from body", () => {
    const { frontmatter, body } = splitFrontmatter(pdfSkill);
    expect(frontmatter.name).toBe("pdf-processing");
    expect(body.startsWith("# PDF Processing")).toBe(true);
  });

  test("returns the whole text as body without frontmatter", () => {
    expect(splitFrontmatter("just text\n")).toEqual({
      frontmatter: {},
      body: "just text",
    });
  });
});

describe("discoverSkills", () => {
  test("finds SKILL pages and tagged pages", async () => {
    const skills = await discoverSkills();
    expect(skills).toEqual([
      {
        name: "pdf-processing",
        description: "Extract text from PDFs. Use when handling PDFs.",
        page: "Library/AISkills/pdf-processing/SKILL",
        dir: "Library/AISkills/pdf-processing",
      },
      {
        name: "Weekly Review",
        description: "Run a weekly review.",
        page: "Notes/Weekly Review",
        dir: "Notes/Weekly Review",
      },
    ]);
  });

  test("ignores SKILL pages outside the configured paths", async () => {
    await setup({ skills: { paths: ["Other"] } });
    await syscall("mock.setIndexedObjects", "page", [
      { name: "Library/AISkills/pdf-processing/SKILL" },
    ]);
    expect(await discoverSkills()).toEqual([]);
  });

  test("skips skills without a description", async () => {
    await syscall("mock.setPage", "Library/AISkills/bad/SKILL", "---\nname: bad\n---\nbody");
    await syscall("mock.setIndexedObjects", "page", [
      { name: "Library/AISkills/bad/SKILL" },
    ]);
    expect(await discoverSkills()).toEqual([]);
  });

  test("SKILL pages shadow tagged pages with the same name", async () => {
    await syscall("mock.setIndexedObjects", "page", [
      { name: "Notes/pdf-processing", description: "Tagged", itags: ["meta/aiSkill"] },
      { name: "Library/AISkills/pdf-processing/SKILL" },
    ]);
    const skills = await discoverSkills();
    expect(skills.length).toBe(1);
    expect(skills[0].page).toBe("Library/AISkills/pdf-processing/SKILL");
  });
});

describe("activate_skill tool", () => {
  test("is registered with a catalog and name enum", async () => {
    const tools = await discoverAllTools();
    const tool = tools.get("activate_skill")!;
    expect(tool.source).toBe("skill");
    expect(tool.description).toContain(
      "- pdf-processing: Extract text from PDFs. Use when handling PDFs.",
    );
    expect((tool.parameters.properties as any).name.enum).toEqual([
      "pdf-processing",
      "Weekly Review",
    ]);
  });

  test("is not registered when no skills exist", async () => {
    await syscall("mock.setIndexedObjects", "page", []);
    const tools = await discoverAllTools();
    expect(tools.has("activate_skill")).toBe(false);
  });

  test("returns the body and bundled files", async () => {
    const tools = await discoverAllTools();
    const result = await executeTool(
      "activate_skill",
      { name: "pdf-processing" },
      tools,
    );
    expect(result.success).toBe(true);
    expect(result.result).toContain('<skill_content name="pdf-processing">');
    expect(result.result).toContain("# PDF Processing");
    expect(result.result).not.toContain("description:");
    expect(result.result).toContain("<file>references/REFERENCE.md</file>");
    expect(result.result).toContain("<file>scripts/extract.py</file>");
    expect(result.result).not.toContain("<file>SKILL.md</file>");
  });

  test("reads a bundled file", async () => {
    const result = await activate({
      name: "pdf-processing",
      file: "scripts/extract.py",
    });
    expect(result).toMatchObject({ success: true, result: "print('hi')" });
  });

  test("rejects paths leaving the skill folder", async () => {
    const result = await activate({
      name: "pdf-processing",
      file: "../other/SKILL.md",
    });
    expect(result.success).toBe(false);
  });

  test("errors on unknown skills", async () => {
    const result = await activate({ name: "nope" });
    expect(result).toEqual({ success: false, error: "Unknown skill: nope" });
  });

  test("buildSkillTool marks the tool read-only", () => {
    expect(buildSkillTool([]).readOnly).toBe(true);
  });
});

describe("parseGitHubSkillUrl", () => {
  test("parses folder URLs", () => {
    expect(
      parseGitHubSkillUrl("https://github.com/anthropics/skills/tree/main/skills/pdf"),
    ).toEqual({ owner: "anthropics", repo: "skills", ref: "main", dir: "skills/pdf" });
  });

  test("parses SKILL.md blob URLs", () => {
    expect(
      parseGitHubSkillUrl(
        "https://github.com/anthropics/skills/blob/main/skills/pdf/SKILL.md",
      ),
    ).toEqual({ owner: "anthropics", repo: "skills", ref: "main", dir: "skills/pdf" });
  });

  test("returns null for other URLs", () => {
    expect(parseGitHubSkillUrl("https://example.com/SKILL.md")).toBeNull();
  });
});
