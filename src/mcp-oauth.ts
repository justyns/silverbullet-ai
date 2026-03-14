/**
 * OAuth 2.1 support for MCP servers.
 *
 * Implements the authorization code flow with PKCE (RFC 7636) and optionally
 * dynamic client registration (RFC 7591). Tokens are stored in clientStore
 * and refreshed automatically.
 */

import { asset, clientStore, editor } from "@silverbulletmd/silverbullet/syscalls";
import type { MCPOAuthConfig } from "./types.ts";

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

function base64urlEncode(data: Uint8Array | ArrayBuffer): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let str = "";
  for (const byte of bytes) {
    str += String.fromCharCode(byte);
  }
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64urlEncode(verifierBytes);
  const challengeBytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  const challenge = base64urlEncode(challengeBytes);
  return { verifier, challenge };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OAuthServerMetadata = {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
};

type OAuthTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
};

type StoredToken = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number; // Unix ms
  tokenType: string;
};

type StoredClient = {
  clientId: string;
  clientSecret?: string;
};

type StoredPKCE = {
  codeVerifier: string;
  serverName: string;
  tokenEndpoint: string;
  clientId: string;
};

// ---------------------------------------------------------------------------
// clientStore keys
// ---------------------------------------------------------------------------

const TOKEN_KEY = (name: string) => `mcp.oauth.tokens.${name}`;
const CLIENT_KEY = (name: string) => `mcp.oauth.client.${name}`;
const PKCE_KEY = (state: string) => `mcp.oauth.pkce.${state}`;

// ---------------------------------------------------------------------------
// In-memory registry of pending OAuth flows
// (keyed by server name, resolved when the callback arrives)
// ---------------------------------------------------------------------------

const pendingFlows = new Map<
  string,
  { resolve: (token: string) => void; reject: (e: Error) => void }
>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a valid access token for the given MCP server, triggering the full
 * OAuth flow (popup + PKCE exchange) if no valid token is cached.
 */
export async function getValidAccessToken(
  serverName: string,
  serverUrl: string,
  oauthConfig: MCPOAuthConfig,
): Promise<string> {
  const stored = await clientStore.get(TOKEN_KEY(serverName)) as StoredToken | null;

  if (stored) {
    const now = Date.now();
    // Return cached token if still valid with a 60 s buffer
    if (!stored.expiresAt || stored.expiresAt - now > 60_000) {
      return stored.accessToken;
    }

    // Try a silent refresh
    if (stored.refreshToken) {
      try {
        const metadata = await discoverMetadata(serverUrl, oauthConfig);
        const clientInfo = await getOrRegisterClient(
          serverName,
          serverUrl,
          oauthConfig,
          metadata,
        );
        const refreshed = await exchangeRefreshToken(
          stored.refreshToken,
          metadata.token_endpoint,
          clientInfo.clientId,
        );
        const newStored = toStoredToken(refreshed, stored.refreshToken);
        await clientStore.set(TOKEN_KEY(serverName), newStored);
        return newStored.accessToken;
      } catch (e) {
        console.warn(`[MCP OAuth] Token refresh failed for "${serverName}", re-authorizing:`, e);
        // Fall through to full flow
      }
    }
  }

  return triggerOAuthFlow(serverName, serverUrl, oauthConfig);
}

/**
 * Clears stored tokens for a server so the next call to getValidAccessToken
 * triggers a fresh authorization flow.
 */
export async function clearOAuthTokens(serverName: string): Promise<void> {
  await clientStore.del(TOKEN_KEY(serverName));
}

/**
 * Clears both the stored token and the registered client for a server,
 * forcing a full re-registration on the next connection attempt.
 */
export async function clearOAuthClient(serverName: string): Promise<void> {
  await clientStore.del(TOKEN_KEY(serverName));
  await clientStore.del(CLIENT_KEY(serverName));
}

/**
 * Called by the OAuth modal JS when it receives the authorization code.
 * Exchanges the code for tokens, stores them, and resolves the pending flow.
 */
