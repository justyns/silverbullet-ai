# SilverBullet ACP bridge

Dependency-free Node.js 24.13+ HTTP → ACP v1 stdio bridge. From the repository root:

```sh
export ACP_BRIDGE_TOKEN='a-long-random-secret'
export ACP_ALLOWED_ORIGIN='http://localhost:3000'
export ACP_WORKDIR='/absolute/path/to/an/empty/workdir'
export ACP_AGENT_COMMAND='codex-acp'
export ACP_AGENT_ARGS='[]'
node acp-bridge/server.mjs
```

See [the ACP provider guide](../docs/Providers/ACP.md) for installation, authentication, full configuration, security boundaries, model discovery, smoke tests and troubleshooting.

Authenticated routes: `GET /health`, `GET /models`, `POST /chat`. Requests need `Authorization: Bearer <token>`; chat also needs `Content-Type: application/json`. Preflight requests do not need authentication. Browser access is restricted to one exact Origin and loopback Host values, plus explicitly configured `ACP_ALLOWED_HOSTS`. `/health` checks only the bridge.

Chat request: `{"model":"default","messages":[{"role":"user","content":"Hello"}]}`. Optional `reasoningEffort` selects an advertised thought level. The response is `application/x-ndjson` with `text`, `reasoning`, `error`, and `done` events. A `done` event carries the ACP stop reason. No general JSON-RPC forwarding or client-provided executable/cwd settings are exposed over HTTP.

Each request owns an agent process and session. Up to four requests run concurrently. A disconnect or timeout cancels the owned session and shuts down its process. All permission requests are denied; no filesystem/terminal client capabilities are advertised. Agents are still local programs with OS access: use a dedicated working directory and their own sandbox controls.

Tests (from repository root):

```sh
npm run test:acp
npm run test:acp-provider
```

The first uses Node's built-in test runner; the second uses the repository's Vitest setup to exercise the provider through real HTTP and stdio.

Real-agent compatibility checks are opt-in and use your existing login:

```sh
ACP_REAL_AGENT_COMMAND="$(command -v codex-acp)" npm run test:acp-live
```

For compiled-plug/browser tests, also set `ACP_REAL_SILVERBULLET_BIN` and `SB_CHROME_PATH`, and run `npm run dist` first. See the provider guide for the tested version matrix and full instructions. Missing environment variables cause the corresponding live tests to be skipped.

For a three-service deployment with the official SilverBullet image and this repository's MCP bridge, see [the rootless Podman guide](../deploy/README.md). Container binding is opt-in (`ACP_ALLOW_NETWORK=1`) and requires a token. `ACP_MCP_URL` and `ACP_MCP_TOKEN` attach an HTTP MCP server during session creation; unsupported agents fail explicitly.
