import { describe, expect, test } from "vitest";
import {
  parseMcpMessages,
  parseSseMessages,
  ProxiedHttpTransport,
} from "./http.ts";

describe("parseSseMessages", () => {
  test("parses a single `event: message` / `data:` frame", () => {
    const body =
      'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n';
    expect(parseSseMessages(body)).toEqual([
      { jsonrpc: "2.0", id: 1, result: { ok: true } },
    ]);
  });

  test("tolerates CRLF and skips comments/keepalives", () => {
    const body =
      ': keepalive\r\n\r\nevent: message\r\ndata: {"jsonrpc":"2.0","id":2,"result":{}}\r\n\r\n';
    expect(parseSseMessages(body)).toEqual([
      { jsonrpc: "2.0", id: 2, result: {} },
    ]);
  });

  test("joins multi-line data fields", () => {
    const body = 'data: {"jsonrpc":"2.0",\ndata: "id":3,"result":{}}\n\n';
    expect(parseSseMessages(body)).toEqual([
      { jsonrpc: "2.0", id: 3, result: {} },
    ]);
  });
});

describe("parseMcpMessages", () => {
  test("parses a single application/json message", () => {
    expect(
      parseMcpMessages('{"jsonrpc":"2.0","id":1,"result":{}}', "application/json"),
    ).toEqual([{ jsonrpc: "2.0", id: 1, result: {} }]);
  });

  test("parses a JSON batch array", () => {
    expect(
      parseMcpMessages('[{"jsonrpc":"2.0","id":1,"result":{}}]', "application/json"),
    ).toHaveLength(1);
  });

  test("routes text/event-stream content to the SSE parser", () => {
    expect(
      parseMcpMessages(
        'data: {"jsonrpc":"2.0","id":2,"result":{}}\n\n',
        "text/event-stream; charset=utf-8",
      ),
    ).toEqual([{ jsonrpc: "2.0", id: 2, result: {} }]);
  });
});

describe("ProxiedHttpTransport", () => {
  test("direct mode: plain headers, reads status + headers directly", async () => {
    let captured: { url: string; init: any } | undefined;
    const fetchFn = (url: string, init: any) => {
      captured = { url, init };
      return Promise.resolve(
        new Response(
          JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              "mcp-session-id": "sess-1",
            },
          },
        ),
      );
    };
    const t = new ProxiedHttpTransport(
      { url: "http://host:9000/mcp" },
      { useProxy: false, fetchFn },
    );
    const res = await t.post(
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      {},
    );

    expect(captured!.url).toBe("http://host:9000/mcp");
    expect(captured!.init.headers["Accept"]).toContain("text/event-stream");
    expect(captured!.init.headers["Content-Type"]).toBe("application/json");
    expect(res.status).toBe(200);
    expect(res.sessionId).toBe("sess-1");
    expect(res.messages).toHaveLength(1);
  });

  test("proxy mode: rewrites url, wraps headers, reads x-proxy-* response", async () => {
    let captured: { url: string; init: any } | undefined;
    const fetchFn = (url: string, init: any) => {
      captured = { url, init };
      return Promise.resolve(
        new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }), {
          status: 200, // the proxy's own status
          headers: {
            "x-proxy-status-code": "200",
            "x-proxy-header-content-type": "application/json",
            "x-proxy-header-mcp-session-id": "sess-9",
          },
        }),
      );
    };
    const t = new ProxiedHttpTransport(
      {
        url: "https://api.example.com/mcp",
        headers: { Authorization: "Bearer secret" },
      },
      { useProxy: true, fetchFn },
    );
    const res = await t.post(
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      {},
    );

    expect(captured!.url).toBe("/.proxy/api.example.com/mcp");
    expect(captured!.init.headers["X-Proxy-Request"]).toBe("true");
    expect(captured!.init.headers["X-Proxy-Header-Authorization"]).toBe(
      "Bearer secret",
    );
    expect(captured!.init.headers["X-Proxy-Header-Accept"]).toContain(
      "text/event-stream",
    );
    expect(res.sessionId).toBe("sess-9");
    expect(res.messages).toHaveLength(1);
  });

  test("forwards extra headers (session id + protocol version)", async () => {
    let captured: { url: string; init: any } | undefined;
    const fetchFn = (url: string, init: any) => {
      captured = { url, init };
      return Promise.resolve(new Response("", { status: 202 }));
    };
    const t = new ProxiedHttpTransport({ url: "http://h/mcp" }, {
      useProxy: false,
      fetchFn,
    });
    const res = await t.post(
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { "Mcp-Session-Id": "s1", "MCP-Protocol-Version": "2025-06-18" },
    );

    expect(captured!.init.headers["Mcp-Session-Id"]).toBe("s1");
    expect(captured!.init.headers["MCP-Protocol-Version"]).toBe("2025-06-18");
    expect(res.status).toBe(202);
    expect(res.messages).toEqual([]);
  });

  test("throws on a proxied HTTP error status", async () => {
    const fetchFn = () =>
      Promise.resolve(
        new Response("Session not found", {
          status: 200,
          headers: { "x-proxy-status-code": "404" },
        }),
      );
    const t = new ProxiedHttpTransport({ url: "http://h/mcp" }, {
      useProxy: true,
      fetchFn,
    });
    await expect(
      t.post({ jsonrpc: "2.0", id: 1, method: "tools/list" }, {}),
    ).rejects.toThrow(/HTTP 404/);
  });

  test("throws on a direct HTTP error status", async () => {
    const fetchFn = () =>
      Promise.resolve(new Response("nope", { status: 404 }));
    const t = new ProxiedHttpTransport({ url: "http://h/mcp" }, {
      useProxy: false,
      fetchFn,
    });
    await expect(
      t.post({ jsonrpc: "2.0", id: 1, method: "tools/list" }, {}),
    ).rejects.toThrow(/HTTP 404/);
  });

  test("sends configured custom headers", async () => {
    let captured: { url: string; init: any } | undefined;
    const fetchFn = (url: string, init: any) => {
      captured = { url, init };
      return Promise.resolve(
        new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    };
    const t = new ProxiedHttpTransport(
      {
        url: "http://h/mcp",
        headers: { "X-API-Key": "abc", "X-Tenant": "acme" },
      },
      { useProxy: false, fetchFn },
    );
    await t.post({ jsonrpc: "2.0", id: 1, method: "tools/list" }, {});
    expect(captured!.init.headers["X-API-Key"]).toBe("abc");
    expect(captured!.init.headers["X-Tenant"]).toBe("acme");
  });

  test("returns a JSON-RPC error body on 401 rather than throwing", async () => {
    const fetchFn = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32001, message: "Unauthorized" },
          }),
          { status: 401, headers: { "content-type": "application/json" } },
        ),
      );
    const t = new ProxiedHttpTransport({ url: "http://h/mcp" }, {
      useProxy: false,
      fetchFn,
    });
    const res = await t.post(
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      {},
    );
    expect(res.status).toBe(401);
    expect(res.messages).toHaveLength(1);
  });
});
