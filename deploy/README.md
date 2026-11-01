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

Do not run two SilverBullet instances against these writable directories. Stop any old server before migrating its data. All validation described below used separate directories under `/tmp`, not an existing space.

Set two independent, random `ACP_BRIDGE_TOKEN` and `MCP_TOKEN` values, for example using `openssl rand -hex 32`. If OpenSSL is unavailable, this command uses only Podman:

```sh
podman run --rm docker.io/library/node:24.21.0-bookworm-slim \
  node --eval 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
```

Run it twice and paste the values into `.env`. Leave the `SB_API_TOKEN` placeholder only until the dashboard is configured. Do not share `podman-compose config` output: it contains interpolated secrets. The `.env` file and runtime directories are gitignored and excluded from image build context. No credentials are baked into images.

`SB_SPACE_PATH=/notes` is a URL path, not a disk path. Keep the leading slash and omit a trailing slash. `SB_BROWSER_ORIGIN` must be the exact browser origin, without `/notes` or a trailing slash. If you change `SB_HOST_PORT`, change this origin too. Use one spelling consistently (`localhost` and `127.0.0.1` are different origins).

## 2. Build and install the local plug

```sh
podman-compose build
```

If Podman reports a missing `policy.json` (as this Nix shell did), first configure NixOS's container subsystem normally. As an explicit local-development alternative that does not modify host configuration, this repository includes a policy rejecting every image repository except the two used by the pinned Dockerfiles:

```sh
podman pull --signature-policy deploy/image-policy.json docker.io/library/node:24.21.0-bookworm-slim
podman pull --signature-policy deploy/image-policy.json ghcr.io/silverbulletmd/silverbullet:2.12.1
podman-compose --podman-build-args='--signature-policy=deploy/image-policy.json' build
```

This policy accepts these repositories' images **without cryptographic image-signature verification**, using registry TLS and the pinned version tags. It is not a replacement for an existing stricter organizational policy, and is not installed globally. Use the same build argument on rebuilds if your host still lacks a policy.

Both Dockerfiles install locked npm dependencies at build time. The ACP image also runs this repository's `npm run dist`; it contains the compiled plug and its current Space Lua library. It does not fetch a published AI plug at startup.

Load your trusted `.env` into the shell for the explicit installer command (use shell-compatible values; quote paths containing spaces):

```sh
set -a
. ./.env
set +a
mkdir -p "$SB_DATA_DIR" "$SB_SPACE_DIR"
podman run --rm \
  --userns=keep-id:uid=1000,gid=1000 --user=1000:1000 \
  --volume="$SB_SPACE_DIR:/install-space:rw" \
  localhost/silverbullet-ai-acp:local \
  node deploy/install-plug.mjs /install-space
```

The installer creates only `_plug/silverbullet-ai.plug.js`, `silverbullet-ai-library.md`, and a checksum manifest `.sbai-deployment.json`. It never writes configuration pages or notes. It refuses to overwrite a different existing plug/library. If you have a prior installation, back it up and migrate its two artifacts explicitly; remove duplicate AI libraries before installing. The library must be updated along with the plug because it supplies the ACP configuration schemas.

The installer is a one-shot `podman run`, not a fourth service. This also avoids a podman-compose 1.3 issue where `run --no-deps` can still require dependency containers. Never run it from a container startup hook.

## 3. Configure multi-space SilverBullet

Start SilverBullet first:

```sh
podman-compose up --detach silverbullet
```

Open `http://localhost:3000` (or your configured port). On a fresh `/data`, finish the setup wizard:

1. Create an administrator account.
2. Create the target space with folder **`/workspace`** and path **`/notes`** (matching `.env`). Use the **Primary hostname** binding, not a custom hostname.
3. Leave the server's primary URL unset for this local, path-based deployment. The tested space binding is `{ "prefix": "/notes" }` with no `host`, so both the browser Host and internal `silverbullet:3000` resolve to the same space.
4. Enable the Runtime API in Admin → Runtimes if it is disabled. The non-slim official image includes Chromium.
5. Create a dedicated account for MCP and grant it Write and Runtime API access **only to this space**. An administrator can issue its API token under that user's API tokens section. Use a named token dedicated to this bridge. Put the resulting token in `.env` as `SB_API_TOKEN`.

In SilverBullet 2.12.1 the admin token endpoint is `POST /.dashboard/api/admin/users/<username>/tokens` with a JSON `name`; use the dashboard so a real admin password need not appear on a command line. Tokens are shown only once. The bridge's `SB_AUTH_TOKEN` environment variable carries this **per-account** token. Setting a legacy `SB_AUTH_TOKEN` environment variable on the SilverBullet container does **not** configure multi-space authentication; this Compose file deliberately does not do that.

