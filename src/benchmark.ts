import { editor, space } from "@silverbulletmd/silverbullet/syscalls";
import { aiSettings, configureSelectedModel, initializeOpenAI, parseDefaultModelString } from "./init.ts";
import { getAllAvailableModels } from "./model-discovery.ts";
import { convertToOpenAITools, discoverTools, runAgenticChat } from "./tools.ts";
import type { ToolExecutionResult } from "./tools.ts";
import type { ModelConfig, Tool } from "./types.ts";
import type { ProviderInterface } from "./interfaces/Provider.ts";

const BENCHMARK_PAGE = "🧪 AI Benchmark";
const TEST_PAGE = `${BENCHMARK_PAGE}/Test Page`;

// --- Types ---

type TestStatus = "pass" | "warning" | "error";

type TestResult = {
  status: TestStatus;
  notes: string;
  details?: string;
};

type ToolCall = {
  name: string;
  args: Record<string, unknown>;
  result: ToolExecutionResult;
};

type CapabilityTest = {
  id: string;
  name: string;
  category: "capability";
  run: (provider: ProviderInterface) => Promise<TestResult>;
};

type ExecutionTest = {
  id: string;
  name: string;
  category: "execution";
  prompt: string;
  setup?: () => Promise<void>;
  verify: (toolCalls: ToolCall[], response: string) => Promise<boolean> | boolean;
  getNotes?: (toolCalls: ToolCall[], response: string) => Promise<string> | string;
};

type BenchmarkTest = CapabilityTest | ExecutionTest;

type ModelResults = {
  model: ModelConfig;
  results: Map<string, TestResult>;
  passed: number;
  total: number;
};

// --- Capability Tests ---

const capabilityTests: CapabilityTest[] = [
  {
    id: "stream",
    name: "Stream",
    category: "capability",
    run: async (provider) => {
      try {
        const chunks: string[] = [];
        await new Promise<void>((resolve, reject) => {
          provider.streamChat({
            messages: [{ role: "user", content: "Say OK" }],
            onChunk: (c) => chunks.push(c),
            onComplete: () => resolve(),
          }).catch(reject);
        });
        return chunks.length > 0
          ? { status: "pass", notes: `${chunks.length} chunks` }
          : { status: "error", notes: "No chunks" };
      } catch (e) {
        const err = String(e);
        return { status: "error", notes: err.slice(0, 50), details: err };
      }
    },
  },
  {
    id: "json",
    name: "JSON",
    category: "capability",
    run: async (provider) => {
      try {
        const r = await provider.chat(
          [{ role: "user", content: 'Return a JSON object with a single key "ok" and value true.' }],
          undefined,
          { type: "json_object" },
        );
        const parsed = JSON.parse(r.content?.trim() || "{}");
        return parsed.ok === true ? { status: "pass", notes: "Valid" } : { status: "warning", notes: "Wrong content" };
      } catch (e) {
        const err = String(e);
        return { status: "error", notes: err.slice(0, 50), details: err };
      }
    },
  },
  {
    id: "schema",
    name: "Schema",
    category: "capability",
    run: async (provider) => {
      try {
        const r = await provider.chat(
          [{ role: "user", content: "Generate a test response with status ok and code 1." }],
          undefined,
          {
            type: "json_schema",
            json_schema: {
              name: "test",
              schema: {
                type: "object",
                properties: {
                  status: { type: "string" },
                  code: { type: "number" },
                },
                required: ["status", "code"],
                additionalProperties: false,
              },
              strict: true,
            },
          },
        );
        const parsed = JSON.parse(r.content?.trim() || "{}");
        return parsed.status && typeof parsed.code === "number"
          ? { status: "pass", notes: "Valid" }
          : { status: "warning", notes: "Schema mismatch" };
      } catch (e) {
        const err = String(e);
        return { status: "error", notes: err.slice(0, 50), details: err };
      }
    },
  },
  {
    id: "tools",
    name: "Tools",
    category: "capability",
    run: async (provider) => {
      try {
        const tools: Tool[] = [{
          type: "function",
          function: {
            name: "test_tool",
            description: "A test tool",
            parameters: { type: "object", properties: {}, required: [] },
          },
        }];
        const r = await provider.chat(
          [{ role: "user", content: "Call test_tool now." }],
          tools,
        );
        return r.tool_calls?.length
          ? { status: "pass", notes: r.tool_calls[0].function.name }
          : { status: "warning", notes: "No call made", details: r.content?.slice(0, 200) };
      } catch (e) {
        const err = String(e);
        return { status: "error", notes: err.slice(0, 50), details: err };
      }
    },
  },
];