export async function handleMcpOAuthCallback(
  serverName: string,
  code: string,
  state: string,
  redirectUri: string,
): Promise<void> {
  const pkce = await clientStore.get(PKCE_KEY(state)) as StoredPKCE | null;

  if (!pkce || pkce.serverName !== serverName) {
    console.error(`[MCP OAuth] PKCE state mismatch for state="${state}"`);
    await clientStore.del(PKCE_KEY(state));
    const pending = pendingFlows.get(serverName);
    if (pending) {
      pendingFlows.delete(serverName);
      pending.reject(new Error("OAuth state mismatch — possible CSRF, please retry"));
    }
    await editor.hidePanel("modal");
    return;
  }

  await clientStore.del(PKCE_KEY(state));

  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: pkce.clientId,
      code_verifier: pkce.codeVerifier,
    });

    const response = await fetch(pkce.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Token exchange failed: HTTP ${response.status}: ${text.slice(0, 200)}`);
    }

    const tokenResponse = await response.json() as OAuthTokenResponse;
    const stored = toStoredToken(tokenResponse);
    await clientStore.set(TOKEN_KEY(serverName), stored);

    console.log(`[MCP OAuth] "${serverName}" authenticated successfully`);

    const pending = pendingFlows.get(serverName);
    if (pending) {
      pendingFlows.delete(serverName);
      pending.resolve(stored.accessToken);
    }
  } catch (e) {
    console.error(`[MCP OAuth] Token exchange error for "${serverName}":`, e);
    const pending = pendingFlows.get(serverName);
    if (pending) {
      pendingFlows.delete(serverName);
      pending.reject(e as Error);
    }
  }

  await editor.hidePanel("modal");
}

/**
 * Called by the OAuth modal JS when the user cancels or closes the popup.
 */
export async function closeMcpOAuthModal(serverName: string): Promise<void> {
  const pending = pendingFlows.get(serverName);
  if (pending) {
    pendingFlows.delete(serverName);
    pending.reject(new Error(`OAuth cancelled by user for "${serverName}"`));
  }
  await editor.hidePanel("modal");
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function discoverMetadata(
  serverUrl: string,
  oauthConfig: MCPOAuthConfig,
): Promise<OAuthServerMetadata> {
  if (oauthConfig.authorizationUrl && oauthConfig.tokenUrl) {
    return {
      authorization_endpoint: oauthConfig.authorizationUrl,
      token_endpoint: oauthConfig.tokenUrl,
    };
  }

  const origin = new URL(serverUrl).origin;
  const wellKnownUrl = `${origin}/.well-known/oauth-authorization-server`;

  const response = await fetch(wellKnownUrl, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    throw new Error(
      `OAuth metadata discovery failed: HTTP ${response.status} from ${wellKnownUrl}`,
    );
  }

  const meta = await response.json() as OAuthServerMetadata;
  if (!meta.authorization_endpoint || !meta.token_endpoint) {
    throw new Error(
      "OAuth metadata missing required fields (authorization_endpoint, token_endpoint)",
    );
  }

  return meta;
}

async function getExistingClient(
  serverName: string,
  oauthConfig: MCPOAuthConfig,
): Promise<StoredClient | null> {
  if (oauthConfig.clientId) {
    return { clientId: oauthConfig.clientId };
  }
  return await clientStore.get(CLIENT_KEY(serverName)) as StoredClient | null;
}

// Used by getValidAccessToken during token refresh (clientId must already be known)
async function getOrRegisterClient(
  serverName: string,
  serverUrl: string,
  oauthConfig: MCPOAuthConfig,
  metadata: OAuthServerMetadata,
): Promise<StoredClient> {
  const existing = await getExistingClient(serverName, oauthConfig);
  if (existing) return existing;

  if (!metadata.registration_endpoint) {
    throw new Error(
      `MCP OAuth "${serverName}": no clientId configured and server does not support dynamic client registration`,
    );
  }

  // Fallback: register with server origin (only reached during refresh, redirect_uri already matched)
  const origin = new URL(serverUrl).origin;
  const response = await fetch(metadata.registration_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "SilverBullet AI",
      redirect_uris: [origin],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Dynamic client registration failed: HTTP ${response.status}: ${text.slice(0, 200)}`,
    );
  }

  const reg = await response.json() as { client_id: string; client_secret?: string };
  const client: StoredClient = { clientId: reg.client_id, clientSecret: reg.client_secret };
  await clientStore.set(CLIENT_KEY(serverName), client);
  return client;
}

/**
 * Called from the OAuth modal JS to register a new OAuth client using the
 * correct redirect URI (window.location.origin from the browser).
 * Stores the resulting clientId and updates the PKCE entry for the given state.
 */