For an existing multi-space installation, select the existing intended space rather than creating another space for the same folder. Its saved folder must be valid inside the container (`/workspace` for the selected notes); additional spaces under `/data` persist normally, while external folders need their own explicit SilverBullet-only mounts. Back up its server config before changing bindings. Custom hostname bindings or an explicit primary URL need a matching container DNS/routing arrangement; this default recipe intentionally uses path routing. A mismatched binding generally produces a 404 at the MCP Runtime URL even when `/.instance` works.

Now start the other services:

```sh
podman-compose up --detach
podman-compose ps
podman-compose logs --tail 100 mcp-bridge acp-bridge
```

MCP loads tools via the Runtime API at startup. If the space/token/library is not ready it exits, and `restart: unless-stopped` retries. After correcting `.env`, use `podman-compose up --detach --force-recreate mcp-bridge acp-bridge`; a simple restart does not apply changed environment values. ACP health checks test only authenticated HTTP liveness and never start an agent or make model requests.

## 4. Authenticate Codex with your subscription

This uses the container's persistent Codex home, not your host's existing authentication directory:

```sh
podman-compose exec acp-bridge codex --version
podman-compose exec acp-bridge codex login --device-auth
podman-compose exec acp-bridge codex login status
```

The pinned Codex CLI's `login --help` advertises `--device-auth`. Follow its URL/code in your normal browser and use your ChatGPT subscription. No `OPENAI_API_KEY` is required or passed by this stack. If your account disallows device authentication, use the supported login procedure for that account; do not disable ACP authentication or copy tokens into the image.

The login command is manual and was **not** executed during automated validation. `codex-acp login` can also initiate browser-based login, but device login through the actual Codex CLI is more suitable for a headless container. Avoid localhost browser callbacks unless you deliberately configure their port forwarding.

The named volume survives container recreation and `podman-compose down`. Do not use `down --volumes` unless you intend to delete the container login and config. Use a distinct Compose project name for each independent deployment.

## 5. Configure the AI plug

Add a Space Lua page in the target space, or merge these values into an existing AI configuration. Do not erase your other settings:

```lua
config.set {
  ai = {
    providers = {
      acp = {
        provider = "acp",
        baseUrl = "http://127.0.0.1:3210",
        apiKey = "YOUR-ACP_BRIDGE_TOKEN-FROM-DOT-ENV",
        useProxy = false,
        timeout = 300000,
        preferredModels = {"default"},
      },
    },
    defaultTextModel = "acp:default",
  },
}
```

Change the ACP port if needed. Use **AI: Refresh Config**, **AI: Refresh Model List**, then **AI: Select Text Model from Config**. Model discovery starts an authenticated ACP session but does not submit a prompt. `default` selects the agent default; discovered names select specific models. Send a prompt only when you are ready to use the subscription.

`useProxy = false` matters: `127.0.0.1:3210` is the computer running the browser, not a container address. Do not put `http://acp-bridge:3210` in a browser configuration. This profile supports a browser on the same host; phones, another computer, HTTPS/mixed-content rules, or remote reverse proxies need a deliberate TLS/network design. Changing `useProxy` is not sufficient: the Runtime browser and Host/Origin restrictions must also agree. See [the ACP provider guide](../docs/Providers/ACP.md).

The Compose file explicitly opts the bridge into `0.0.0.0` **inside its container** using `ACP_ALLOW_NETWORK=1`. Host publishing remains loopback-only. Host validation still allows only loopback names and the exact `acp-bridge` service name, with exact-origin CORS and mandatory Bearer authentication. ACP startup waits for MCP's authenticated health check to succeed. Local non-container usage remains loopback-only by default.

## 6. Smoke checks without a model request

After the dashboard account/token and library are ready:

```sh
podman-compose exec -T acp-bridge node deploy/smoke.mjs
podman-compose ps
podman-compose logs --tail 100
curl --fail http://localhost:3000/.instance
```

The smoke command checks internal DNS; missing/valid ACP and MCP authentication; CORS rejection; MCP tool listing; read-only annotations; authenticated tool refresh through the real SilverBullet Runtime API; adapter/CLI versions; and real ACP v1/App Server initialization with HTTP MCP support. It never calls ACP `session/new` or `session/prompt`, performs a login, or submits a model request. It works before Codex login. A healthy ACP endpoint alone does not prove subscription authentication.

The bridge forwards the authenticated HTTP MCP server to each fresh ACP session. Actual model-driven Codex → MCP tool use requires the manual login above and a prompt; that final step is deliberately outside no-charge smoke checks. Try asking Codex to list notes after login. If testing ordinary ACP chat separately, `/models` requires Codex authentication; `/chat` submits a real request. Do not confuse either with the no-prompt `/health` check.

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

