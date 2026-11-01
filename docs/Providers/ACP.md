# ACP

The ACP provider connects SilverBullet AI to a local Node.js HTTP bridge, which launches an [Agent Client Protocol](https://agentclientprotocol.com/protocol/v1/initialization) agent over stdio. It supports text chat, streaming text and reasoning, conversation history, model discovery and selection. The intended agent is [codex-acp](https://github.com/agentclientprotocol/codex-acp), **not** the regular `codex` command.

## Install and authenticate the agent

Use Node.js 24.13 or newer. The bridge itself has no npm dependencies. Install the adapter locally in a separate directory if it is not already available:

```sh
export ACP_INSTALL_DIR="$HOME/.local/share/silverbullet-acp"
npm install --prefix "$ACP_INSTALL_DIR" @agentclientprotocol/codex-acp@2.1.1
export PATH="$ACP_INSTALL_DIR/node_modules/.bin:$PATH"
export ACP_AGENT_COMMAND="$ACP_INSTALL_DIR/node_modules/.bin/codex-acp"
"$ACP_AGENT_COMMAND" --version
```

This is an explicit installation step; the bridge never installs an agent. The adapter includes a Codex package dependency; `CODEX_PATH` can select a different Codex executable. Existing Codex/ChatGPT login state is reused under the OS account running the bridge. If already logged in, skip login. Otherwise, explicitly initiate ChatGPT login in a terminal:

```sh
"$ACP_AGENT_COMMAND" login
```

See the adapter's [authentication/runtime documentation](https://github.com/agentclientprotocol/codex-acp#authentication) and [login implementation](https://github.com/agentclientprotocol/codex-acp/blob/main/src/login.ts). Login may open a browser and update Codex authentication state. The bridge does not call ACP `authenticate`, change auth files, or implement an interactive browser login flow. An OpenAI API key is not the bridge token.

## Launch the bridge

From this repository root:

```sh
export ACP_BRIDGE_TOKEN="$(node -e 'console.log(require("node:crypto").randomBytes(24).toString("hex"))')"
export ACP_ALLOWED_ORIGIN='http://localhost:3000'
export ACP_WORKDIR="$(mktemp -d)"
node acp-bridge/server.mjs
```

Keep this terminal running. Retain the token for your SilverBullet configuration and connectivity requests. Use your exact SilverBullet browser origin (scheme, hostname, port, no trailing slash or URL path). If no token is configured, the bridge generates one and prints it locally on startup; an explicitly empty token is rejected.

The default agent executable is `codex-acp` on PATH. Configure another executable and arguments without shell interpolation:

```sh
export ACP_AGENT_COMMAND='/absolute/path/to/agent'
export ACP_AGENT_ARGS='["--some-agent-flag"]'
node acp-bridge/server.mjs
```

| Environment variable   | Default                    | Meaning                                                         |
| ---------------------- | -------------------------- | --------------------------------------------------------------- |
| `ACP_BRIDGE_HOST`      | `127.0.0.1`                | Loopback by default; container binding requires explicit opt-in |
| `ACP_BRIDGE_PORT`      | `3210`                     | HTTP listening port                                             |
| `ACP_BRIDGE_TOKEN`     | Random per launch          | Bearer token required on every non-preflight endpoint           |
| `ACP_ALLOWED_ORIGIN`   | `http://localhost:3000`    | One exact allowed browser origin                                |
| `ACP_AGENT_COMMAND`    | `codex-acp`                | Agent executable, launched without a shell                      |
| `ACP_AGENT_ARGS`       | `[]`                       | JSON array of executable arguments                              |
| `ACP_WORKDIR`          | Bridge's current directory | Existing absolute/relative agent working directory              |
| `ACP_AGENT_TIMEOUT_MS` | `300000`                   | Total initialization/session/prompt deadline                    |

Prefer an empty dedicated working directory over your notes or source checkout. The bridge forces `INITIAL_AGENT_MODE=read-only`, selects an advertised `read-only` session mode, advertises no client filesystem or terminal capabilities, and rejects permission requests. It has no automatic approval or write-enable switch. These are protocol boundaries, not an OS sandbox: an agent can implement its own tools and read local files under your account. Other agents may not implement Codex's read-only mode; configure their own sandbox restrictions before use. The bridge token is removed from the child's environment.

## Configure SilverBullet AI

Build and install **both** the updated plug and Space Lua library. The library contains the configuration schemas that must accept `acp`, so updating only the plug is insufficient:

```sh
npm ci
npm run dist
cp dist/silverbullet-ai.plug.js /path/to/your/space/_plug/
cp dist/silverbullet-ai-library.md /path/to/your/space/silverbullet-ai-library.md
```

Replace your previously installed AI library rather than loading two copies. See [[Development]] for distribution details. Merge this into your existing Space Lua AI configuration:

```lua
config.set {
  ai = {
    providers = {
      acp = {
        provider = "acp",
        baseUrl = "http://127.0.0.1:3210",
        apiKey = "PASTE-YOUR-ACP-BRIDGE-TOKEN-HERE",
        useProxy = false,
        timeout = 300000,
        preferredModels = {"default"},
      },
    },
    defaultTextModel = "acp:default",
  },
}
```

`apiKey` holds the bridge token. Keep it private like any provider credential. `default` means the agent's current default model; actual model IDs are returned by `/models`, not hardcoded in the plug. Run **AI: Refresh Config**, **AI: Refresh Model List**, then **AI: Select Text Model from Config**. Select a discovered `acp:<model-id>` or set `defaultTextModel` accordingly. Optional `reasoningEffort = "high"` in this provider's config selects the agent's advertised thought-level option; unsupported values fail explicitly. ACP always disables SilverBullet function tools and binary attachments for this provider; other providers' settings are unaffected.

For troubleshooting discovery, set `fetchModels = false` with `preferredModels = {"default"}` temporarily. Model lists are otherwise cached using the normal provider cache; refresh after changing agent configuration.

## Test connectivity

In a second terminal with the same `ACP_BRIDGE_TOKEN`:

```sh
curl --fail-with-body -H "Authorization: Bearer $ACP_BRIDGE_TOKEN" \
  http://127.0.0.1:3210/health
curl --fail-with-body -H "Authorization: Bearer $ACP_BRIDGE_TOKEN" \
  http://127.0.0.1:3210/models
curl --no-buffer --fail-with-body \
  -H "Authorization: Bearer $ACP_BRIDGE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"model":"default","messages":[{"role":"user","content":"Reply with CONNECTED"}]}' \
  http://127.0.0.1:3210/chat
```

`/health` checks the HTTP bridge only. `/models` launches the agent, initializes ACP, and creates a session. `/chat` should emit newline-delimited JSON text/reasoning records and finish with `{"type":"done","stopReason":"end_turn"}`. Choose an actual model from `/models` and repeat `/chat` with that ID to verify selection. Stream errors can arrive after HTTP 200 as `{"type":"error","message":"..."}`; inspect the records, not just curl's exit status.

In SilverBullet, send a normal chat, then a follow-up referring to the first answer. **AI: Connectivity Test** checks ordinary and streaming chat; its structured-output and function-tool probes are unsupported for ACP and can report failures even when text connectivity works.

## Browser, remote devices, and Docker

With `useProxy = false`, requests originate in the browser's plug worker. `127.0.0.1` is the **browser device**, so a bridge on your desktop is unreachable through that address from your phone. The browser must permit access to local HTTP services, including any local-network permissions or HTTPS/mixed-content restrictions it enforces. CORS must match the SilverBullet origin exactly, even if the server runs elsewhere.

With `useProxy = true`, requests go through SilverBullet's server; loopback then refers to that server or its container. Docker's loopback is inside the container, not the host. This bridge rejects non-loopback binding by default. The [rootless Podman recipe](../../deploy/README.md) explicitly enables an authenticated container-network listener while publishing only on host loopback. Use a deliberate trusted deployment (for example a shared network namespace or authenticated TLS route) if server-side access is required. Preserve streaming, restrict access, and do not expose the bridge directly on the Internet. Changing `useProxy` alone does not solve network routing or browser policy restrictions.

## Troubleshooting

- **401:** wrong/missing bridge token. Restarting without a fixed token generates a new one.
- **403 / CORS:** origin mismatch, or a non-loopback Host header. Use the browser's actual origin and a loopback endpoint.
- **ENOENT:** agent executable not found. Set an absolute `ACP_AGENT_COMMAND`; the regular `codex` CLI is not an ACP server.
- **Linux sandbox prerequisites:** make sure `bwrap` (bubblewrap) is available on the bridge process's PATH when exercising Codex tools. Keep sandboxing enabled; do not work around missing dependencies by enabling full access.
- **Authentication required:** run the agent's login under the same OS user and environment as the bridge. Inspect agent stderr locally; do not paste auth files into SilverBullet.
- **Unsupported protocol:** this bridge speaks ACP v1, rejects other negotiated versions, and does not try draft v2 messages.
- **Unknown model / thought level:** refresh discovery and select an advertised value. Some agents only expose `default`. Config options are preferred; older agents can expose `models` with `session/set_model` instead.
- **Timeout:** increase both provider `timeout` and `ACP_AGENT_TIMEOUT_MS` if needed. The browser disconnect or provider AbortSignal sends `session/cancel`; the bridge allows up to one second for the prompt to settle before closing stdio, and eventually kills the owned process group on Unix if needed.
- **503:** four agent requests are already active, including model discovery and process cleanup. Retry after they finish.
- **Shutdown diagnostics after success:** codex-acp 2.1.1 can log failures to publish available commands when a completed request's process is shutting down. A prior `done` record still indicates success; an error or missing `done` indicates a failed request.
- **Unexpected process exit / malformed stdout:** protocol errors fail the affected request. The next request starts a new process. Agent diagnostics belong on stderr; stdout must contain JSON-RPC lines only.

For container deployment only, `ACP_ALLOW_NETWORK=1` permits `ACP_BRIDGE_HOST=0.0.0.0` with an explicit token; `ACP_ALLOWED_HOSTS` adds exact comma-separated Host names (no ports or wildcards). `ACP_MCP_URL` and optional `ACP_MCP_TOKEN` attach one authenticated HTTP MCP server to every new ACP session. Agents must advertise HTTP MCP support. These are process configuration, never settings accepted from an HTTP request. Known bridge/MCP secrets are redacted from agent diagnostics and HTTP errors.

## Scope and verification

Each request owns a fresh agent process and ACP session, including model discovery. Full ordered history is included once as a labeled text transcript in one ACP prompt; prior turns are not replayed as new prompts. System roles are transcript instructions, not a native system-role channel, so instruction priority cannot be guaranteed. This prevents duplicate turns and session-ID interference at the cost of startup latency and loss of durable agent-side sessions. Agents may still persist their own session records on disk.

Only text is supported. Binary/unassembled attachments, SilverBullet function tools, and structured response formats fail explicitly. Agent-internal tool status, plans, usage accounting, durable sessions, filesystem/terminal methods, and interactive approvals are not exposed in the plug. Tool notifications are ignored; permission requests are always denied. Programmatic cancellation is available through `streamChat({ signal })`; this does not add a new editor cancellation UI. Each HTTP request and ACP stdout line is limited to 2MB; slow HTTP consumers are disconnected with an error. Unix shutdown targets the agent process group; Windows can terminate only the direct child, so descendant cleanup depends on the agent.

Protocol behavior was checked against the ACP v1 [session config specification](https://agentclientprotocol.com/protocol/v1/session-config-options), codex-acp's [v1 router](https://github.com/agentclientprotocol/codex-acp/blob/main/src/AcpAgentRouter.ts), [session implementation](https://github.com/agentclientprotocol/codex-acp/blob/main/src/CodexAcpServer.ts), and [read-only mode](https://github.com/agentclientprotocol/codex-acp/blob/main/src/AgentMode.ts). The reference implementation's shared long-lived agent was replaced with per-request processes, and its JSON-output hints were replaced with explicit unsupported-capability errors.

Run automated checks from the repository root:

```sh
npm test
npm run test:acp
npm run test:acp-provider
npm run build
```

Bridge tests use a deterministic stdio fixture; provider integration tests exercise real loopback HTTP and subprocess streams in temporary directories. The additional live suite uses the installed agent and existing login, makes real model requests, and is opt-in:

```sh
ACP_REAL_AGENT_COMMAND="$(command -v codex-acp)" npm run test:acp-live
```

To also exercise the compiled plug in an isolated SilverBullet space and headless Chromium:

```sh
npm run dist
export ACP_REAL_AGENT_COMMAND="$(command -v codex-acp)"
export ACP_REAL_SILVERBULLET_BIN="$(command -v silverbullet)"
export SB_CHROME_PATH="$(command -v chromium)"
npm run test:acp-live
```

Verify these paths are nonempty. Agent tests are skipped without `ACP_REAL_AGENT_COMMAND`; browser tests additionally require both SilverBullet and Chromium paths. `ACP_REAL_MODEL` optionally selects a discovered model supporting high reasoning effort. The tests never use your real SilverBullet space or approve a tool permission. All test work directories and browser profiles are temporary.

Validated on 2026-10-31 with Node 24.21.0, codex-acp 2.1.1, Codex 0.163.0, SilverBullet 2.12.1, and Chromium 143.0.7499.169: all eight live tests passed. This covered existing-login authentication, ACP v1 negotiation, model discovery and selection, streamed text and reasoning, multi-turn history, simultaneous sessions, HTTP abort and ACP session cancellation, real permission denial with no file write, startup timeout, both Lua configuration schemas, and browser-worker chat and editor streaming. The runtime tests use direct browser fetch with an exact allowed Origin; remote devices, Docker routing, other browsers, and newer agent versions still need deployment-specific checks.

The live runtime test found and fixed missing ACP entries in the Space Lua provider and legacy text-model schemas. Install the rebuilt library along with the plug to receive that fix. No global packages were installed and no login or authentication configuration commands were run during validation.
