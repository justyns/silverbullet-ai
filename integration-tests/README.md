# Runtime-API integration tests

Headless integration tests for the silverbullet-ai plug. Spawns a real
SilverBullet server, loads the built plug, and uses the
[Runtime API](https://silverbullet.md/Runtime+API) (`POST /.runtime/lua`).

Unlike the Playwright e2e tests in `../e2e-tests/`, these never render a UI —
they invoke plug functions directly via Lua over HTTP.

## Prerequisites

1. **`silverbullet` server binary** (Go-based v2) on your `PATH`, or set
   `SILVERBULLET_BIN` to its full path. Build from source if needed:
   ```bash
   cd ../silverbullet && go build .
   ```

2. **Chromium** at `/usr/bin/chromium` (override with `SB_CHROME_PATH`). The
   Runtime API uses a headless Chromium to host the live SilverBullet client.

3. **Built plug**: `silverbullet-ai.plug.js` and `dist/silverbullet-ai-library.md`
   must exist in the repo root. Run `npm run dist` if they don't.

4. **OpenRouter API key**: set `OPENROUTER_API_KEY` in your environment. Get one
   at https://openrouter.ai/. The test uses `openai/gpt-4o-mini` for now.

## Running

```bash
export OPENROUTER_API_KEY=sk-or-...
npm run test:integration
```

Useful env vars:

| Variable | Default | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | — | **Required.** Real OpenRouter key |
| `SILVERBULLET_BIN` | `silverbullet` | Path to the `silverbullet` server binary (or rely on `$PATH`) |
| `SB_CHROME_PATH` | `/usr/bin/chromium` | Headless Chromium path |
| `SB_TEST_PORT` | random free | Port for the test server |
| `DUMP_CONNECTIVITY` | unset | Dump the connectivity report markdown to stderr |
| `KEEP_TEST_SPACE` | unset | Leave the temp space dir on teardown for inspection |
