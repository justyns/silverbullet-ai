# Container deployment validation

## Disposable automated validation (2026-10-31)

Executed on 2026-10-31 on this NixOS x86_64 host. All container commands ran as the normal user with **rootless Podman 5.4.1** and **podman-compose 1.3.0**. Test project: `sbai-container-check`; data and workspace: `/tmp/sbai-compose-check/{data,space}`. Host test ports were 33089 and 33289, avoiding the proposed production ports. Existing user spaces and Codex credentials were not mounted. The disposable containers, network, test pod, marker-only Codex volume, account data and test credentials were removed after verification; the built images remain available.

## Passed

| Check                      | Evidence                                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compose expansion          | `podman-compose --env-file /tmp/sbai-compose-check.env --project-name sbai-container-check config` succeeded                                                              |
| Image builds               | Both `deploy/Dockerfile.mcp` and `deploy/Dockerfile.acp` built successfully using the Compose `build` command                                                             |
| Local plug build           | ACP multi-stage image ran the repository's `npm ci` and `npm run dist`; generated plug and library were installed into the disposable workspace                           |
| MCP TypeScript             | Image build ran `mcp-bridge`'s strict `npm run build` (`tsc`) successfully                                                                                                |
| Rootless ownership         | All services ran as container UID/GID 1000 with keep-id; user-owned bind mounts and Codex volume were accessible without changing host ownership                          |
| Official server            | `ghcr.io/silverbulletmd/silverbullet:2.12.1` booted in multi-space mode, detected Chromium, and served the host HTTP interface                                            |
| Multi-space authentication | Created only a disposable account and its account API token; authenticated `/notes/.runtime/lua_script` returned `{"result":2}`                                           |
| DNS                        | `silverbullet`, `mcp-bridge`, and `acp-bridge` resolved from ACP                                                                                                          |
| MCP auth                   | Unauthenticated initialize returned 401; authenticated initialize succeeded                                                                                               |
| MCP → SilverBullet         | Tool refresh through the real Runtime API succeeded; the bridge exposed four read-only SilverBullet tools plus `refresh_tools`                                            |
| Read-only tools            | All five exposed tools had read-only annotations; guessing `create_note` was rejected as unknown                                                                          |
| ACP HTTP                   | No token returned 401; valid token returned 200; invalid browser Origin returned 403; internal service Host worked                                                        |
| Agent startup              | Image reported codex-acp 2.1.1 and Codex 0.163.0; actual adapter launched its App Server and negotiated ACP v1 with HTTP MCP capability                                   |
| Login command              | Container CLI `codex login --help` advertised `--device-auth`; no login was performed                                                                                     |
| Host port exposure         | SilverBullet and ACP published only `127.0.0.1:33089` and `127.0.0.1:33289`; MCP had no published port                                                                    |
| Startup ordering           | ACP waited for MCP's authenticated health check using `depends_on: condition: service_healthy`                                                                            |
| Persistence                | `down` followed by `up --detach` preserved a Codex-home marker, the installed library/workspace and server-account/API-token state; full smoke checks passed again        |
| Read-only workspace        | An attempted write from ACP to `/workspace` failed with `EROFS`                                                                                                           |
| Agent cleanup              | After real initialization/shutdown, `podman top` showed only Tini and the bridge Node process, with no leftover adapter/App Server                                        |
| Root unit tests            | `npm test`: 174 tests passed                                                                                                                                              |
| ACP regression tests       | `npm run test:acp`: 20 tests passed, including explicit network opt-in, authenticated MCP session configuration, capability rejection, cancellation, and secret redaction |
| Installer tests            | `npm run test:deploy`: two passed, covering config preservation, managed upgrades, and refusal to overwrite manual edits                                                  |
| Provider integration       | `npm run test:acp-provider`: two passed with the stdio fixture and real local HTTP                                                                                        |
| Formatting and syntax      | Prettier checks, `node --check` on changed JavaScript, and `git diff --check` passed                                                                                      |