// --- Execution Tests ---

const executionTests: ExecutionTest[] = [
  {
    id: "read",
    name: "Read",
    category: "execution",
    prompt: `Read the page "${TEST_PAGE}" and tell me what it contains.`,
    verify: (calls) => calls.some((c) => c.name === "read_note" && c.args.page === TEST_PAGE),
    getNotes: (calls) => {
      const call = calls.find((c) => c.name === "read_note");
      return call ? `page="${call.args.page}"` : "No read_note call";
    },
  },
  {
    id: "section",
    name: "Section",
    category: "execution",
    prompt: `Read only section "Test Section" from "${TEST_PAGE}".`,
    verify: (calls) => calls.some((c) => c.name === "read_note" && c.args.section === "Test Section"),
    getNotes: (calls) => {
      const call = calls.find((c) => c.name === "read_note");
      return call ? `section="${call.args.section}"` : "No section arg";
    },
  },
  {
    id: "list",
    name: "List",
    category: "execution",
    prompt: `List all pages under "${BENCHMARK_PAGE}".`,
    verify: (calls) => calls.some((c) => c.name === "list_pages"),
    getNotes: (calls) => {
      const call = calls.find((c) => c.name === "list_pages");
      return call ? `path="${call.args.path || "(root)"}"` : "No list_pages call";
    },
  },
  {
    id: "update",
    name: "Update",
    category: "execution",
    prompt: `Append the text "BENCHMARK_MARKER_123" to section "Test Section" in "${TEST_PAGE}".`,
    verify: async () => {
      const content = await space.readPage(TEST_PAGE);
      return content.includes("BENCHMARK_MARKER_123");
    },
    getNotes: async () => {
      const content = await space.readPage(TEST_PAGE);
      return content.includes("BENCHMARK_MARKER_123") ? "Content verified" : "Marker not found";
    },
  },
  {
    id: "replace",
    name: "Replace",
    category: "execution",
    prompt: `In "${TEST_PAGE}", find "original text" and replace it with "modified text".`,
    verify: async () => {
      const content = await space.readPage(TEST_PAGE);
      return content.includes("modified text");
    },
    getNotes: async () => {
      const content = await space.readPage(TEST_PAGE);
      if (content.includes("modified text") && !content.includes("original text")) {
        return "Replace successful";
      } else if (content.includes("modified text")) {
        return "Partial replace";
      }
      return "Replace failed";
    },
  },
  {
    id: "notool",
    name: "No Tool",
    category: "execution",
    prompt: "What is 2+2? Answer with just the number.",
    verify: (calls) => calls.length === 0,
    getNotes: (calls) => calls.length === 0 ? "Correct: no tools" : `Called: ${calls.map((c) => c.name).join(", ")}`,
  },
];

// --- Multi-Model Selection ---

type SelectionOption = {
  name: string;
  description?: string;
  value: string;
  model?: ModelConfig;
};

async function getAllBenchmarkModels(): Promise<ModelConfig[]> {
  const models: ModelConfig[] = [];
  const seenNames = new Set<string>();

  const discovered = await getAllAvailableModels();
  for (const dm of discovered) {
    const modelConfig = parseDefaultModelString(`${dm.provider}:${dm.id}`);
    if (modelConfig && !seenNames.has(modelConfig.name)) {
      models.push(modelConfig);
      seenNames.add(modelConfig.name);
    }
  }

  for (const m of aiSettings.textModels || []) {
    if (!seenNames.has(m.name)) {
      models.push(m);
      seenNames.add(m.name);
    }
  }

  return models;
}

async function selectModelsForBenchmark(): Promise<ModelConfig[]> {
  await initializeOpenAI(false);

  const allModels = await getAllBenchmarkModels();
  if (allModels.length === 0) {
    throw new Error("No text models configured");
  }

  const options: SelectionOption[] = [
    { name: "📊 All configured models", value: "all" },
    { name: "🔄 Select multiple...", value: "pick" },
    ...allModels.map((m) => ({
      name: m.name,
      description: `${m.modelName} (${m.provider})`,
      value: "single",
      model: m,
    })),
  ];

  const selection = await editor.filterBox("Select models to benchmark", options) as SelectionOption | undefined;

  if (!selection) return [];
  if (selection.value === "all") return [...allModels];
  if (selection.value === "pick") return await pickMultipleModels(allModels);
  return selection.model ? [selection.model] : [];
}

