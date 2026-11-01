# Rootless Podman deployment

Run commands from the repository root. This recipe targets Linux x86_64, Podman 5.4.1 and podman-compose 1.3.0. It runs the official **SilverBullet 2.12.1 image with Chromium**, this fork's MCP bridge, and this fork's HTTP ACP bridge with **codex-acp 2.1.1 / Codex 0.163.0**. No host container-control socket, host networking, privileged mode, or shared Unix socket is needed.

## Services and trust boundaries

| Connection                         | Address in this recipe                               | Origin of request                                   |
| ---------------------------------- | ---------------------------------------------------- | --------------------------------------------------- |
| Browser → SilverBullet             | `http://localhost:3000/notes/`                       | Your browser                                        |
| Browser plug → ACP                 | `http://127.0.0.1:3210`                              | Browser plug worker, `useProxy = false`             |
| ACP → codex-acp → Codex App Server | Child processes and stdio JSON-RPC                   | ACP container                                       |
| Codex → MCP                        | `http://mcp-bridge:3001/mcp`                         | ACP container, configured through ACP `session/new` |
| MCP → SilverBullet                 | `http://silverbullet:3000/notes/.runtime/lua_script` | MCP container, account API token                    |

Only ports 3000 and 3210 are published, on host `127.0.0.1`. MCP has no host port. The Compose network uses service DNS names. Chromium's temporary runtime profile and local process IPC stay inside SilverBullet; they are not a transport between services.

SilverBullet alone mounts server data at `/data` and the intended notes at `/workspace`, both writable. ACP mounts **only those notes**, read-only, and has a separate named volume at `/home/node/.codex` for login, configuration, and Codex session state. MCP mounts neither host directory. The ACP `CODEX_PATH` explicitly selects the pinned, tested Codex executable rather than assuming `codex` is an ACP server.

## 1. Configure paths and secrets

```sh
cp .env.example .env
chmod 600 .env
```

Edit `.env`. Set `SB_DATA_DIR` and `SB_SPACE_DIR` to absolute directories owned by your normal host user; create both before starting. Keep the server data and notes separate. Do not point `SB_SPACE_DIR` at the server data root: account records, server keys and other spaces must not become an agent workspace. Prefer directories outside the checkout so notes are not sent as build context.

Do not run two SilverBullet instances against these writable directories. Stop any old server before migrating its data. The earlier automated validation used separate directories under `/tmp`, not an existing space; later real-installation findings are recorded separately.

Set two independent, random `ACP_BRIDGE_TOKEN` and `MCP_TOKEN` values, for example using `openssl rand -hex 32`. If OpenSSL is unavailable, this command uses only Podman:

```sh
podman run --rm docker.io/library/node:24.21.0-bookworm-slim \
  node --eval 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
```

Run it twice and paste the values into `.env`. Leave the `SB_API_TOKEN` placeholder only until the dashboard is configured. Do not share `podman-compose config` output: it contains interpolated secrets. The `.env` file and runtime directories are gitignored and excluded from image build context. No credentials are baked into images.

`SB_SPACE_PATH=/notes` is a URL path, not a disk path. Keep the leading slash and omit a trailing slash. `SB_BROWSER_ORIGIN` must be the exact browser origin, without `/notes` or a trailing slash. If you change `SB_HOST_PORT`, change this origin too. Use one spelling consistently (`localhost` and `127.0.0.1` are different origins).

## 2. Build the images

```sh
podman-compose build
```

If Podman reports a missing `policy.json` (as this Nix shell did), first configure NixOS's container subsystem normally. As an explicit local-development alternative that does not modify host configuration, use the repository's existing development image policy for both pulls and builds:

```sh
podman pull --signature-policy deploy/image-policy.json docker.io/library/node:24.21.0-bookworm-slim
podman pull --signature-policy deploy/image-policy.json ghcr.io/silverbulletmd/silverbullet:2.12.1
podman-compose \
  --podman-build-args='--signature-policy=deploy/image-policy.json' \
  build
```

The policy's `docker` transport allows remote images from the two base-image repositories. Its `containers-storage` transport allows locally stored images, including intermediate build images. These are separate policy scopes: a pull can succeed under the `docker` rule while committing/reusing a locally built image fails with `Running image containers-storage:... is rejected by policy` if the local transport is rejected. Keep the existing `containers-storage` rule when using this policy for builds.