The reproducible no-model container check is:

```sh
podman-compose exec -T acp-bridge node deploy/smoke.mjs
```

It uses no ACP prompt and no login. Tests used no real model requests.

## Findings corrected during validation

- podman-compose 1.3 defaults to a shared pod, incompatible with per-container keep-id namespaces. `x-podman.in_pod: false` fixes this without host networking.
- Its `run --no-deps` can still attach `--requires` to missing dependency containers. The installer uses a direct one-shot `podman run`; normal login uses `exec` in the running ACP service.
- Environment lists avoid podman-compose 1.3's self-referential dictionary substitution when a variable and its service-environment key have the same name and a default value.
- Fresh MCP startup discovers tools through a headless browser and is asynchronous. ACP now waits for MCP's health condition instead of racing its listening port.
- ACP container binding and HTTP MCP session configuration were added as explicit host-controlled options. Local defaults remain loopback-only, and the network listener still requires authentication, exact Host names and exact-origin CORS.

This shell's Podman installation lacked a system `policy.json`. For test image pulls/builds only, a temporary policy (now supplied as `deploy/image-policy.json` for explicit development use) allowed the pinned `docker.io/library/node` and `ghcr.io/silverbulletmd/silverbullet` remote repositories and rejected other remote repositories. The current repository policy also explicitly accepts local `containers-storage` images; the later installation showed this scope is required for intermediate build images. A remote pull allowance alone does not authorize locally stored build images. No host configuration file was changed. Plain `podman-compose build` was also attempted and failed because that host policy was absent, even with cached images. Rebuilding with the explicit repository-scoped policy succeeded. A production NixOS setup should enable/configure the rootless Podman subsystem normally or deliberately select the supplied development policy as documented.

## Limitations of the disposable validation and manual checks

- Root plug TypeScript checking still reports the two pre-existing `src/tools.ts` errors at lines 411 and 746. No unrelated source was changed to suppress them. The affected MCP project compiles cleanly.
- **Subscription login is manual.** No real login was copied into the volume, so persistence was verified with a harmless file marker rather than an actual credential. Run `podman-compose exec acp-bridge codex login --device-auth`, then check `codex login status`.
- No model-driven ACP completion or Codex-to-MCP tool call was submitted in these containers. After login and applying the Lua config, manually test discovery and a prompt such as listing notes. These requests may consume subscription/model usage; automated startup validation deliberately avoids them.
- The Lua provider/schema and browser-worker ACP flow were previously tested by the opt-in live suite; that suite was not rerun here because it submits real model requests. Container networking, authentication, current library loading and Runtime API execution were tested separately without such requests.
- Local Codex shell execution under nested bubblewrap, write-enabled MCP tools, remote devices, custom hostname/reverse-proxy layouts, SELinux, and other host UID values were not exercised. The default read-only/path-based profile was tested.
- OS packages use the versioned base image's current package repositories rather than an immutable Debian snapshot. Existing root/MCP dependency lockfiles were reused; updating unrelated dependencies was out of scope.

## Later real installation (user-reported, 2026-11-01)

These results come from the real rootless Podman/NixOS installation, separately from the disposable automated checks above. They were not rerun for this documentation revision.

- The existing development image policy was corrected to permit `containers-storage` intermediate images in addition to the remote repository rules. That correction is preserved.
- The installer wrote into `/workspace`, but the dashboard default `spaces/notes` selected `/data/spaces/notes`. Changing the existing space's folder to `/workspace` resolved `Plug silverbullet-ai not found` without deleting the space or reinstalling the stack.
- SilverBullet account-token authentication and Write + Runtime API permissions were required independently of ACP/MCP bridge-token authentication.
- Intentional `MCP_READ_ONLY=0` exposed write-capable tools. The default smoke assertion failed as designed; `--allow-write-tools` passed with 11 listed tools, internal DNS, ACP authentication/Host/Origin checks, authenticated Runtime tool refresh, codex-acp 2.1.1 / Codex 0.163.0 and real adapter/App Server initialization. Its old “read-only annotations checked” output was misleading in this mode; the diagnostic now describes the selected mode. No smoke assertion was weakened.
- `codex login --device-auth` succeeded with a ChatGPT subscription after enabling device authorization in account settings. No OpenAI API key was needed.
- The Space Lua ACP provider configuration passed provider configuration, model availability and non-streaming API connectivity checks.

