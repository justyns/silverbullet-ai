/**
 * Widget rendering for tool calls and reasoning blocks.
 * Consolidates all widget-related code for code widgets and HTML rendering.
 */
import { escape as escapeHtml, unescape as unescapeHtml } from "@std/html/entities";

// Types

export type CodeWidgetContent = {
  html?: string;
  script?: string;
  width?: number;
  height?: number;
  url?: string;
};

export type ToolCallData = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string; // Legacy field (full result)
  summary?: string; // New field (compact summary)
  success: boolean;
};

// Patterns for matching widget code blocks

export const TOOL_CALL_WIDGET_PATTERN = /```toolcall\n([\s\S]*?)\n```/g;
export const REASONING_BLOCK_PATTERN = /```reasoning\n[\s\S]*?\n```\n?/g;

// Styles for code widgets (embedded in widget HTML)

const TOOL_CALL_WIDGET_STYLES = `
  .tool-call { font-family: system-ui, sans-serif; font-size: 13px; padding: 8px; background: #f5f5f5; border-radius: 6px; margin: 4px 0; }
  @media (prefers-color-scheme: dark) { .tool-call { background: #2d2d2d; color: #d4d4d4; } }
  .tool-header { display: flex; align-items: center; gap: 6px; cursor: pointer; }
  .tool-name { font-weight: 600; }
  .tool-arrow { color: #888; }
  .tool-status { font-size: 14px; }
  .tool-status.success { color: #22c55e; }
  .tool-status.error { color: #ef4444; }
  .tool-details { display: none; margin-top: 8px; font-size: 12px; }
  .tool-details.open { display: block; }
  .tool-section { margin: 4px 0; }
  .tool-section-title { font-weight: 500; color: #666; }
  @media (prefers-color-scheme: dark) { .tool-section-title { color: #888; } }
  .tool-section pre { margin: 2px 0; padding: 4px; background: rgba(0,0,0,0.05); border-radius: 4px; overflow-x: auto; white-space: pre-wrap; }
  @media (prefers-color-scheme: dark) { .tool-section pre { background: rgba(255,255,255,0.05); } }
`;

const REASONING_WIDGET_STYLES = `
  .reasoning-widget { font-family: system-ui, sans-serif; font-size: 13px; padding: 8px; background: #f5f5f5; border-radius: 6px; margin: 4px 0; border-left: 3px solid #8b5cf6; }
  @media (prefers-color-scheme: dark) { .reasoning-widget { background: #2d2d2d; color: #d4d4d4; } }
  .reasoning-header { display: flex; align-items: center; gap: 6px; cursor: pointer; }
  .reasoning-title { font-weight: 600; color: #8b5cf6; }
  .reasoning-content { display: none; margin-top: 8px; font-size: 12px; }
  .reasoning-content.open { display: block; }
  .reasoning-content pre { margin: 0; padding: 8px; background: rgba(0,0,0,0.05); border-radius: 4px; overflow-x: auto; white-space: pre-wrap; }
  @media (prefers-color-scheme: dark) { .reasoning-content pre { background: rgba(255,255,255,0.05); } }
`;

// Shared helpers

function formatToolArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  return entries.length > 0
    ? entries.map(([k, v]) => `${k}: ${JSON.stringify(v, null, 2)}`).join("\n")
    : "";
}

// Widget creation (for inserting into pages)

/**
 * Creates a tool call widget string for display in pages.
 * Uses fenced code block syntax which triggers the code widget for rendering.
 * Stores summary (not full result) to keep markdown compact.
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
    summary: summary ?? "",
    success,
  };
  return `\`\`\`toolcall\n${JSON.stringify(data)}\n\`\`\``;
}

/**
 * Formats reasoning/thinking content as a fenced code block.
 * Uses ```reasoning syntax which triggers rendering as a collapsible block.
 */
export function formatReasoningBlock(reasoning: string): string {
  return `\n\`\`\`reasoning\n${reasoning}\n\`\`\`\n`;
}

// HTML rendering (for chat panel and post-processing)

/**
 * Renders a tool call as HTML with collapsible details.
 * Shared between code widget and chat panel rendering.
 */
