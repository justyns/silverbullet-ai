import { configureSelectedModel } from "./init.ts";
import { log } from "./utils.ts";
import { system } from "@silverbulletmd/silverbullet/syscalls";
import { ModelConfig } from "./types.ts";
import type {
  EndpointRequest,
  EndpointResponse,
} from "@silverbulletmd/silverbullet/types";
import { Provider } from "./types.ts";

export async function proxyHandler(request: EndpointRequest): Promise<Response | EndpointResponse> {
  console.log("ai:proxyHandler called to handle path:", request.path);
  // Find the model name from the path (e.g., /ai-proxy/ollama-localhost-proxy/chat/completions)
  const pathParts = request.path.split("/");
  const modelName = pathParts[2];
  let remainingPath = pathParts.slice(3).join("/");

  console.log("proxyHandler handling request for model:", modelName);

  if (!modelName) {
    return new Response("Model name not specified", { status: 400 });
  }

  try {
    const aiSettings = await system.getSpaceConfig("ai", {});
    if (!aiSettings || !aiSettings.textModels) {
      return new Response("No AI models configured", { status: 404 });
    }

    // Find the model configuration that matches the requested model name
    const modelConfig = aiSettings.textModels.find(
      (model: ModelConfig) => model.name === modelName
    );

    if (!modelConfig) {
      return new Response(`Model '${modelName}' not found in configuration`, { status: 404 });
    }

    // Check if proxy is enabled for this model
    if (modelConfig.proxyOnServer === false) {
      return new Response(`Proxy is disabled for model '${modelName}'`, { status: 403 });
    }

    // TODO: Confirm this doesn't overwrite the user's selected model
    await configureSelectedModel(modelConfig);
    let baseUrl = modelConfig.baseUrl;

    console.log("proxyHandler baseUrl:", baseUrl, "provider:", modelConfig.provider, "remainingPath:", remainingPath);
    // TODO: switch completions for ollama to use ollama api instead of openai api?
    if (modelConfig.provider === Provider.Ollama) {
      // For the list models endpoint, use /api/ without v1 prefix
      if (remainingPath.includes("models") || remainingPath == "api/tags") {
        baseUrl = baseUrl.replace(/v1\/?/, '');
      } else {
        // Everything else should use openai-compatible endpoints under /v1/
        baseUrl = baseUrl.replace(/\/v1\/?$/, '') + '/v1/';
      }
      console.log("New baseUrl for ollama:", baseUrl);
    }

    // Use the baseUrl from the model config and append the remaining path
    const apiUrl = baseUrl.endsWith('/') ? `${baseUrl}${remainingPath}` : `${baseUrl}/${remainingPath}`;

    // Forward the request to the appropriate LLM API with original headers
    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "*/*",
    };
    
    // Copy other relevant headers, but skip problematic ones
    for (const [key, value] of Object.entries(request.headers)) {
      if (!["host", "connection", "origin", "content-type", "content-length"].includes(key.toLowerCase())) {
        requestHeaders[key] = value as string;
      }
    }

    // Check if this is a streaming request based on the request body
    let requestBody: any = undefined;
    if (request.body) {
      try {
        requestBody = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
      } catch (error) {
        console.error("Error processing request body:", error);
        // Only return error for endpoints that require a body
        if (remainingPath === "chat/completions") {
          return new Response("Invalid JSON in request body", { status: 400 });
        }
      }
    }

    const isStreamingRequest = requestBody?.stream === true;
    console.log("Streaming request:", isStreamingRequest);

    if (isStreamingRequest) {
      console.log("proxyHandler handling streaming request");
      console.log("Request body before sending:", JSON.stringify(requestBody, null, 2));
      
      // For streaming requests, set appropriate headers
      requestHeaders["Accept"] = "text/event-stream";
      requestHeaders["Cache-Control"] = "no-cache";
      requestHeaders["Connection"] = "keep-alive";

      const response = await nativeFetch(apiUrl, {
        method: request.method,
        headers: requestHeaders,
        body: JSON.stringify(requestBody),
      });

      console.log("Response from LLM API:", response);

      const { readable, writable } = new TransformStream();
      response.body.pipeTo(writable);


      if (!response.ok) {
        const errorText = await response.text();
        console.log("Error from LLM API:", errorText);
        return new Response(`Failed to fetch from LLM API: ${errorText}`, { status: response.status });
      }

      // Instead of returning the stream directly, return a special response
      return {
        status: response.status,
        headers: {
          ...Object.fromEntries(response.headers.entries()),
          'content-type': 'text/event-stream',
        },
        // Send the response as an object that can be serialized
        body: {
          __type: 'STREAM_PROXY',
          url: apiUrl,
          method: request.method,
          headers: requestHeaders,
          requestBody: requestBody
        }
      };
    }

    // For non-streaming requests, use regular fetch
    const response = await nativeFetch(apiUrl, {
      method: request.method,
      headers: requestHeaders,
      body: request.method !== "GET" && request.method !== "HEAD" && requestBody ? JSON.stringify(requestBody) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      log("server", "LLM API error:", errorText);
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: `Failed to fetch from LLM API: ${errorText}`,
      };
    }

    // For non-streaming responses, return EndpointResponse
    const responseBody = await response.json().catch(async () => {
      console.log("proxyHandler JSON parsing failed, falling back to text");
      return await response.text();
    });

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseBody,
    };
  } catch (error) {
    log("server", "Error in proxyHandler:", error);
    return {
      status: 500,
      body: `Internal server error: ${error.message}`,
    };
  }
}