These findings do not establish streaming success or actual model-driven note creation/editing. Those remain explicit manual checks in the deployment guide. Neither smoke variant submits a prompt or tests note editing. The earlier untested-host limitations (nested bubblewrap shell execution, remote devices, custom routing, SELinux and other host UIDs) remain applicable. This revision did not access real `.env` values, run containers/model requests, or modify a SilverBullet workspace.

## ACP/MCP backend completion — 2026-11-08

Executed against the existing official SilverBullet 2.12.1 Compose container,
codex-acp 2.1.1 and Codex CLI 0.163.0. The obsolete host SilverBullet executable
was not used. SilverBullet itself was not recreated or reset.

Observed cause and boundaries:

- The persistent Codex home reported zero global MCP registrations (names-only
  inspection; no credentials printed).
- A controlled real-agent comparison used the reported question, "Could you
  please list the pages I've created in this workspace?", identical HTTP MCP
  registration and read-only mode. The original transcript produced no tool
  events. The revised transcript produced `mcp.silverbullet.list_pages`,
  `in_progress` → `completed`, followed by `end_turn`. HTTP MCP capability was
  true in both cases. This demonstrates a prompt-guidance failure with working
  transport, rather than a missing HTTP capability or global duplicate in this
  environment. The exact earlier browser state cannot be reconstructed.
- The original blanket prohibition on file changes did not distinguish remote
  notes, and every ACP permission request was denied. These also prevented the
  intended write workflow. Agent-managed tool guidance now follows the selected
  ACP model without enabling native function calling.

Final live verification:

- Authenticated MCP discovery: without the deployment authorization header,
  only read tools are visible. With it and `MCP_READ_ONLY=0`, the five permitted
  note writers are discovered. `eval_lua` is absent in both cases.
- `deploy/e2e-acp-mcp.mjs`, `ACP_E2E=1 ACP_E2E_WRITES=1`: passed. Real completed
  `list_pages` calls observed for direct and panel-shaped history, including a
  mistaken historical assistant denial. Real create, update, search/replace,
  frontmatter and rename calls completed; direct authenticated MCP readback
  verified each change independently of Codex. An ACP write-disabled request
  left the disposable note unchanged.
- Final disposable all-operations note:
  `ACP integration test 1794130482286 renamed`.
- `deploy/e2e-acp-interfaces.mjs`: passed through the installed plug in the
  official container's Runtime, using an isolated ACP listener for Runtime's
  exact origin `http://127.0.0.1:3000`. Both existing handlers completed real
  `list_pages` calls. Chat-on-page created a note; the existing panel updated
  it. Actual MCP starts/completions and per-operation ACP `allow_once`
  authorizations were observed. Direct `space.readPage` verified both writes.
- Final handler target: `ACP interface test 1794130472687 target`.
- Runtime configuration was temporarily set for testing and restored. The
  chat-on-page test defers invocation to release Runtime before MCP callbacks;
  awaiting the entire agent turn inside a Runtime request blocks those callbacks.
- Podman Compose retained old images on ordinary `up`; image IDs were checked,
  then only ACP/MCP were force-recreated. All final MCP/handler checks above
  were repeated against the rebuilt images. The installed plug/library were
  updated with the existing deployment installer. Temporary listeners were
  removed when ACP was recreated after testing.

Automated checks:

