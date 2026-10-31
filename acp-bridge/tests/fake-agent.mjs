import { createInterface } from "node:readline";
import { appendFileSync } from "node:fs";
const send = (msg) =>
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");
let config;
let pending;
const sessionId = "session-1"; // Deliberately reused across processes to test isolation.
createInterface({ input: process.stdin }).on("line", (line) => {
  const { id, method, params, result, error } = JSON.parse(line);
  if (method === "session/cancel") {
    if (process.env.ACP_FAKE_CANCEL_FILE)
      appendFileSync(process.env.ACP_FAKE_CANCEL_FILE, params.sessionId + "\n");
    if (pending) send({ id: pending, result: { stopReason: "cancelled" } });
    return;
  }
  if (id === "permission") {
    if (
      result?.outcome?.outcome !== "selected" ||
      result.outcome.optionId !== "deny"
    )
      process.exit(2);
    send({
      id: "fs",
      method: "fs/write_text_file",
      params: { sessionId, path: "/tmp/never-write", content: "bad" },
    });
    return;
  }
  if (id === "fs") {
    if (error?.code !== -32601) process.exit(3);
    chunk("text", "denied");
    send({ id: pending, result: { stopReason: "end_turn" } });
    return;
  }
  if (id === undefined) return;
  if (method === "initialize") {
    if (process.env.ACP_FAKE_MODE === "malformed") {
      process.stdout.write("not json\n");
      return;
    }
    if (process.env.ACP_FAKE_MODE === "hang-init") return;
    if (JSON.stringify(params.clientCapabilities) !== "{}") process.exit(4);
    if (
      process.env.INITIAL_AGENT_MODE !== "read-only" ||
      process.env.ACP_BRIDGE_TOKEN
    )
      process.exit(5);
    send({
      id,
      result: {
        protocolVersion: process.env.ACP_FAKE_MODE === "v2" ? 2 : 1,
        agentCapabilities: {},
      },
    });
  } else if (method === "session/new") {
    if (process.env.ACP_FAKE_MODE === "auth") {
      send({
        id,
        error: {
          code: -32000,
          message: "Authentication required: log in to Codex",
        },
      });
      return;
    }
    config = [
      {
        id: "model",
        category: "model",
        type: "select",
        currentValue: "model-a",
        options: [
          {
            group: "all",
            name: "All",
            options: [{ value: "model-a" }, { value: "model-b" }],
          },
        ],
      },
      {
        id: "reasoning_effort",
        category: "thought_level",
        type: "select",
        currentValue: "medium",
        options: [{ value: "medium" }, { value: "high" }],
      },
      {
        id: "mode",
        category: "mode",
        type: "select",
        currentValue: "write",
        options: [{ value: "write" }, { value: "read-only" }],
      },
    ];
    if (process.env.ACP_FAKE_MODE === "no-models") {
      send({ id, result: { sessionId } });
      return;
    }
    send({
      id,
      result: {
        sessionId,
        ...(process.env.ACP_FAKE_MODE === "legacy"
          ? {
              models: {
                currentModelId: "model-a",
                availableModels: [
                  { modelId: "model-a" },
                  { modelId: "model-b" },
                ],
              },
              modes: { availableModes: [{ id: "read-only" }] },
            }
          : { configOptions: config }),
      },
    });
  } else if (method === "session/set_config_option") {
    const option = config.find((o) => o.id === params.configId);
    if (
      !option ||
      !option.options.some(
        (o) =>
          o.value === params.value ||
          o.options?.some((v) => v.value === params.value),
      )
    ) {
      send({ id, error: { code: -32602, message: "Invalid config" } });
      return;
    }
    option.currentValue = params.value;
    // Model selection may change reasoning choices; bridge must use new options.
    if (params.configId === "model") config[1].options = [{ value: "high" }];
    send({ id, result: { configOptions: config } });
  } else if (method === "session/set_model" || method === "session/set_mode") {
    send({ id, result: {} });
  } else if (method === "session/prompt") {
    const text = params.prompt[0].text;
    pending = id;
    if (text.includes("CRASH")) {
      process.exit(7);
      return;
    }
    if (text.includes("FAIL")) {
      send({ id, error: { code: -32001, message: "Intentional agent error" } });
      return;
    }
    if (text.includes("IMAGE")) {
      send({
        method: "session/update",
        params: {
          sessionId,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "image", data: "abc", mimeType: "image/png" },
          },
        },
      });
      return;
    }
    if (text.includes("HANG")) {
      chunk("text", "waiting");
      return;
    }
    if (text.includes("PERMISSION")) {
      send({
        id: "permission",
        method: "session/request_permission",
        params: {
          sessionId,
          options: [
            { kind: "allow_once", optionId: "allow" },
            { kind: "reject_once", optionId: "deny" },
          ],
        },
      });
      return;
    }
    chunk("reasoning", "thinking");
    const finish = () => {
      if (text.includes("CONFIG"))
        chunk(
          "text",
          JSON.stringify(config.map((o) => [o.id, o.currentValue])),
        );
      else if (text.includes("TRANSCRIPT")) chunk("text", text);
      else chunk("text", text.match(/MARKER_[A-Z]+/)?.[0] ?? "Hello 世界");
      send({ id, result: { stopReason: "end_turn" } });
    };
    if (text.includes("SLOW")) setTimeout(finish, 100);
    else finish();
  } else send({ id, error: { code: -32601, message: "Unknown method" } });
});
function chunk(type, text) {
  send({
    method: "session/update",
    params: {
      sessionId,
      update: {
        sessionUpdate:
          type === "text" ? "agent_message_chunk" : "agent_thought_chunk",
        content: { type: "text", text },
      },
    },
  });
}
