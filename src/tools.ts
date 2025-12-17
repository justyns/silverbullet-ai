import { editor, lua } from "@silverbulletmd/silverbullet/syscalls";
import type {
  ChatMessage,
  ChatResponse,
  LuaToolDefinition,
  StreamChatOptions,
  Tool,
} from "./types.ts";

const MAX_TOOL_ITERATIONS = 10;

export type ToolExecutionResult = {
  success: boolean;
  result?: string;
  error?: string;
};

function toLuaStringLiteral(value: string): string {
  // Lua string in double quotes with basic escapes
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
  return `"${escaped}"`;
}

/**
 * Discovers tools defined in Space Lua under the `ai.tools` table.
 * Each tool should have: description, parameters, handler
 *
 * Note: We can't fetch the full ai.tools table because Lua functions
 * can't be serialized. Instead, we get tool names and fetch metadata
 * for each tool individually.
 */
export async function discoverTools(): Promise<Map<string, LuaToolDefinition>> {
  const tools = new Map<string, LuaToolDefinition>();

  try {
    const toolsExist = await lua.evalExpression(
      "ai ~= nil and ai.tools ~= nil",
    );

    if (!toolsExist) {
      console.log(
        "ai.tools not defined - Space Lua AI Tools may not be loaded",
      );
      return tools;
    }

    // Get tool names (keys only, no functions) using IIFE
    const toolNames = await lua.evalExpression(`(function()
      local names = {}
      for k, _ in pairs(ai.tools) do
        table.insert(names, k)
      end
      return names
    end)()`) as string[];

    if (!toolNames || !Array.isArray(toolNames) || toolNames.length === 0) {
      console.log("No tools found in ai.tools");
      return tools;
    }

    console.log(`Found ${toolNames.length} tool names:`, toolNames);

    // Fetch metadata for each tool (without the handler function)
    for (const name of toolNames) {
      try {
        const nameLiteral = toLuaStringLiteral(name);
        const metadata = await lua.evalExpression(`(function()
          local tool = ai.tools[${nameLiteral}]
          if tool then
            return {
              description = tool.description,
              parameters = tool.parameters,
              requiresApproval = tool.requiresApproval or false
            }
          end
          return nil
        end)()`) as {
          description: string;
          parameters: LuaToolDefinition["parameters"];
          requiresApproval?: boolean;
        } | null;

        if (metadata && metadata.description && metadata.parameters) {
          tools.set(name, {
            description: metadata.description,
            parameters: metadata.parameters,
            handler: name,
            requiresApproval: metadata.requiresApproval === true,
          });
          console.log(`Discovered tool: ${name}`);
        } else {
          console.warn(`Invalid metadata for tool "${name}":`, metadata);
        }
      } catch (e) {
        console.error(`Error fetching metadata for tool "${name}":`, e);
      }
    }

    console.log(`Discovered ${tools.size} tools from Space Lua`);
  } catch (e) {
    console.error("Error discovering tools:", e);
  }

  return tools;
}

/**
 * Converts Space Lua tool definitions to OpenAI tool format
 */
export function convertToOpenAITools(
  luaTools: Map<string, LuaToolDefinition>,
): Tool[] {
  const tools: Tool[] = [];

  for (const [name, def] of luaTools) {
    tools.push({
      type: "function",
      function: {
        name,
        description: def.description,
        parameters: {
          type: "object",
          properties: def.parameters.properties || {},
          required: def.parameters.required || [],
        },
      },
    });
  }

  return tools;
}

/**
 * Converts a JavaScript value to Lua literal syntax
 */
function toLuaLiteral(value: unknown): string {
  if (value === null || value === undefined) {
    return "nil";
  }
  if (typeof value === "string") {
    return toLuaStringLiteral(value);
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "nil";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (Array.isArray(value)) {
    const items = value.map((v) => toLuaLiteral(v)).join(", ");
    return `{${items}}`;
  }
  if (typeof value === "object") {
    const pairs = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `[${toLuaStringLiteral(k)}]=${toLuaLiteral(v)}`)
      .join(", ");
    return `{${pairs}}`;
  }
  return "nil";
}