| Check | Result |
| --- | --- |
| `npm test` | 176 passed, 17 files |
| `npm run test:acp` | 30 passed, including real HTTP MCP policy fixtures |
| `npm run test:acp-provider` | 2 passed |
| `npm run test:deploy` | Passed |
| `npm run build` | Passed |
| Compose image builds with `deploy/image-policy.json` | Passed |
| Existing `codex-acp.test.mjs` live suite in ephemeral ACP container | 6 passed |
| Container smoke | Passed: authenticated MCP, excluded Lua, blocked write, ACP initialization |
| `npm run test:integration` | Could not initialize: `OPENROUTER_API_KEY` absent |
| `git diff --check` | Passed |

Tests requiring loopback listeners/subprocesses ran outside the filesystem
sandbox. A sandbox-only attempt failed to bind/start fixtures; the authorized
runs above passed. No dependency or lockfile upgrades were performed.

Selective reuse of `acp-fix-with-gui-changes.diff`:

- Reused and revised safe ACP event diagnostics, correlated one-operation note
  approvals, duplicate MCP detection, transcript guidance, MCP allowlisting,
  selected-provider prompt refresh, fixture tests and live MCP test.
- Replaced per-turn `allowNoteWrites` with deployment-only
  `ACP_ALLOW_NOTE_WRITES`; the plug sends no write flag. MCP both hides and
  rejects unauthorized note writers. Missing `MCP_READ_ONLY` is read-only.
- Added validation of session MCP configuration, failed-tool stream errors,
  builtin `Error:` result handling and installed-handler live verification.
- Rejected GUI assets/controls, status-display additions, per-turn checkbox,
  type/provider request-field additions, dependency/lockfile changes, image
  policy changes, Dockerfile changes and unrelated guide rewrites.
- Preserved the user's existing Compose `service_started` workaround exactly.

Changed-file purposes:

- `acp-bridge/acp.mjs`: safe diagnostics, tool correlation and minimal note-write
  approval; local/client filesystem and terminal execution remain denied.
- `acp-bridge/server.mjs`: deployment authorization, authenticated session MCP
  registration/validation, duplicate checking, stream failure reporting.
- `acp-bridge/format.mjs`: separate remote notes from local tool restrictions;
  establish availability from current calls rather than assistant history.
- `mcp-bridge/index.ts`: explicit supported-tool allowlist, default read-only,
  per-session visibility/enforcement, truthful error results and safe logging.
- `src/init.ts`, `src/chat-panel.ts`: refresh model-specific instructions and
  include ACP instructions with existing panel agent prompts.
- ACP fixtures/tests, `src/chat-panel.acp.test.ts`, `package.json`: regression
  coverage using the existing Node/Vitest test frameworks.
- `deploy/e2e-acp-mcp.mjs`, `deploy/e2e-acp-interfaces.mjs`, `deploy/smoke.mjs`:
  repeatable real tool verification and deployment boundary checks.
- `.env.example`, `compose.yaml`: deployment write/diagnostics flags. The ignored
  local `.env` now opts in to remote writes and safe diagnostics for this
  disposable environment; it was not printed or committed.
- `deploy/README.md`, `docs/Providers/ACP.md`, this record: implemented behavior,
  commands, evidence and limitations.

No GUI assets, styling, controls or interface APIs were changed. Actual browser
clicks/visual behavior were not automated in this run; installed handler paths
were exercised through Runtime. For final manual acceptance, reload the browser,
run **AI: Refresh Config**, select ACP, and use both existing chats to list pages
and explicitly edit a disposable note. Switch to another provider and back.
The general provider integration suite can be retried with
`OPENROUTER_API_KEY=... npm run test:integration` using a securely supplied key.


## Final pre-commit review — 2026-11-08

Reviewed on branch `main`, including the complete unstaged integration diff and
all new test scripts. No GUI assets, provider request flags, dependency upgrades,
lockfiles, credentials or workspace data are included. Existing `.gitignore`
rules already exclude `.env`, `*.diff`, generated plug/distribution files and
local runtime directories; no ignore changes were needed. Comparing all commit
candidates against local secret values found no matches (values were withheld).
The pre-existing Compose startup-workaround hunk is preserved locally and left
unstaged; only the new ACP environment settings are included in the commit.