There are no unconditional SELinux labels. On SELinux-enabled hosts, add an appropriate override: the workspace is shared between two containers, so it needs `:z`, not separate private `:Z` labels. NixOS without SELinux does not need either. Ensure NixOS has rootless Podman enabled (including subordinate UID/GID mappings and network helpers). An installed shell binary alone may not supply `/etc/containers/policy.json`; configure the host container subsystem properly rather than weakening verification globally. Test runs here used a temporary pull policy limited to the two base-image repositories because this shell lacked that file.

The ACP bridge denies every ACP permission request, runs Codex in read-only mode, and mounts the notes read-only. Nevertheless, Codex is a local program with access to that container's files and login. It can read the whole mounted workspace. Use a separate copy or a narrower folder if that access is too broad.

MCP access is a separate trust boundary: its account token grants Runtime API execution in the selected space, and its write tools could modify notes through SilverBullet regardless of ACP's read-only filesystem. This deployment defaults `MCP_READ_ONLY=1`, exposing only tools explicitly marked read-only. Set `MCP_READ_ONLY=0` only if you intentionally want to expose write tools, then recreate MCP. ACP permission requests remain denied even then; this is not an automatic-approval mode. For the smoke command in write-tool mode, add `--allow-write-tools` after `deploy/smoke.mjs`.

Codex's bubblewrap sandbox may be unable to create a nested namespace under some Podman/kernel policies. Do not grant privileged access to fix that. Text chat and remote MCP tools do not require a local shell tool; operations requiring unavailable sandboxing can remain unsupported. Test those separately if you need them.

## Rebuilds, updates and backups

Rebuild after modifying the provider, bridge, or Space Lua library:

```sh
podman-compose build
podman-compose stop
podman run --rm \
  --userns=keep-id:uid=1000,gid=1000 --user=1000:1000 \
  --volume="$SB_SPACE_DIR:/install-space:rw" \
  localhost/silverbullet-ai-acp:local \
  node deploy/install-plug.mjs /install-space --update
podman-compose up --detach --force-recreate
```

The `--update` installer upgrades only unchanged files recorded in its checksum manifest. It refuses to discard manual library/plug edits and preflights both files before writing. It does not touch settings pages. Review the rebuilt library in a test space before upgrading a production space.

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

- **ACP 401:** token in the AI config differs from `.env`; image rebuild does not update configuration pages.
- **ACP 403:** check exact browser Origin, `localhost` versus `127.0.0.1`, and Host. Do not disable authentication/CORS.
- **MCP exits/restarts:** check `SB_API_TOKEN`, account Write + Runtime API permissions, the `/notes` prefix, space folder `/workspace`, installed library, and host binding. Review `podman-compose logs mcp-bridge silverbullet`.
- **MCP 401:** adapter's `ACP_MCP_TOKEN` must equal MCP's `MCP_TOKEN`; both derive from the same `.env` value.
- **Runtime 503:** use the non-slim SilverBullet image, enable runtime access and inspect Chromium startup logs.
- **Permission denied on a bind mount:** check ownership and parent-directory traversal, keep-id mappings, and whether another service owns the directory. Avoid recursive ownership changes on existing notes.
- **Codex login disappears:** inspect `CODEX_HOME=/home/node/.codex`, Compose project name and volume. Do not switch to a different volume or remove it with `down --volumes`.
- **Process logs after cancellation:** adapter 2.1.1 can log command-publication warnings during normal teardown. Agent failures before `done` still fail the affected request. The bridge owns each child process group, waits briefly for cancellation acknowledgement, and terminates it on timeout/shutdown; Tini and the container PID namespace provide additional cleanup.

## Validation record

See [VALIDATION.md](VALIDATION.md) for executed checks and remaining manual steps. No existing user space or authentication was mounted during validation, and no model requests were submitted.

## References

- [Official SilverBullet Docker deployment](https://docs.silverbullet.md/Install/Docker) and [versioned entrypoint](https://github.com/silverbulletmd/silverbullet/blob/2.12.1/docker-entrypoint.sh)
- [SilverBullet Runtime API](https://docs.silverbullet.md/Runtime%20API) and [multi-space configuration](https://docs.silverbullet.md/Install/Configuration)
- [podman-compose](https://github.com/containers/podman-compose), with supported flags checked against the installed 1.3.0 executable
- [codex-acp](https://github.com/agentclientprotocol/codex-acp) and [ACP session setup](https://agentclientprotocol.com/protocol/v1/session-setup)