export function renderToolCallHtml(data: ToolCallData): string {
  const status = data.success ? "✓" : "✗";
  const statusClass = data.success ? "success" : "error";

  const argsStr = formatToolArgs(data.args || {});
  const argsHtml = argsStr
    ? `<div class="tool-args"><strong>Arguments:</strong><pre>${escapeHtml(argsStr)}</pre></div>`
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
 * Similar pattern to tool calls but with distinct styling.
 */
export function renderReasoningHtml(reasoning: string): string {
  const escapedReasoning = escapeHtml(reasoning);
  return `<details class="reasoning-block">
  <summary>💭 <strong>Reasoning</strong></summary>
  <div class="reasoning-content"><pre>${escapedReasoning}</pre></div>
</details>`;
}

/**
 * Parses JSON tool call data from fenced code block content
 */
export function parseToolCallJson(json: string): ToolCallData | null {
  try {
    return JSON.parse(json) as ToolCallData;
  } catch {
    return null;
  }
}

/**
 * Post-processes HTML to replace tool-call and reasoning code blocks with rendered HTML widgets.
 * Styles are provided via Space Style.
 */
export function postProcessToolCallHtml(html: string): string {
  // Process tool calls
  const toolCallPattern = /<pre data-lang="toolcall">([\s\S]*?)<\/pre>/g;
  html = html.replace(toolCallPattern, (_match, jsonContent) => {
    try {
      // SilverBullet's htmlEscape converts \n to <br>, convert back before parsing
      const data = parseToolCallJson(unescapeHtml(jsonContent.replace(/<br>/g, "\n")));
      return data ? renderToolCallHtml(data) : _match;
    } catch {
      return _match;
    }
  });

  // Process reasoning blocks
  const reasoningPattern = /<pre data-lang="reasoning">([\s\S]*?)<\/pre>/g;
  html = html.replace(reasoningPattern, (_match, content) => {
    try {
      return renderReasoningHtml(unescapeHtml(content.replace(/<br>/g, "\n")));
    } catch {
      return _match;
    }
  });

  return html;
}

// Code widget renderers (called by SilverBullet)

/**
 * Renders a tool-call fenced code block as an HTML widget.
 * Called by SilverBullet when it encounters ```tool-call blocks.
 */
export function renderToolCallWidget(
  bodyText: string,
  _pageName: string,
): CodeWidgetContent | null {
  try {
    const data = JSON.parse(bodyText) as ToolCallData;
    const { name, args, result, summary, success } = data;

    const status = success ? "✓" : "✗";
    const statusClass = success ? "success" : "error";

    const argsStr = formatToolArgs(args || {});
    // Use summary (new format) with fallback to result (legacy format)
    const displayText = summary ?? result ?? "";

    const escapedResult = escapeHtml(displayText);
    const escapedArgs = escapeHtml(argsStr);
    const escapedName = escapeHtml(name);

    const html = `
      <style>${TOOL_CALL_WIDGET_STYLES}</style>
      <div class="tool-call">
        <div class="tool-header" onclick="this.nextElementSibling.classList.toggle('open'); setTimeout(updateHeight, 10);">
          <span>🔧</span>
          <strong class="tool-name">${escapedName}</strong>
          <span class="tool-arrow">→</span>
          <span class="tool-status ${statusClass}">${status}</span>
        </div>
        <div class="tool-details">
          ${
      escapedArgs
        ? `<div class="tool-section"><div class="tool-section-title">Arguments:</div><pre>${escapedArgs}</pre></div>`
        : ""
    }
          ${
      escapedResult
        ? `<div class="tool-section"><div class="tool-section-title">Result:</div><pre>${escapedResult}</pre></div>`
        : ""
    }
        </div>
      </div>
    `;

    return { html };
  } catch (e) {
    console.error("Error rendering tool call widget:", e);
    return null;
  }
}

/**
 * Renders a reasoning fenced code block as an HTML widget.
 * Called by SilverBullet when it encounters ```reasoning blocks.
 */
export function renderReasoningWidget(
  bodyText: string,
  _pageName: string,
): CodeWidgetContent | null {
  const escapedContent = escapeHtml(bodyText);
  const html = `
    <style>${REASONING_WIDGET_STYLES}</style>
    <div class="reasoning-widget">
      <div class="reasoning-header" onclick="this.nextElementSibling.classList.toggle('open'); setTimeout(updateHeight, 10);">
        <span>💭</span>
        <strong class="reasoning-title">Reasoning</strong>
        <span style="color: #888;">▼</span>
      </div>
      <div class="reasoning-content">
        <pre>${escapedContent}</pre>
      </div>
    </div>
  `;
  return { html };
}