`insecureAcceptAnything` bypasses cryptographic image-signature verification within its applicable scope: the two remote repositories and **all local container-storage images** here. Other remote repositories are rejected. Registry TLS and pinned version tags do not provide signature verification. This explicit development policy does not change host policy and must not replace a stricter organizational policy. Do not globally disable verification. For a permanent installation, enable and properly configure rootless Podman through NixOS, including its image policy, subordinate UID/GID mappings and network helpers; a Podman binary from a Nix shell alone may lack that host configuration. Use the same explicit build argument on rebuilds while relying on the development policy.

Both Dockerfiles install locked npm dependencies at build time. The ACP image also runs this repository's `npm run dist`, compiling the plug and assembling its Space Lua library. It does not fetch a published AI plug at startup. Local `npm install` only installs development dependencies; local `npm run build` only compiles the plug in the checkout. Neither installs it into a space, registers a space, or rebuilds a container. **Neither host command is required for this container installation.**

## 3. Install the plug into the host workspace

Load your trusted `.env` in a subshell for the explicit installer command (use shell-compatible values; quote paths containing spaces). The parentheses prevent exported setup values from overriding later `.env` edits in Compose:

```sh
(
set -a
. ./.env
set +a
mkdir -p "$SB_DATA_DIR" "$SB_SPACE_DIR"
podman run --rm \
  --userns=keep-id:uid=1000,gid=1000 --user=1000:1000 \
  --volume="$SB_SPACE_DIR:/install-space:rw" \
  localhost/silverbullet-ai-acp:local \
  node deploy/install-plug.mjs /install-space
)
```

The installer creates only `_plug/silverbullet-ai.plug.js`, `silverbullet-ai-library.md`, and a checksum manifest `.sbai-deployment.json`. It never writes configuration pages or notes. It refuses to overwrite a different existing plug/library without a managed update. If you have a prior installation, back it up and migrate its two artifacts explicitly; remove duplicate AI libraries before installing. The library must be updated along with the plug because it supplies the ACP configuration schemas.

The installer is a one-shot `podman run`, not a fourth service. This also avoids a podman-compose 1.3 issue where `run --no-deps` can still require dependency containers. Never run it from a container startup hook.

This writes into the host's `$SB_SPACE_DIR` through `/install-space`. The same host directory will be mounted as `/workspace` in SilverBullet. **Installing files does not register that directory as an active SilverBullet space.** The dashboard step below is required. Use `--update` only to upgrade an earlier managed installation; see [updates](#rebuilds-updates-and-backups) for the checksum protections.

## 4. Start SilverBullet

Start SilverBullet first:

```sh
podman-compose up --detach silverbullet
```

Check `podman-compose logs --tail 100 silverbullet`, then open `http://localhost:3000` (or your configured port) and create an administrator account on a fresh server.

## 5. Create the space with folder `/workspace`

In the administration dashboard, create the target space with these settings:

| Setting           | Required value                      |
| ----------------- | ----------------------------------- |
| Space name        | Notes (or your preference)          |
| Hostname          | Primary hostname                    |
| URL path          | `/notes` (matching `SB_SPACE_PATH`) |
| Filesystem folder | **`/workspace`**                    |

**Replace the wizard's default `spaces/notes`.** That default resolves to `/data/spaces/notes` under the server data directory, while this deployment installs the AI plug into `/workspace`. A space using the default folder will not see those installed artifacts.

`/notes` is the browser URL prefix; `/workspace` is the filesystem directory inside the SilverBullet container; `$SB_SPACE_DIR` is the corresponding host directory. `/data` (host `$SB_DATA_DIR`) stores server state such as accounts, keys and space registrations. These paths are not interchangeable.

Immediately after creating the space, verify the mounted artifacts:

```sh
podman-compose exec silverbullet \
  ls -l /workspace/_plug/silverbullet-ai.plug.js
podman-compose exec silverbullet \
  ls -l /workspace/silverbullet-ai-library.md
```

Then reopen the saved space settings and confirm **folder `/workspace`**, and open `http://localhost:3000/notes/`. Confirm the library page is visible and `AI: Refresh Config` appears in the command palette. The `ls` checks prove files exist in the mount; they do not prove the space uses it.

If an existing space uses `spaces/notes`, edit that space's folder to `/workspace` in the administration dashboard, save, and reopen the space. Do not delete the space or reinstall the stack. Preserve any notes in its old folder; changing the folder does not migrate them. Back up server configuration before changing an existing binding.