export async function registerAndStoreMcpOAuthClient(
  serverName: string,
  registrationEndpoint: string,
  redirectUri: string,
  state: string,
): Promise<string> {
  const response = await fetch(registrationEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "SilverBullet AI",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Dynamic client registration failed: HTTP ${response.status}: ${text.slice(0, 200)}`,
    );
  }

  const reg = await response.json() as { client_id: string; client_secret?: string };
  await clientStore.set(CLIENT_KEY(serverName), {
    clientId: reg.client_id,
    clientSecret: reg.client_secret,
  });

  // Update the PKCE entry so handleMcpOAuthCallback has the correct clientId
  const pkce = await clientStore.get(PKCE_KEY(state)) as StoredPKCE | null;
  if (pkce) {
    pkce.clientId = reg.client_id;
    await clientStore.set(PKCE_KEY(state), pkce);
  }

  return reg.client_id;
}

async function exchangeRefreshToken(
  refreshToken: string,
  tokenEndpoint: string,
  clientId: string,
): Promise<OAuthTokenResponse> {
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
    }).toString(),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Token refresh failed: HTTP ${response.status}: ${text.slice(0, 200)}`);
  }

  return response.json() as Promise<OAuthTokenResponse>;
}

async function triggerOAuthFlow(
  serverName: string,
  serverUrl: string,
  oauthConfig: MCPOAuthConfig,
): Promise<string> {
  const metadata = await discoverMetadata(serverUrl, oauthConfig);
  const existingClient = await getExistingClient(serverName, oauthConfig);

  const { verifier, challenge } = await generatePKCE();
  const state = crypto.randomUUID().replace(/-/g, "");

  // Persist the PKCE state so the callback can complete the exchange.
  // clientId may be empty string when dynamic registration is deferred to the
  // modal — registerAndStoreMcpOAuthClient will fill it in before the callback.
  const pkce: StoredPKCE = {
    codeVerifier: verifier,
    serverName,
    tokenEndpoint: metadata.token_endpoint,
    clientId: existingClient?.clientId ?? "",
  };
  await clientStore.set(PKCE_KEY(state), pkce);

  let modalData: Record<string, unknown>;

  if (existingClient) {
    // clientId already known — build the full auth URL now (redirect_uri
    // appended by the modal because only the browser knows window.location.origin)
    const authParams = new URLSearchParams({
      response_type: "code",
      client_id: existingClient.clientId,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      ...(oauthConfig.scopes?.length ? { scope: oauthConfig.scopes.join(" ") } : {}),
    });
    modalData = {
      serverName,
      state,
      authUrlBase: `${metadata.authorization_endpoint}?${authParams.toString()}`,
    };
  } else if (metadata.registration_endpoint) {
    // No clientId yet — defer dynamic registration to the modal so that
    // window.location.origin (the SilverBullet app URL) is used as the
    // redirect_uri, not the MCP server's origin.
    const authParams = new URLSearchParams({
      response_type: "code",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      ...(oauthConfig.scopes?.length ? { scope: oauthConfig.scopes.join(" ") } : {}),
    });
    modalData = {
      serverName,
      state,
      registrationEndpoint: metadata.registration_endpoint,
      authorizationEndpoint: metadata.authorization_endpoint,
      authParamsBase: authParams.toString(),
    };
  } else {
    throw new Error(
      `MCP OAuth "${serverName}": no clientId configured and server does not support dynamic client registration`,
    );
  }

  return new Promise((resolve, reject) => {
    pendingFlows.set(serverName, { resolve, reject });

    (async () => {
      try {
        const html = await asset.readAsset("silverbullet-ai", "assets/mcp-oauth-modal.html");
        const script = await asset.readAsset("silverbullet-ai", "assets/mcp-oauth-modal.js");

        const initScript = `
          globalThis.mcpOAuthData = ${JSON.stringify(modalData)};
          ${script}
        `;

        await editor.showPanel("modal", 20, html, initScript);
      } catch (e) {
        pendingFlows.delete(serverName);
        reject(e as Error);
      }
    })();
  });
}

function toStoredToken(
  tokenResponse: OAuthTokenResponse,
  fallbackRefreshToken?: string,
): StoredToken {
  return {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token ?? fallbackRefreshToken,
    expiresAt: tokenResponse.expires_in
      ? Date.now() + tokenResponse.expires_in * 1000
      : undefined,
    tokenType: tokenResponse.token_type ?? "Bearer",
  };
}

/**
 * Command: lets the user pick a connected MCP server and clears its stored
 * OAuth token and client registration, forcing a fresh auth flow on next use.
 */
export async function resetMcpOAuthCommand(): Promise<void> {
  const { getMcpClients } = await import("./mcp-client.ts");
  const clients = getMcpClients();

  if (clients.size === 0) {
    await editor.flashNotification("No MCP servers are currently connected.", "error");
    return;
  }

  const options = Array.from(clients.keys()).map((name) => ({ name, description: name }));
  const selected = await editor.filterBox("Reset MCP OAuth — select server", options);
  if (!selected) return;

  await clearOAuthClient(selected.name);
  await editor.flashNotification(`OAuth credentials cleared for "${selected.name}". Reconnect to re-authenticate.`, "info");
}
