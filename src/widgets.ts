function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function unescapeHtml(str: string): string {
  return str.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

export const TOOL_CALL_WIDGET_PATTERN = /```toolcall\n([\s\S]*?)\n```/g;

// Pattern to match ```reasoning\n{content}\n``` fenced code blocks
export const REASONING_BLOCK_PATTERN = /```reasoning\n[\s\S]*?\n```\n?/g;

export type ToolCallData = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string; // Legacy field (full result)
  summary?: string; // New field (compact summary)
  success: boolean;
};

/**
 * Renders a tool call as HTML with collapsible details.
 * Shared between code widget and chat panel rendering.
 */
export function renderToolCallHtml(data: ToolCallData): string {
  const status = data.success ? "✓" : "✗";
  const statusClass = data.success ? "success" : "error";

  const args = data.args || {};
  const argEntries = Object.entries(args);
  const argsHtml = argEntries.length > 0
    ? `<div class="tool-args"><strong>Arguments:</strong><pre>${
      escapeHtml(
        argEntries
          .map(([k, v]) => `${k}: ${JSON.stringify(v, null, 2)}`)
          .join("\n"),
      )
    }</pre></div>`
    : "";

  // Use summary (new format) with fallback to result (legacy format)
  const displayText = data.summary ?? data.result ?? "";
  const escapedDisplay = escapeHtml(displayText);
  const escapedName = escapeHtml(data.name);

  return `<details class="tool-call ${statusClass}">
  <summary>🔧 <strong>${escapedName}</strong> → <span class="status">${status}</span></summary>
  <div class="tool-details">
    ${argsHtml}
    <div class="tool-result"><strong>Result:</strong><pre>${escapedDisplay}</pre></div>
  </div>
</details>`;
}

/**
 * Renders reasoning/thinking content as a collapsible HTML block.
 */
export function renderReasoningHtml(reasoning: string): string {
  const escapedReasoning = escapeHtml(reasoning);
  return `<details class="reasoning-block">
  <summary>💭 <strong>Reasoning</strong></summary>
  <div class="reasoning-content"><pre>${escapedReasoning}</pre></div>
</details>`;
}

/**
 * Parses JSON tool call data from fenced code block content.
 */
export function parseToolCallJson(json: string): ToolCallData | null {
  try {
    return JSON.parse(json) as ToolCallData;
  } catch {
    return null;
  }
}

/**
 * Renders a tool-call fenced code block as a markdown widget string.
 * Called by SilverBullet when it encounters ```toolcall blocks.
 */
export function createToolCallWidget(
  toolName: string,
  args: Record<string, unknown>,
  success: boolean,
  summary?: string,
): string {
  const data = {
    id: `tool_${Date.now()}`,
    name: toolName,
    args,
    summary: summary || "",
    success,
  };
  const json = JSON.stringify(data);
  return `\`\`\`toolcall\n${json}\n\`\`\``;
}

/**
 * Formats reasoning/thinking content as a fenced code block.
 * Uses ```reasoning syntax which triggers rendering as a collapsible block.
 */
export function formatReasoningBlock(reasoning: string): string {
  return `\n\`\`\`reasoning\n${reasoning}\n\`\`\`\n`;
}

/**
 * Post-processes HTML to replace tool-call and reasoning code blocks with
 * rendered HTML widgets. Styles are provided via Space Style.
 */
export function postProcessToolCallHtml(html: string): string {
  // Process tool calls
  const toolCallPattern = /<pre data-lang="toolcall">([\s\S]*?)<\/pre>/g;
  html = html.replace(toolCallPattern, (_match, jsonContent) => {
    try {
      // SilverBullet's htmlEscape converts \n to <br>, convert back before parsing
      const withNewlines = jsonContent.replace(/<br>/g, "\n");
      const decoded = unescapeHtml(withNewlines);
      const data = parseToolCallJson(decoded);
      if (data) {
        return renderToolCallHtml(data);
      }
      return _match;
    } catch {
      return _match;
    }
  });

  // Process reasoning blocks
  const reasoningPattern = /<pre data-lang="reasoning">([\s\S]*?)<\/pre>/g;
  html = html.replace(reasoningPattern, (_match, content) => {
    try {
      const withNewlines = content.replace(/<br>/g, "\n");
      const decoded = unescapeHtml(withNewlines);
      return renderReasoningHtml(decoded);
    } catch {
      return _match;
    }
  });

  return html;
}