Leave the server's primary URL unset for this local, path-based deployment. The tested binding is `{ "prefix": "/notes" }` without `host`, so both the browser Host and internal `silverbullet:3000` resolve to this space. Use the existing intended space rather than registering the same folder twice. Additional spaces under `/data` persist normally; external folders require their own SilverBullet-only mounts. Custom hostnames or an explicit primary URL require matching internal DNS/routing and can otherwise cause a 404 at the MCP Runtime URL.

## 6. Enable Runtime access and issue the SilverBullet token

Enable the Runtime API in **Admin → Runtimes** if disabled. The non-slim official image includes Chromium. Create a dedicated service account and grant it **Write and Runtime API access only to the intended space**, even when MCP exposes only read-only tools. Issue a named account API token through that account's API tokens section in the administration dashboard, and put it in `.env` as `SB_API_TOKEN`. This must be a valid SilverBullet account API token, not a randomly generated bridge secret.

In SilverBullet 2.12.1 the admin token endpoint is `POST /.dashboard/api/admin/users/<username>/tokens` with a JSON `name`; use the dashboard so a real admin password need not appear on a command line. Tokens are shown only once. The bridge's `SB_AUTH_TOKEN` environment variable carries this **per-account** token. Setting a legacy `SB_AUTH_TOKEN` environment variable on the SilverBullet container does **not** configure multi-space authentication; this Compose file deliberately does not do that.

The three authentication boundaries are independent:

| Connection                   | Authentication                                   |
| ---------------------------- | ------------------------------------------------ |
| Browser AI plug → ACP bridge | `ACP_BRIDGE_TOKEN` (provider `apiKey`)           |
| ACP bridge → MCP bridge      | `MCP_TOKEN`, passed to ACP as `ACP_MCP_TOKEN`    |
| MCP bridge → SilverBullet    | `SB_API_TOKEN`, passed to MCP as `SB_AUTH_TOKEN` |

## 7. Start/recreate MCP and verify Runtime API access

After saving the real token in `.env`:

```sh
podman-compose up --detach --force-recreate mcp-bridge
podman-compose logs --tail 100 mcp-bridge silverbullet
```

MCP loads tools from SilverBullet at startup. If the space/token/library is not ready it exits, and `restart: unless-stopped` retries. Diagnose the Runtime API through the published SilverBullet port, even if MCP is restarting. This loads the current `.env` in a subshell and supplies the token to curl through stdin rather than printing it or putting it in curl's arguments:

```sh
(
. ./.env
printf 'Authorization: Bearer %s\n' "$SB_API_TOKEN" |
  curl --fail-with-body \
    --header @- \
    --header 'Content-Type: text/plain' \
    --header 'X-Timeout: 60' \
    --data 'return 1 + 1' \
    --write-out '\nHTTP %{http_code}\n' \
    "http://localhost:${SB_HOST_PORT:-3000}${SB_SPACE_PATH:-/notes}/.runtime/lua_script"
)
```

Expect `{"result":2}` and HTTP `200`. This uses the host's `localhost` binding; MCP uses `silverbullet:3000` internally, so also check space Host/path bindings if only the internal request fails. A 401 means SilverBullet did not accept the account token; `runtime access denied` points to account space permissions or disabled Runtime access. A 503/runtime startup failure calls for SilverBullet/Chromium logs. Success here tests Runtime access, **not plug installation**: `Plug silverbullet-ai not found` during tool discovery means the active space lacks the loaded plug (check its folder first).

### Choose read-only or writable MCP tools

The default `.env.example` uses `MCP_READ_ONLY=1`, exposing only tools explicitly marked read-only. To let Codex create, edit and reorganize notes, intentionally set:

```dotenv
MCP_READ_ONLY=0
```

Then recreate MCP using the command above. Codex's `/workspace` mount and local agent mode remain read-only, but authenticated MCP tools can write through SilverBullet's Runtime API. The filesystem mount does not prevent these API writes. Write-capable tools, particularly `eval_lua`, can execute broad SilverBullet operations and bypass tool path restrictions. Use a space-scoped service account and backups; do not rely on the read-only mount or ACP permission denials to constrain remote API writes.

## 8. Start ACP and check health

```sh
podman-compose up --detach acp-bridge
podman-compose ps
podman-compose logs --tail 100 mcp-bridge acp-bridge
```