/**
 * Executes a tool by calling its Lua handler function
 */
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  luaTools: Map<string, LuaToolDefinition>,
): Promise<ToolExecutionResult> {
  const tool = luaTools.get(toolName);

  if (!tool) {
    return {
      success: false,
      error: `Unknown tool: ${toolName}`,
    };
  }

  try {
    const luaArgs = toLuaLiteral(args);
    const toolNameLiteral = toLuaStringLiteral(toolName);
    // Call the handler function with the args
    const result = await lua.evalExpression(
      `ai.tools[${toolNameLiteral}].handler(${luaArgs})`,
    );

    const resultStr = typeof result === "string"
      ? result
      : JSON.stringify(result, null, 2);

    return {
      success: true,
      result: resultStr,
    };
  } catch (e) {
    console.error(`Error executing tool "${toolName}":`, e);
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Requests user approval before executing a tool
 */
async function requestToolApproval(
  toolName: string,
  args: Record<string, unknown>,
): Promise<boolean> {
  const argsPreview = JSON.stringify(args, null, 2);
  const message =
    `Allow AI to call "${toolName}"?\n\nArguments:\n${argsPreview}`;
  return await editor.confirm(message);
}

/**
 * Formats a tool call for display
 */
function formatToolCallDisplay(
  toolName: string,
  args: Record<string, unknown>,
  success: boolean,
): string {
  const argsDisplay = Object.entries(args)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join(", ");
  const status = success ? "✓" : "✗";
  return `\n> 🔧 ${toolName}(${argsDisplay}) → ${status}\n\n`;
}

function parseToolCallArguments(
  json: string,
): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(json);
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return {
        ok: false,
        error: "Tool arguments must be a JSON object",
      };
    }
    return { ok: true, args: parsed as Record<string, unknown> };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Processes tool calls: executes them, formats display text, and builds result messages
 */
async function processToolCalls(
  toolCalls: Array<
    { id: string; function: { name: string; arguments: string } }
  >,
  luaTools: Map<string, LuaToolDefinition>,
  onToolCall?: (
    toolName: string,
    args: Record<string, unknown>,
    result: ToolExecutionResult,
  ) => void,
): Promise<{ toolCallsText: string; toolMessages: ChatMessage[] }> {
  let toolCallsText = "";
  const toolMessages: ChatMessage[] = [];
  const emitToolCall = onToolCall ?? (() => {});

  for (const toolCall of toolCalls) {
    const toolName = toolCall.function.name;
    const parsedArgs = parseToolCallArguments(toolCall.function.arguments);
    const args = parsedArgs.ok ? parsedArgs.args : {};
    console.log(`Executing tool: ${toolName}`, args);

    if (!parsedArgs.ok) {
      const parseErrorResult: ToolExecutionResult = {
        success: false,
        error: `Invalid tool arguments: ${parsedArgs.error}`,
      };
      toolCallsText += formatToolCallDisplay(toolName, args, false);
      emitToolCall(toolName, args, parseErrorResult);
      toolMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        name: toolName,
        content: `Error: ${parseErrorResult.error}`,
      });
      continue;
    }

    // Check if tool requires approval
    const toolDef = luaTools.get(toolName);
    if (toolDef?.requiresApproval) {
      const approved = await requestToolApproval(toolName, args);
      if (!approved) {
        const rejectedResult: ToolExecutionResult = {
          success: false,
          result: "Rejected by user",
        };
        toolCallsText += formatToolCallDisplay(toolName, args, false);
        emitToolCall(toolName, args, rejectedResult);
        toolMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          name: toolName,
          content: "Tool execution was rejected by user.",
        });
        continue;
      }
    }

    const result = await executeTool(toolName, args, luaTools);

    toolCallsText += formatToolCallDisplay(toolName, args, result.success);

    emitToolCall(toolName, args, result);

    toolMessages.push({
      role: "tool",
      tool_call_id: toolCall.id,
      name: toolName,
      content: result.success
        ? (result.result || "")
        : `Error: ${result.error}`,
    });
  }

  return { toolCallsText, toolMessages };
}

/**
 * Options for running an agentic chat with tool support
 */
export type AgenticChatOptions = {
  messages: ChatMessage[];
  tools: Tool[];
  luaTools: Map<string, LuaToolDefinition>;
  chatFunction: (
    messages: ChatMessage[],
    tools?: Tool[],
  ) => Promise<ChatResponse>;
  onToolCall?: (
    toolName: string,
    args: Record<string, unknown>,
    result: ToolExecutionResult,
  ) => void;
  maxIterations?: number;
};

