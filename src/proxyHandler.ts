import { system } from "@silverbulletmd/silverbullet/syscalls";
import { ProxyRequest, ProxyResponseChunk } from "./types.ts";

// Track active requests and their handlers
type RequestHandlers = {
  onData: (data: string) => void;
  onComplete: (data: string) => void;
  accumulatedText: string;
};
const activeRequests = new Map<string, RequestHandlers>();

/**
 * Register handlers for a proxy request. This must be called before dispatching
 * the proxyRequestStart event.
 */
export function registerRequestHandlers(
  requestId: string,
  onData: (data: string) => void,
  onComplete: (data: string) => void,
) {
  activeRequests.set(requestId, {
    onData,
    onComplete,
    accumulatedText: "",
  });
}

/**
 * Clean up handlers for a proxy request.
 */
export function cleanupRequest(requestId: string) {
  activeRequests.delete(requestId);
}

/**
 * proxyRequestStart is triggered by the ai:proxyRequestStart event
 * and runs on the server side to make the actual HTTP request.
 * The event.detail contains all necessary request information.
 */
export async function proxyRequestStart(event: { detail: { detail: ProxyRequest } }) {
  if (!event.detail?.detail) {
    throw new Error("No request details provided");
  }

  const request = event.detail.detail;
  const { requestId, url, method, headers, body, stream } = request;

  try {
    if (stream) {
      // For SSE streaming requests
      const response = await fetch(url, {
        method,
        headers: {
          ...headers,
          Accept: "text/event-stream",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error("No response body received");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          // Signal completion
          await system.dispatchEvent("ai:proxyResponseChunk", {
            detail: {
              requestId,
              chunk: "",
              done: true,
            } as ProxyResponseChunk,
          });
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        await system.dispatchEvent("ai:proxyResponseChunk", {
          detail: {
            requestId,
            chunk,
          } as ProxyResponseChunk,
        });
      }
    } else {
      // For regular non-streaming requests
      const response = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.text();

      // For non-streaming, send single chunk with done flag
      await system.dispatchEvent("ai:proxyResponseChunk", {
        detail: {
          requestId,
          chunk: data,
          done: true,
        } as ProxyResponseChunk,
      });
    }
  } catch (error) {
    console.error("Proxy request error:", error);
    // Send error as final chunk
    await system.dispatchEvent("ai:proxyResponseChunk", {
      detail: {
        requestId,
        chunk: `Error: ${error.message}`,
        done: true,
      } as ProxyResponseChunk,
    });
  }
}

/**
 * handleProxyResponse is triggered by ai:proxyResponseChunk events
 * and runs on the client side to handle response chunks.
 */
export function handleProxyResponse(event: { detail: { detail: ProxyResponseChunk } }) {
  if (!event.detail?.detail) {
    console.error("No response chunk details provided");
    return;
  }

  const { requestId, chunk, done } = event.detail.detail;
  const handlers = activeRequests.get(requestId);

  if (!handlers) {
    console.error(`No handlers found for request ${requestId}`);
    return;
  }

  if (chunk) {
    handlers.onData(chunk);
    handlers.accumulatedText += chunk;
  }

  if (done) {
    handlers.onComplete(handlers.accumulatedText);
    cleanupRequest(requestId);
  }
}
