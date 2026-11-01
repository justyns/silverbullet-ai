# Container deployment validation

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

This shell's Podman installation lacked a system `policy.json`. For test image pulls/builds only, a temporary policy (now supplied as `deploy/image-policy.json` for explicit development use) allowed the pinned `docker.io/library/node` and `ghcr.io/silverbulletmd/silverbullet` repositories and rejected other repositories. No host configuration file was changed. Plain `podman-compose build` was also attempted and failed because that host policy was absent, even with cached images. Rebuilding with the explicit repository-scoped policy succeeded. A production NixOS setup should enable/configure the rootless Podman subsystem normally or deliberately select the supplied development policy as documented.

## Remaining limitations and manual checks

- Root plug TypeScript checking still reports the two pre-existing `src/tools.ts` errors at lines 411 and 746. No unrelated source was changed to suppress them. The affected MCP project compiles cleanly.
- **Subscription login is manual.** No real login was copied into the volume, so persistence was verified with a harmless file marker rather than an actual credential. Run `podman-compose exec acp-bridge codex login --device-auth`, then check `codex login status`.
- No model-driven ACP completion or Codex-to-MCP tool call was submitted in these containers. After login and applying the Lua config, manually test discovery and a prompt such as listing notes. These requests may consume subscription/model usage; automated startup validation deliberately avoids them.
- The Lua provider/schema and browser-worker ACP flow were previously tested by the opt-in live suite; that suite was not rerun here because it submits real model requests. Container networking, authentication, current library loading and Runtime API execution were tested separately without such requests.
- Local Codex shell execution under nested bubblewrap, write-enabled MCP tools, remote devices, custom hostname/reverse-proxy layouts, SELinux, and other host UID values were not exercised. The default read-only/path-based profile was tested.
- OS packages use the versioned base image's current package repositories rather than an immutable Debian snapshot. Existing root/MCP dependency lockfiles were reused; updating unrelated dependencies was out of scope.
