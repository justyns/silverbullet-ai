// Route outbound requests through SilverBullet's `/.proxy/` endpoint to avoid
// browser CORS. Dependency-free leaf so providers and the MCP client can share
// it. Originally from silverbullet/client/plugos/syscalls/fetch.ts.

export function buildProxyHeaders(
  headers?: Record<string, any>,
): Record<string, any> {
  const newHeaders: Record<string, any> = { "X-Proxy-Request": "true" };
  if (!headers) {
    return newHeaders;
  }
  for (const [key, value] of Object.entries(headers)) {
    newHeaders[`X-Proxy-Header-${key}`] = value;
  }
  return newHeaders;
}

export function buildProxyUrl(url: string): string {
  // Plug workers are loaded from <prefix>/.fs/..., so derive the prefix from our
  // own location to support SilverBullet instances hosted under a URL prefix.
  const pathname = globalThis.location?.pathname ?? "";
  const base = pathname.includes("/.fs/") ? pathname.split("/.fs/")[0] : "";
  return `${base}/.proxy/${url.replace(/^https?:\/\//i, "")}`;
}

// When proxied, SilverBullet returns its own 200 and moves the upstream status to
// `x-proxy-status-code` and upstream headers to `x-proxy-header-*`. These read the
// real values back (and fall through to the direct response when not proxying).
export function readResponseHeader(
  res: Response,
  name: string,
  useProxy: boolean,
): string | undefined {
  if (useProxy) {
    return res.headers.get(`x-proxy-header-${name}`) ??
      res.headers.get(name) ?? undefined;
  }
  return res.headers.get(name) ?? undefined;
}

export function readStatus(res: Response, useProxy: boolean): number {
  if (useProxy) {
    const s = res.headers.get("x-proxy-status-code");
    if (s) return Number(s);
  }
  return res.status;
}

// Rebuild a proxied response as if it came straight from upstream, so callers can
// use `res.ok`/`res.status`/`res.headers` normally. Mirrors what SilverBullet's
// own worker fetch shim does with the `x-proxy-*` headers.
async function unwrapProxyResponse(res: Response): Promise<Response> {
  const headers = new Headers();
  for (const [key, value] of res.headers.entries()) {
    if (key.toLowerCase().startsWith("x-proxy-header-")) {
      headers.set(key.slice("x-proxy-header-".length), value);
    }
  }
  const status = readStatus(res, true);
  // The Response constructor rejects a body for these statuses.
  const body = status === 204 || status === 205 || status === 304
    ? null
    : await res.arrayBuffer();
  return new Response(body, { status, headers });
}

// The plug worker's `fetch` is monkey-patched to route through SilverBullet's
// `sandboxFetch` syscall, which drops our AbortSignal and applies its own
// non-configurable 30s cap. We build the proxy URL and headers ourselves, so
// always go through the original. Resolved at call time; outside a plug worker
// there is no `nativeFetch`.
const rawFetch: typeof fetch = (url, init) =>
  ((globalThis as any).nativeFetch ?? globalThis.fetch)(url, init);

/**
 * Fetch through `/.proxy/` when `useProxy` is set, with `timeout` as the only
 * request deadline.
 */
export async function proxiedFetch(
  url: string,
  options: RequestInit,
  useProxy: boolean,
  timeout: number,
  name: string,
): Promise<Response> {
  try {
    const res = await rawFetch(useProxy ? buildProxyUrl(url) : url, {
      ...options,
      headers: useProxy
        ? buildProxyHeaders(options.headers as Record<string, any> | undefined)
        : options.headers,
      signal: AbortSignal.timeout(timeout),
    });
    return useProxy ? await unwrapProxyResponse(res) : res;
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error(
        `Request to ${name} timed out after ${timeout / 1000}s. ` +
          `Increase timeout in provider config.`,
      );
    }
    throw error;
  }
}
