import { afterEach, expect, test, vi } from "vitest";

import { proxiedFetch } from "./proxy.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("proxiedFetch surfaces the upstream status and headers", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: {
          "x-proxy-status-code": "429",
          "x-proxy-header-content-type": "application/json",
        },
      }),
    ),
  );

  const res = await proxiedFetch(
    "https://example.com/v1/chat/completions",
    { method: "POST" },
    true,
    1000,
    "Ollama",
  );

  expect(res.status).toEqual(429);
  expect(res.ok).toEqual(false);
  expect(res.headers.get("content-type")).toEqual("application/json");
});

test("proxiedFetch proxies the URL exactly once and tunnels headers", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response("{}", { headers: { "x-proxy-status-code": "200" } }),
  );
  vi.stubGlobal("fetch", fetchMock);

  await proxiedFetch(
    "https://example.com/v1/models",
    { headers: { Authorization: "Bearer sk-test" } },
    true,
    1000,
    "OpenAI",
  );

  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toEqual("/.proxy/example.com/v1/models");
  expect(init.headers).toEqual({
    "X-Proxy-Request": "true",
    "X-Proxy-Header-Authorization": "Bearer sk-test",
  });
});

test("proxiedFetch tunnels headers given as a Headers instance", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response("{}", { headers: { "x-proxy-status-code": "200" } }),
  );
  vi.stubGlobal("fetch", fetchMock);

  await proxiedFetch(
    "https://example.com/v1/models",
    { headers: new Headers({ Authorization: "Bearer sk-test" }) },
    true,
    1000,
    "OpenAI",
  );

  // Headers lowercases names; the proxy re-canonicalizes them upstream.
  expect(fetchMock.mock.calls[0][1].headers).toEqual({
    "X-Proxy-Request": "true",
    "X-Proxy-Header-authorization": "Bearer sk-test",
  });
});

test("proxiedFetch applies the configured timeout, not SilverBullet's", async () => {
  // Only settles when our AbortSignal fires, mimicking a model that stalls.
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal!.addEventListener("abort", () =>
            reject(init.signal!.reason),
          );
        }),
    ),
  );

  await expect(
    proxiedFetch("https://example.com/v1/chat/completions", {}, true, 20, "Ollama"),
  ).rejects.toThrow("Request to Ollama timed out after 0.02s");
});
