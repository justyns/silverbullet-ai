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