async function pickMultipleModels(allModels: ModelConfig[]): Promise<ModelConfig[]> {
  const selected: ModelConfig[] = [];
  const selectedNames = new Set<string>();

  while (true) {
    const remaining = allModels.filter((m) => !selectedNames.has(m.name));
    if (remaining.length === 0) break;

    const options: SelectionOption[] = [
      ...(selected.length > 0 ? [{ name: `✓ Done (${selected.length} selected)`, value: "done" }] : []),
      ...remaining.map((m) => ({
        name: m.name,
        description: `${m.modelName} (${m.provider})`,
        value: "add",
        model: m,
      })),
    ];

    const pick = await editor.filterBox(
      `Select model ${selected.length + 1} (Esc when done)`,
      options,
    ) as SelectionOption | undefined;

    if (!pick || pick.value === "done") break;
    if (pick.model) {
      selected.push(pick.model);
      selectedNames.add(pick.model.name);
    }
  }
  return selected;
}

// --- Test Execution ---

async function setupTestPages(): Promise<void> {
  const testContent = `# Test Page

## Test Section
This is original text for testing.
Some more content here.

## Another Section
More content in another section.
`;
  await space.writePage(TEST_PAGE, testContent);
}

async function runExecutionTest(
  test: ExecutionTest,
  provider: ProviderInterface,
): Promise<TestResult> {
  const toolCalls: ToolCall[] = [];

  if (test.setup) {
    await test.setup();
  }

  const luaTools = await discoverTools();
  const tools = convertToOpenAITools(luaTools);

  const result = await runAgenticChat({
    messages: [{ role: "user", content: test.prompt }],
    tools,
    luaTools,
    chatFunction: (msgs, t) => provider.chat(msgs, t),
    onToolCall: (name, args, execResult) => {
      toolCalls.push({ name, args, result: execResult });
    },
  });

  const passed = await test.verify(toolCalls, result.finalResponse);
  const notes = test.getNotes
    ? await test.getNotes(toolCalls, result.finalResponse)
    : toolCalls.map((c) => c.name).join(", ") || "—";

  // Build details for failed tests including tool call info
  let details: string | undefined;
  if (!passed) {
    const toolInfo = toolCalls.map((c) => {
      const status = c.result.success ? "✓" : "✗";
      const resultPreview = c.result.success
        ? (c.result.summary || c.result.result?.slice(0, 100) || "")
        : (c.result.error || "");
      return `${status} ${c.name}(${JSON.stringify(c.args)}) → ${resultPreview}`;
    }).join("\n");

    details = toolInfo
      ? `Tools called:\n${toolInfo}\n\nResponse: ${result.finalResponse.slice(0, 200)}`
      : `No tools called.\n\nResponse: ${result.finalResponse.slice(0, 300)}`;
  }

  return {
    status: passed ? "pass" : "error",
    notes,
    details,
  };
}

async function runModelBenchmark(
  model: ModelConfig,
  allTests: BenchmarkTest[],
): Promise<ModelResults> {
  const provider = await configureSelectedModel(model);
  const results = new Map<string, TestResult>();
  let passed = 0;

  // Check if model advertises tool support
  const capabilities = await provider.getModelCapabilities();
  const toolsSupported = capabilities === null || capabilities.includes("tools");
  const capabilitiesInfo = capabilities ? capabilities.join(", ") : "unknown";

  for (const test of allTests) {
    try {
      let result: TestResult;

      const requiresTools = test.id === "tools" || test.category === "execution";
      if (requiresTools && !toolsSupported) {
        result = {
          status: "warning",
          notes: "No tools support",
          details: `Model capabilities: ${capabilitiesInfo}`,
        };
      } else if (test.category === "capability") {
        result = await test.run(provider);
      } else {
        // Reset test page for modification tests
        if (test.id === "update" || test.id === "replace") {
          await setupTestPages();
        }
        result = await runExecutionTest(test, provider);
      }

      results.set(test.id, result);
      if (result.status === "pass") passed++;
    } catch (e) {
      const err = String(e);
      results.set(test.id, {
        status: "error",
        notes: err.slice(0, 50),
        details: err,
      });
    }
  }

  return { model, results, passed, total: allTests.length };
}

// --- Report Generation ---

function statusToEmoji(status: TestStatus): string {
  switch (status) {
    case "pass":
      return "✅";
    case "warning":
      return "⚠️";
    case "error":
      return "❌";
  }
}