`up` can appear to hang while ACP waits for MCP's authenticated health check. Inspect MCP's state and logs before rebuilding anything. ACP health tests authenticated HTTP liveness; it does not prove Codex login or model connectivity.

## 9. Run the smoke test without a model request

Choose the command matching `MCP_READ_ONLY`:

```sh
# Default MCP_READ_ONLY=1: require all tools to be annotated read-only.
podman-compose exec -T acp-bridge node deploy/smoke.mjs

# Intentional MCP_READ_ONLY=0: permit write-capable tools in the listing.
podman-compose exec -T acp-bridge \
  node deploy/smoke.mjs --allow-write-tools
```

The default test's `tools.every(...readOnlyHint === true)` assertion is expected to fail in writable mode. The flag permits that listing; it does not change server permissions or perform a write.

Both variants check internal DNS, ACP and MCP authentication, Host/Origin restrictions, MCP tool listing, authenticated tool refresh through SilverBullet's Runtime API, pinned adapter/CLI versions, the device-login flag, and real ACP v1/App Server initialization with HTTP MCP support. They perform no login, ACP `session/new`, `session/prompt`, or model request, and do not validate note editing. They work before Codex login.

Optional server liveness check:

```sh
curl --fail http://localhost:3000/.instance
```

## 10. Authenticate Codex with your subscription

This uses the container's persistent Codex home, not your host's existing authentication directory:

```sh
podman-compose exec acp-bridge codex --version
podman-compose exec acp-bridge codex login --device-auth
podman-compose exec acp-bridge codex login status
```

The pinned Codex CLI's `login --help` advertises `--device-auth`. Follow its URL/code in your normal browser and use your ChatGPT subscription. No `OPENAI_API_KEY` is required or passed by this stack. Device authorization may first need to be enabled in your ChatGPT account security settings, or by your workspace administrator in workspace permissions. If the first attempt is interrupted or reports device login disabled, enable that setting and rerun `codex login --device-auth` to get a fresh code. See [official OpenAI authentication documentation](https://learn.chatgpt.com/docs/auth?surface=cli).

Verify that `codex login status` reports a logged-in ChatGPT account. Login alone does not prove the SilverBullet provider URL, bridge token, model selection or browser origin is configured correctly. The login command is manual and was **not** executed during automated validation. `codex-acp login` can also initiate browser-based login, but device login through the actual Codex CLI is more suitable for a headless container. Avoid localhost browser callbacks unless you deliberately configure their port forwarding.

The named volume survives container recreation and `podman-compose down`. Do not use `down --volumes` unless you intend to delete the container login and config. Use a distinct Compose project name for each independent deployment.

## 11. Create and activate the Space Lua AI configuration

In the browser, open the `/notes/` space and create a normal page named, for example, `AI Configuration`. Paste the following **including the `space-lua` fence**. A plain `lua` fence is only displayed; `space-lua` is executed as configuration. For an existing configuration, merge the ACP entry rather than loading duplicate definitions. Path-style settings below preserve other AI settings and providers.

````markdown
```space-lua
config.set("ai.providers.acp", {
  provider = "acp",
  baseUrl = "http://127.0.0.1:3210",
  apiKey = "YOUR-ACP_BRIDGE_TOKEN-FROM-DOT-ENV",
  useProxy = false,
  timeout = 300000,
  preferredModels = {"default"},
})
config.set("ai.defaultTextModel", "acp:default")
```
````

Replace `apiKey` with **`ACP_BRIDGE_TOKEN`**, never `SB_API_TOKEN` or `MCP_TOKEN`. This page contains a credential: keep it private and do not commit or share it. Save the page and let Space Lua reload, then reload the browser if needed so the installed plug and library are loaded. Installing/updating files and registering the space are separate from loading their code and refreshing AI configuration.

Change the ACP port if needed. Use **AI: Refresh Config**, **AI: Refresh Model List**, then **AI: Select Text Model from Config**. Model discovery starts an authenticated ACP session but does not submit a prompt. `default` selects the agent default; discovered names select specific models. Send a prompt only when you are ready to use the subscription.

`useProxy = false` matters: `127.0.0.1:3210` is the computer running the browser, not a container address. Do not put `http://acp-bridge:3210` in a browser configuration. This profile supports a browser on the same host; phones, another computer, HTTPS/mixed-content rules, or remote reverse proxies need a deliberate TLS/network design. Changing `useProxy` is not sufficient: the Runtime browser and Host/Origin restrictions must also agree. See [the ACP provider guide](../docs/Providers/ACP.md).

