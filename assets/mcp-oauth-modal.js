// Wait for SilverBullet CSS to load and inject custom Space Styles
(async function initTheme() {
  await Promise.race([
    new Promise((resolve) => setTimeout(resolve, 75)),
    new Promise((resolve) => {
      const link = document.querySelector('link[href*="main.css"]');
      if (link) link.onload = resolve;
    }),
  ]);

  try {
    const customStyles = await syscall("editor.getUiOption", "customStyles");
    if (customStyles) {
      const styleContainer = document.createElement("div");
      styleContainer.innerHTML = customStyles;
      document.head.appendChild(styleContainer);
    }
  } catch (e) {
    console.warn("Could not load custom styles:", e);
  }
})();

(function () {
  const serverNameEl = document.getElementById("server-name");
  const statusTextEl = document.getElementById("status-text");
  const authorizeBtn = document.getElementById("authorize-btn");
  const cancelBtn = document.getElementById("cancel-btn");

  let serverName = null;
  let authUrlBase = null;
  let state = null;
  let pollInterval = null;
  let cancelled = false;

  function setStatus(text, type) {
    statusTextEl.textContent = text;
    statusTextEl.className = type || "";
  }

  function openAuthPopup() {
    const redirectUri = window.location.origin;
    const authUrl = authUrlBase + "&redirect_uri=" + encodeURIComponent(redirectUri);

    const popup = window.open(
      authUrl,
      "mcp-oauth-popup",
      "width=600,height=700,scrollbars=yes,resizable=yes",
    );

    if (!popup) {
      setStatus("Popup was blocked. Please allow popups for this site and try again.", "error");
      return;
    }

    setStatus("Waiting for authorization in popup…", "waiting");
    authorizeBtn.disabled = true;

    pollInterval = setInterval(async () => {
      if (cancelled) {
        clearInterval(pollInterval);
        return;
      }

      // Check if popup was closed by the user without completing auth
      if (popup.closed) {
        clearInterval(pollInterval);
        if (!cancelled) {
          setStatus("Popup closed. Click Authorize to try again.", "error");
          authorizeBtn.disabled = false;
        }
        return;
      }

      try {
        // This throws a cross-origin error while the popup is on the auth server.
        // Once the auth server redirects back to our origin, we can read the URL.
        const href = popup.location.href;
        const url = new URL(href);
        const code = url.searchParams.get("code");
        const receivedState = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error) {
          clearInterval(pollInterval);
          popup.close();
          setStatus("Authorization failed: " + error, "error");
          authorizeBtn.disabled = false;
          return;
        }

        if (code && receivedState) {
          clearInterval(pollInterval);
          popup.close();

          if (receivedState !== state) {
            setStatus("Authorization failed: state mismatch (possible CSRF).", "error");
            authorizeBtn.disabled = false;
            return;
          }

          setStatus("Authorization code received, exchanging for token…", "waiting");

          try {
            await syscall(
              "system.invokeFunction",
              "silverbullet-ai.handleMcpOAuthCallback",
              serverName,
              code,
              receivedState,
              redirectUri,
            );
            setStatus("Authenticated successfully!", "success");
          } catch (e) {
            setStatus("Token exchange failed: " + (e.message || String(e)), "error");
            authorizeBtn.disabled = false;
          }
        }
      } catch (_crossOriginError) {
        // Still on the auth server domain — keep polling
      }
    }, 500);
  }

  async function cancel() {
    cancelled = true;
    if (pollInterval) clearInterval(pollInterval);
    try {
      await syscall(
        "system.invokeFunction",
        "silverbullet-ai.closeMcpOAuthModal",
        serverName,
      );
    } catch (e) {
      console.error("Failed to cancel OAuth flow:", e);
    }
  }

  function init(data) {
    serverName = data.serverName;
    authUrlBase = data.authUrlBase;
    state = data.state;
    serverNameEl.textContent = serverName;
  }

  authorizeBtn.addEventListener("click", openAuthPopup);
  cancelBtn.addEventListener("click", cancel);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });

  if (globalThis.mcpOAuthData) {
    init(globalThis.mcpOAuthData);
  }
})();