/**
 * Result from running an agentic chat
 */
export type AgenticChatResult = {
  messages: ChatMessage[];
  finalResponse: string;
  toolCallsText: string;
};

/**
 * Runs an agentic chat loop that executes tool calls until we get a final response.
 * This is a reusable utility for both the chat panel and chat-on-page.
 */
export async function runAgenticChat(
  options: AgenticChatOptions,
): Promise<AgenticChatResult> {
  const {
    messages,
    tools,
    luaTools,
    chatFunction,
    onToolCall,
    maxIterations = MAX_TOOL_ITERATIONS,
  } = options;

  const workingMessages = [...messages];
  let toolCallsText = "";
  let iterations = 0;

  // If no tools available, just call once and return
  if (tools.length === 0) {
    const response = await chatFunction(workingMessages);
    return {
      messages: workingMessages,
      finalResponse: response.content || "",
      toolCallsText: "",
    };
  }

  // Tool loop: keep calling until no more tool_calls
  while (iterations < maxIterations) {
    iterations++;

    const response = await chatFunction(workingMessages, tools);

    if (response.tool_calls && response.tool_calls.length > 0) {
      workingMessages.push({
        role: "assistant",
        content: response.content || "",
        tool_calls: response.tool_calls,
      });

      const { toolCallsText: newText, toolMessages } = await processToolCalls(
        response.tool_calls,
        luaTools,
        onToolCall,
      );
      toolCallsText += newText;
      workingMessages.push(...toolMessages);
    } else {
      // No tool calls - we have the final response
      return {
        messages: workingMessages,
        finalResponse: response.content || "",
        toolCallsText,
      };
    }
  }

  // Hit max iterations
  return {
    messages: workingMessages,
    finalResponse:
      "\n\n⚠️ Maximum tool iterations reached. Response may be incomplete.",
    toolCallsText,
  };
}

/**
 * Options for running a streaming agentic chat with tool support
 */
export type StreamingAgenticChatOptions = {
  messages: ChatMessage[];
  tools: Tool[];
  luaTools: Map<string, LuaToolDefinition>;
  streamFunction: (options: StreamChatOptions) => Promise<ChatResponse>;
  onChunk?: (chunk: string) => void;
  onToolCall?: (
    toolName: string,
    args: Record<string, unknown>,
    result: ToolExecutionResult,
  ) => void;
  maxIterations?: number;
};

/**
 * Runs a streaming agentic chat loop that streams content and executes tool calls.
 * Content is streamed via onChunk callback.
 * When tool calls are detected, they are executed and the loop continues.
 */
export async function runStreamingAgenticChat(
  options: StreamingAgenticChatOptions,
): Promise<AgenticChatResult> {
  const {
    messages,
    tools,
    luaTools,
    streamFunction,
    onChunk,
    onToolCall,
    maxIterations = MAX_TOOL_ITERATIONS,
  } = options;

  const workingMessages = [...messages];
  let toolCallsText = "";
  let iterations = 0;
  let fullResponse = "";

  // If no tools available, just stream once and return
  if (tools.length === 0) {
    const result = await streamFunction({
      messages: workingMessages,
      tools: [],
      onChunk,
    });
    return {
      messages: workingMessages,
      finalResponse: result.content || "",
      toolCallsText: "",
    };
  }

  // Tool loop: keep calling until finish_reason is not "tool_calls"
  while (iterations < maxIterations) {
    iterations++;

    const result = await streamFunction({
      messages: workingMessages,
      tools,
      onChunk,
    });

    if (result.tool_calls && result.tool_calls.length > 0) {
      workingMessages.push({
        role: "assistant",
        content: result.content || "",
        tool_calls: result.tool_calls,
      });

      const { toolCallsText: newText, toolMessages } = await processToolCalls(
        result.tool_calls,
        luaTools,
        onToolCall,
      );
      toolCallsText += newText;
      workingMessages.push(...toolMessages);

      fullResponse = result.content || "";
    } else {
      // No tool calls - we have the final response (already streamed)
      return {
        messages: workingMessages,
        finalResponse: result.content || "",
        toolCallsText,
      };
    }
  }

  // Hit max iterations
  return {
    messages: workingMessages,
    finalResponse: fullResponse +
      "\n\n⚠️ Maximum tool iterations reached. Response may be incomplete.",
    toolCallsText,
  };
}