The Compose file explicitly opts the bridge into `0.0.0.0` **inside its container** using `ACP_ALLOW_NETWORK=1`. Host publishing remains loopback-only. Host validation still allows only loopback names and the exact `acp-bridge` service name, with exact-origin CORS and mandatory Bearer authentication. ACP startup waits for MCP's authenticated health check to succeed. Local non-container usage remains loopback-only by default.

## 12. Verify AI connectivity (manual model requests)

When ready to use subscription/model usage, run **AI: Connectivity Test** in SilverBullet. Inspect the report for the ACP provider configuration, selected model availability, and the non-streaming API response (`CONNECTED`). Unlike the smoke test, this command submits real model requests, including a separate streaming probe. Its structured-output and SilverBullet function-tool probes are unsupported for ACP and may report failures despite working text connectivity; see [the provider guide](../docs/Providers/ACP.md#test-connectivity).

Successful configuration, model availability and non-streaming connectivity were reported for the real installation. Those results alone do not prove streaming or MCP note editing. Check the streaming result separately if you need it. ACP's agent receives the authenticated MCP server on each fresh session; ordinary SilverBullet function tools are disabled for this provider.

## 13. Optionally verify note editing through MCP

Only in intentional writable mode, choose a new disposable note name that does not already exist, then send a normal ACP chat prompt such as:

> Use the SilverBullet MCP tools to create a new note named `Deployment MCP Check` containing only `MCP write test`. If it already exists, stop without changing it. Do not change any other notes.

Inspect the actual note in SilverBullet and the tool result. Then optionally ask to append a harmless second line **only to that test note** and verify it in the browser. This is a real model/tool request and a deliberate workspace write; it is separate from connectivity validation. Do not infer success from the agent's prose alone. Remove the disposable note manually when finished. In read-only mode, test listing notes instead.

## Permissions and rootless operation

Each service runs as container UID/GID 1000 using `userns_mode: keep-id:uid=1000,gid=1000`. Podman maps the current host user to that identity, even if the host UID is not 1000. User-owned bind mounts therefore remain writable without recursive `chown`, `:U`, or running the service as host root. The named Codex volume is initialized from the image's node-owned directory. Diagnose mapping with:

```sh
id
podman-compose exec silverbullet id
podman-compose exec acp-bridge id
podman-compose exec acp-bridge stat --format='%u:%g %a' /home/node/.codex /workspace
podman unshare cat /proc/self/uid_map
```

`x-podman.in_pod: false` is necessary for podman-compose 1.3: its default shared pod conflicts with per-container user namespaces. Services instead share a regular Compose bridge network. Do not add `network_mode: host`, `privileged`, host PID sharing, container-control sockets, or `--userns=host` to work around this.

There are no unconditional SELinux labels. On SELinux-enabled hosts, add an appropriate override: the workspace is shared between two containers, so it needs `:z`, not separate private `:Z` labels. NixOS without SELinux does not need either. Ensure NixOS has rootless Podman enabled (including subordinate UID/GID mappings and network helpers). An installed shell binary alone may not supply `/etc/containers/policy.json`; configure the host container subsystem properly rather than weakening verification globally. The supplied development policy scopes remote pulls to the two base-image repositories and also permits local `containers-storage` images for builds, as explained in step 2.

The ACP bridge denies every ACP permission request, runs Codex in read-only mode, and mounts the notes read-only. Nevertheless, Codex is a local program with access to that container's files and login. It can read the whole mounted workspace. Use a separate copy or a narrower folder if that access is too broad.

MCP access is a separate trust boundary: its account token grants Runtime API execution in the selected space, and its write tools could modify notes through SilverBullet regardless of ACP's read-only filesystem. This deployment defaults `MCP_READ_ONLY=1`, exposing only tools explicitly marked read-only. Set `MCP_READ_ONLY=0` only if you intentionally want to expose write tools, then recreate MCP. ACP permission requests remain denied even then; this is not an automatic-approval mode. Use the matching smoke-test variant in step 9.

Codex's bubblewrap sandbox may be unable to create a nested namespace under some Podman/kernel policies. Do not grant privileged access to fix that. Text chat and remote MCP tools do not require a local shell tool; operations requiring unavailable sandboxing can remain unsupported. Test those separately if you need them.

## Rebuilds, updates and backups

`.env` is runtime input to Compose, not image content. It is excluded from build context. Editing it does not update existing containers. Choose the operation that matches the change:

| Change                                                    | Required operation                                                                                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Process needs restarting; environment unchanged           | `podman-compose restart mcp-bridge` (restarts the same container)                                                                        |
| `SB_API_TOKEN` or `MCP_READ_ONLY` changed                 | `podman-compose up --detach --force-recreate mcp-bridge`                                                                                 |
| `MCP_TOKEN` changed                                       | `podman-compose up --detach --force-recreate mcp-bridge acp-bridge`                                                                      |
| `ACP_BRIDGE_TOKEN`, allowed origin or ACP timeout changed | `podman-compose up --detach --force-recreate acp-bridge`; for bridge-token changes also update the Space Lua `apiKey` and refresh config |
| SilverBullet account permissions changed                  | Save in the dashboard, retry Runtime access; restart MCP if it is still failing discovery. No image rebuild or plug reinstall is needed. |
| Space Lua provider configuration page changed             | Save the page; run AI config/model refresh commands. No image rebuild or artifact reinstall.                                             |
| MCP bridge source changed                                 | `podman-compose build mcp-bridge`, then recreate MCP                                                                                     |
| ACP bridge source changed                                 | `podman-compose build acp-bridge`, then recreate ACP; artifact installation is unnecessary if plug/library source is unchanged           |
| Plug/provider source or bundled Space Lua library changed | Rebuild ACP, update both installed artifacts, recreate ACP and reload the plug/library as below                                          |

`restart` does not re-read Compose environment values. `up --force-recreate` replaces containers with current environment and images; it does not build images unless explicitly requested. `build` creates images but does not update installed workspace artifacts or running containers. Use the explicit development signature-policy build argument from step 2 where needed.

For a plug/provider/library update, back up the installed files. Source the trusted `.env` only in the installer subshell, as in step 3:

```sh
podman-compose build acp-bridge
podman-compose stop
(
. ./.env
podman run --rm \
  --userns=keep-id:uid=1000,gid=1000 --user=1000:1000 \
  --volume="$SB_SPACE_DIR:/install-space:rw" \
  localhost/silverbullet-ai-acp:local \
  node deploy/install-plug.mjs /install-space --update
)
podman-compose up --detach --force-recreate
```

The `--update` installer upgrades only unchanged files recorded in its checksum manifest. It refuses to discard manual library/plug edits and preflights both files before writing. It does not touch settings pages. Identical existing files are accepted; changed managed files require `--update` and a current checksum matching the previous manifest. Manually modified or untracked differing files are refused even with `--update`; preserve and reconcile them explicitly instead of deleting the manifest or forcing an overwrite. Review the rebuilt library in a test space before upgrading a production space. Reopen/reload the browser to load the updated plug and Space Lua library, then run **AI: Refresh Config** and **AI: Refresh Model List**. Restart MCP (or call `refresh_tools`) to refresh its tool list after library/tool changes. Never load a second copy of the AI library.

The image tags and npm lockfiles are versioned. To upgrade, edit the SilverBullet image tag and Node base-image tags, or update `deploy/acp/package.json` and regenerate its lockfile with `npm install --package-lock-only --prefix deploy/acp`. Keep `CODEX_PATH` and the adapter's Codex override aligned with the tested pair. Update MCP dependencies in `mcp-bridge` using its lockfile. Rebuild and rerun smoke checks; do not install packages on container startup. OS packages follow the base distribution's security updates, so these are versioned builds rather than bit-for-bit snapshot builds.

Normal operation:

```sh
podman-compose logs --follow --tail 100
podman-compose stop
podman-compose start
podman-compose down
```

Stop services before backups, then archive **both** `SB_DATA_DIR` and `SB_SPACE_DIR`, plus the Codex named volume. The server directory contains account/token records and encryption/session keys; treat it and the Codex archive as secrets. Discover the project-prefixed volume name using `podman volume ls`, then export it:

```sh
podman-compose stop
podman volume ls
podman volume export --output codex-home-backup.tar YOUR_PROJECT_codex-home
```

Use your normal filesystem backup tool for the two bind mounts while stopped. Restore with services stopped, preserving host ownership and the same account data. Import a Codex archive into an empty volume with `podman volume import`. Do not commit backups or `.env`.

## Troubleshooting

Start with `podman-compose ps` and `podman-compose logs --tail 100 mcp-bridge acp-bridge silverbullet`. Do not share logs containing credentials, `.env`, or interpolated `podman-compose config` output.

| Symptom                                                                  | Likely cause and corrective action                                                                                                                                             |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pull succeeds; build says `containers-storage:... is rejected by policy` | Remote and local transports have separate rules. Use the existing policy including its local rule and the step 2 build flag.                                                   |
| Missing system `policy.json` in a Nix shell                              | Configure Podman through NixOS for permanent use; use the explicit development policy for this build/pull only.                                                                |
| `Failed to load tools from SilverBullet: ... HTTP 401 Unauthorized`      | MCP → SilverBullet authentication: issue/check the account `SB_API_TOKEN`, then recreate MCP. Changing `MCP_TOKEN` will not fix this boundary.                                 |
| `runtime access denied`                                                  | Enable the server Runtime API and give the token's account Write + Runtime API access to the correct space. Retry the harmless Runtime diagnostic.                             |
| `Plug silverbullet-ai not found`                                         | Check the saved space folder is `/workspace`, not `spaces/notes`; check the two mounted files and reload the space/plug/library. Installation alone does not register a space. |
| Runtime URL 404                                                          | Check `SB_SPACE_PATH=/notes` and Primary hostname/path binding; custom hostnames can break internal routing.                                                                   |
| Runtime 503/startup failure                                              | Inspect SilverBullet/Chromium logs, use the non-slim image, and check Runtime is enabled. This is distinct from token rejection or a missing plug.                             |
| ACP → MCP initialize/list returns 401                                    | ACP's `ACP_MCP_TOKEN` must equal MCP's `MCP_TOKEN` (both use `.env` `MCP_TOKEN`). Recreate both after changes.                                                                 |
| Browser ACP 401                                                          | Provider `apiKey` must equal `ACP_BRIDGE_TOKEN`. Update the page and refresh config; recreate ACP after `.env` changes.                                                        |
| Browser ACP 403                                                          | Check exact Origin/Host, `localhost` versus `127.0.0.1`, and `SB_BROWSER_ORIGIN` without path/trailing slash. Keep authentication/CORS enabled.                                |
| `up` appears stuck starting ACP; MCP exits/restarts                      | ACP waits for healthy MCP. Check MCP logs/state and the Runtime diagnostic before rebuilding.                                                                                  |
| Smoke read-only annotation assertion fails with writable MCP             | Use `--allow-write-tools` only for intentionally enabled write tools.                                                                                                          |
| Permission denied on a bind mount                                        | Check ownership, parent-directory traversal and keep-id mappings. Avoid recursive ownership changes on existing notes.                                                         |
| Device login disabled/interrupted                                        | Enable device-code login in ChatGPT security settings/workspace permissions; rerun the login command for a fresh code.                                                         |
| Codex login disappears                                                   | Check `CODEX_HOME=/home/node/.codex`, Compose project name and persistent volume. Do not use `down --volumes`.                                                                 |

Do not delete `$SB_DATA_DIR` or `$SB_SPACE_DIR` as a recovery step: they contain valuable notes, accounts and server keys. Preserve the Codex volume as authentication state too.

Adapter 2.1.1 can log command-publication warnings during normal cancellation/teardown. Agent failures before `done` still fail the request. The bridge owns each child process group, waits briefly for cancellation acknowledgement, and terminates it on timeout/shutdown; Tini and the container PID namespace provide additional cleanup.

## Validation record

See [VALIDATION.md](VALIDATION.md) for executed checks and remaining manual steps. The earlier disposable automated validation mounted no existing user space/authentication and submitted no model requests. The record separately identifies the later user-reported installation results; this documentation revision did not rerun live checks.

## References

- [Official SilverBullet Docker deployment](https://docs.silverbullet.md/Install/Docker) and [versioned entrypoint](https://github.com/silverbulletmd/silverbullet/blob/2.12.1/docker-entrypoint.sh)
- [SilverBullet Runtime API](https://docs.silverbullet.md/Runtime%20API) and [multi-space configuration](https://docs.silverbullet.md/Install/Configuration)
- [podman-compose](https://github.com/containers/podman-compose), with supported flags checked against the installed 1.3.0 executable
- [codex-acp](https://github.com/agentclientprotocol/codex-acp) and [ACP session setup](https://agentclientprotocol.com/protocol/v1/session-setup)