function generateComparisonTable(tests: BenchmarkTest[], results: ModelResults[]): string {
  let table = `| Model | ${tests.map((t) => t.name).join(" | ")} |\n`;
  table += `|-------|${tests.map(() => ":---:").join("|")}|\n`;

  for (const r of results) {
    const cells = tests.map((t) => {
      const result = r.results.get(t.id);
      return result ? statusToEmoji(result.status) : "—";
    });
    table += `| ${r.model.name} | ${cells.join(" | ")} |\n`;
  }
  return table;
}

function generateReport(tests: BenchmarkTest[], results: ModelResults[]): string {
  let text = `# 🧪 AI Benchmark Comparison\n\n`;
  text += `**Date**: ${new Date().toISOString().split("T")[0]}\n`;
  text += `**Models tested**: ${results.length}\n\n`;

  // Comparison table
  text += `## Results\n\n`;
  text += generateComparisonTable(tests, results);

  // Legend
  text += `\n### Legend\n\n`;
  text += `- ✅ Pass\n`;
  text += `- ⚠️ Warning (completed with issues)\n`;
  text += `- ❌ Error (failed or not supported)\n\n`;

  // Summary per model
  text += `## Summary\n\n`;
  for (const r of results) {
    const pct = Math.round((r.passed / r.total) * 100);
    text += `- **${r.model.name}**: ${r.passed}/${r.total} (${pct}%)\n`;
  }

  // Detailed failures
  const failures: Array<{ model: string; testId: string; testName: string; result: TestResult }> = [];
  for (const r of results) {
    for (const [testId, result] of r.results.entries()) {
      if (result.status === "error") {
        const test = tests.find((t) => t.id === testId);
        failures.push({ model: r.model.name, testId, testName: test?.name || testId, result });
      }
    }
  }

  if (failures.length > 0) {
    text += `\n## Failed Tests\n\n`;
    for (const f of failures) {
      text += `### ${f.model} - ${f.testName}\n\n`;
      text += `**Notes**: ${f.result.notes}\n`;
      if (f.result.details) {
        text += `\n\`\`\`\n${f.result.details}\n\`\`\`\n`;
      }
      text += `\n`;
    }
  }

  return text;
}

// --- Modal Display ---

function showBenchmarkModal(modelCount: number): Promise<void> {
  return editor.showPanel(
    "modal",
    20,
    `<style>
      .ai-modal-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        padding: 10px;
        box-sizing: border-box;
      }
      .ai-modal {
        padding: 24px 32px;
        text-align: center;
        background: var(--editor-background-color, var(--root-background-color, Canvas));
        color: var(--editor-text-color, var(--root-text-color, CanvasText));
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        max-width: 400px;
        width: 100%;
      }
      .ai-modal h3 { margin-top: 0; }
      .ai-modal p { margin-bottom: 0; }
    </style>
    <div class="ai-modal-wrapper">
      <div class="ai-modal">
        <h3>🧪 Running AI Benchmark...</h3>
        <p>Testing ${modelCount} model${modelCount > 1 ? "s" : ""}. This may take a moment.</p>
      </div>
    </div>`,
  );
}

// --- Main Entry Points ---

let cachedBenchmarkResults: string | null = null;

export async function runBenchmark(): Promise<string> {
  // Force config reload to pick up skipToolApproval changes
  await initializeOpenAI(false);

  const models = await selectModelsForBenchmark();
  if (models.length === 0) {
    await editor.flashNotification("No models selected", "error");
    return "";
  }

  await showBenchmarkModal(models.length);

  const allTests: BenchmarkTest[] = [...capabilityTests, ...executionTests];
  const allResults: ModelResults[] = [];

  try {
    await setupTestPages();

    for (const model of models) {
      allResults.push(await runModelBenchmark(model, allTests));
    }

    const report = generateReport(allTests, allResults);
    cachedBenchmarkResults = report;
    return report;
  } finally {
    await editor.hidePanel("modal");
  }
}

export function getBenchmarkResults(): string {
  if (cachedBenchmarkResults) {
    return cachedBenchmarkResults;
  }
  return `# 🧪 AI Benchmark

> ℹ️ No benchmark results available yet.

Run the **AI: Run Benchmark** command to test your AI model's capabilities.
`;
}

/**
 * Runs the AI benchmark suite and navigates to the results page.
 */
export async function benchmarkCommand() {
  await runBenchmark();
  await editor.navigate(BENCHMARK_PAGE);
}
