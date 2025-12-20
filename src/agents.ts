import { editor, index, lua, space } from "@silverbulletmd/silverbullet/syscalls";
import type { AIAgentTemplate, Attachment, LuaToolDefinition } from "./types.ts";
import { luaLongString } from "./utils.ts";

/**
 * Discovers all AI agent templates from both Lua registry and page templates.
 * Lua agents are defined in ai.agents table.
 * Page agents are tagged with meta/template/aiAgent.
 */
export async function discoverAgents(): Promise<AIAgentTemplate[]> {
  const agents: AIAgentTemplate[] = [];

  // Discover Lua-registered agents from ai.agents table
  try {
    const luaAgents = await lua.evalExpression("ai.agents or {}") as Record<
      string,
      {
        name?: string;
        description?: string;
        systemPrompt?: string;
        tools?: string[];
        toolsExclude?: string[];
      }
    >;

    for (const [key, agent] of Object.entries(luaAgents)) {
      if (agent && typeof agent === "object") {
        agents.push({
          ref: `lua:${key}`,
          aiagent: {
            name: agent.name || key,
            description: agent.description,
            systemPrompt: agent.systemPrompt,
            tools: agent.tools,
            toolsExclude: agent.toolsExclude,
          },
        });
      }
    }
  } catch (error) {
    console.error("Failed to discover Lua agents:", error);
  }

  // Discover page-based agents
  try {
    const pageAgents = await index.queryLuaObjects<AIAgentTemplate>("page", {
      objectVariable: "_",
      where: await lua.parseExpression(
        "_.itags and table.includes(_.itags, 'meta/template/aiAgent') and _.aiagent",
      ),
    });
    agents.push(...pageAgents);
  } catch (error) {
    console.error("Failed to discover page agents:", error);
  }

  return agents;
}

/**
 * Shows a picker to select an agent from available templates.
 */
export async function selectAgent(): Promise<AIAgentTemplate | null> {
  const agents = await discoverAgents();
  if (agents.length === 0) {
    await editor.flashNotification(
      "No agents found. Define agents in ai.agents table or create pages tagged meta/template/aiAgent",
      "info",
    );
    return null;
  }

  const selected = await editor.filterBox(
    "Select Agent",
    agents.map((a) => ({
      ...a,
      name: a.aiagent.name || a.ref.split("/").pop() || a.ref,
      description: a.aiagent.description || "",
    })),
    "Select an AI agent to use for this chat session",
  );

  if (!selected) return null;

  // Find the original agent by ref (filterBox may not preserve all properties)
  const selectedRef = (selected as { ref?: string }).ref;
  return agents.find((a) => a.ref === selectedRef) || null;
}

/**
 * Filters tools based on agent's whitelist or blacklist.
 * If tools (whitelist) is set, only those tools are allowed.
 * If toolsExclude (blacklist) is set, those tools are removed.
 * Whitelist takes precedence over blacklist.
 */
export function filterToolsForAgent(
  luaTools: Map<string, LuaToolDefinition>,
  agent: AIAgentTemplate,
): Map<string, LuaToolDefinition> {
  const { tools, toolsExclude } = agent.aiagent;

  if (tools && tools.length > 0) {
    return new Map([...luaTools].filter(([name]) => tools.includes(name)));
  }

  if (toolsExclude && toolsExclude.length > 0) {
    return new Map(
      [...luaTools].filter(([name]) => !toolsExclude.includes(name)),
    );
  }

  return luaTools;
}

/**
 * Builds the system prompt for an agent.
 * For page-based agents: combines frontmatter systemPrompt with page body content.
 * For Lua-registered agents (ref starts with "lua:"): uses systemPrompt directly.
 * Wiki-links in body content are extracted as attachments.
 */
export async function buildAgentSystemPrompt(
  agent: AIAgentTemplate,
): Promise<{ systemPrompt: string; attachments: Attachment[] }> {
  const prompt = agent.aiagent.systemPrompt || "";

  // Lua-registered agents don't have page content
  if (agent.ref.startsWith("lua:")) {
    return { systemPrompt: prompt, attachments: [] };
  }

  // Page-based agents may have body content with wiki-links
  let attachments: Attachment[] = [];
  let fullPrompt = prompt;

  try {
    const pageContent = await space.readPage(agent.ref);
    const bodyContent = extractBodyContent(pageContent);

    if (bodyContent.trim()) {
      try {
        const result = await lua.evalExpression(
          `ai.enrichWithWikiLinks(${luaLongString(bodyContent)}, {})`,
        );
        fullPrompt += "\n\n" + result.content;
        attachments = (result.attachments || []).map(
          (a: { name: string; content: string; type?: string }) => ({
            name: a.name,
            content: a.content,
            type: (a.type as Attachment["type"]) || "note",
          }),
        );
      } catch (error) {
        console.error("Failed to enrich agent wiki links:", error);
        fullPrompt += "\n\n" + bodyContent;
      }
    }
  } catch (error) {
    console.error("Failed to read agent page:", error);
  }

  return { systemPrompt: fullPrompt, attachments };
}

/**
 * Extracts body content from a page, stripping YAML frontmatter.
 */
function extractBodyContent(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  return match ? match[1] : content;
}