Scoped corrections from this review:

- Writer visibility, read-only annotations and execution checks now use the
  explicit writer allowlist, so an incorrect `readOnly` annotation cannot bypass
  deployment authorization. The HTTP policy fixture deliberately mislabels
  `update_note` read-only and still verifies denial and unchanged content.
- Structured successful note reads retain success even if their text starts
  with `Error:`. Plain builtin error strings still propagate as MCP failures.
- Diagnostics omit the caller-supplied model string and raw MCP startup errors.
  Production metadata logs do not contain prompts, arguments or note contents.
- Permission fixtures explicitly deny `codex_apps` operations even with remote
  SilverBullet writes enabled. Only the allowlisted, correlated SilverBullet
  operations can obtain `allow_once`.
- The older stdio integration fixture explicitly sets `MCP_READ_ONLY=0` when
  testing writes. Its tool-list assertions also exclude `eval_lua`.
- Deployment instructions now consistently require both flags for ACP writes,
  describe read-only smoke sessions correctly, and remove the obsolete claim
  that writable mode exposes Lua or waits for MCP health.

Inherited Codex capability investigation:

- Global configured MCP server names were empty; effective configuration had no
  `mcp_servers`, app overrides, or explicit apps-feature override.
- A new ephemeral read-only App Server thread without any SilverBullet MCP
  configuration nevertheless advertised `codex_apps` (166 tool definitions).
  This establishes account/runtime inheritance independently of `session/new`.
- Its advertised tools contained no SilverBullet note or Runtime operations.
  Document-control schemas allowed only Excel, PowerPoint, Word and Sheets.
  No unrelated tools were invoked, disabled or reconfigured, and no connector
  credentials were printed or modified.
- This bridge's flags cannot govern independent services or credentials added
  outside this integration. Within the reviewed deployment, no alternate
  SilverBullet route was identified. The MCP bearer token remains a separate
  credential boundary: its holder can deliberately request the write header
  when the server's deployment flag permits writes.

Repeated checks after the review fixes:

| Check | Result |
| --- | --- |
| Root Vitest suite | 176 passed, 17 files |
| ACP/MCP Node suite | 30 passed, including default-deny, misleading annotations, literal Error-prefixed content and codex_apps denial |
| ACP provider integration | 2 passed |
| Deployment installer tests | 2 passed |
| Plug and strict MCP TypeScript builds | Passed |
| Both bridge container image builds with existing signature policy | Passed |
| Real Codex regression suite inside ephemeral ACP container | 6 passed |
| Container smoke on reviewed images | Passed; five read tools, denied writer, Lua absent, authenticated refresh and ACP initialization |
| Live ACP/MCP read and all note-writing checks | Passed; actual completed events and independent readback, denied write unchanged |
| Syntax, unstaged/staged whitespace checks | Passed |

The live disposable note from this review is
`ACP integration test 1794134625139 renamed`. The running ACP/MCP image IDs were
checked against the rebuilt tags. Only those two bridge services were
recreated; the official SilverBullet 2.12.1 instance and its data were retained.

`OPENROUTER_API_KEY` is unavailable, so the broader integration suite was not
rerun. Inspection of its setup and tests showed that `connectivity.test.ts` and
the model-driven part of `mcp.test.ts` exercise OpenRouter/native function
calling, not ACP-managed tools. The shared setup also unnecessarily gates
MCP-only/skills tests behind that key. The affected MCP tool discovery,
Runtime mapping, read/write authorization and no-modal writes are covered by
credential-free HTTP fixtures and the real container ACP/MCP tests above;
root `src/tools.mcp.test.ts` and `src/mcp/*.test.ts` cover the native shared MCP
client path. An OpenRouter model's native tool-calling behavior remains untested
in this review. No key was added, and no legacy host SilverBullet was launched.
Browser visual/click acceptance is unchanged from the earlier handler validation
and the user's successful manual tests.
