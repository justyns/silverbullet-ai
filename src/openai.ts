import { editor } from "$sb/syscalls.ts";
import { SSE } from "npm:sse.js@2.2.0";
import { aiSettings, apiKey, initializeOpenAI } from "./init.ts";
import { getPageLength } from "./editorUtils.ts";

export async function streamChatWithOpenAI(
  messages: Array<{ role: string; content: string }> | {
    systemMessage: string;
    userMessage: string;
  },
): Promise<void> {
  try {
    if (!apiKey) await initializeOpenAI();
    await editor.flashNotification("Contacting LLM, please wait...");

    const sseUrl = `${aiSettings.openAIBaseUrl}/chat/completions`;
    let isInteractiveChat = false;
    let payloadMessages;
    if ("systemMessage" in messages && "userMessage" in messages) {
      payloadMessages = [
        { role: "system", content: messages.systemMessage },
        { role: "user", content: messages.userMessage },
      ];
    } else {
      payloadMessages = messages;
      isInteractiveChat = true;
    }

    var headers = {
      "Content-Type": "application/json",
    };
    if (aiSettings.requireAuth) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    const sseOptions = {
      method: "POST",
      headers: headers,
      payload: JSON.stringify({
        model: aiSettings.defaultTextModel,
        stream: true,
        messages: payloadMessages,
      }),
      withCredentials: false,
    };

    const source = new SSE(sseUrl, sseOptions);
    let cursorPos: number;
    cursorPos = await getPageLength();
    console.log("cursorPos before addeventlistener", cursorPos);

    source.addEventListener("message", function (e) {
      // console.log(e.data);
      try {
        // When done, we get [DONE]
        if (e.data == "[DONE]") {
          source.close()
          if (isInteractiveChat) {
            editor.insertAtPos("\n\n**user**: ", cursorPos);
          }
        } else {
          const data = JSON.parse(e.data);
          const msg = data.choices[0]?.delta?.content || "";
          editor.insertAtPos(msg, cursorPos);
          cursorPos += msg.length;
        }
      } catch (error) {
        console.error("Error processing message event:", error, e.data);
      }
    });

    // This is never really triggered
    source.addEventListener("end", function () {
      source.close();
    });

    source.stream();
  } catch (error) {
    console.error("Error streaming from OpenAI chat endpoint:", error);
    await editor.flashNotification(
      "Error streaming from OpenAI chat endpoint.",
      "error",
    );
    throw error;
  }
}

/**
 * This is the non-streaming version.  I'll probably get rid of it soon in favor of always streaming the response.
 */
export async function chatWithOpenAI(
  systemMessage: string,
  userMessages: Array<{ role: string; content: string }>,
) {
  try {
    if (!apiKey) await initializeOpenAI();
    if (!apiKey || !aiSettings || !aiSettings.openAIBaseUrl) {
      await editor.flashNotification(
        "API key or AI settings are not properly configured.",
        "error",
      );
      throw new Error("API key or AI settings are not properly configured.");
    }
    await editor.flashNotification("Contacting LLM, please wait...");
    const response = await fetch(
      aiSettings.openAIBaseUrl + "/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: aiSettings.defaultTextModel,
          messages: [
            { role: "system", content: systemMessage },
            ...userMessages,
          ],
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP error, status: ${response.status}`);
    }

    const data = await response.json();
    if (!data || !data.choices || data.choices.length === 0) {
      throw new Error("Invalid response from OpenAI.");
    }
    return data;
  } catch (error) {
    console.error("Error calling OpenAI chat endpoint:", error);
    await editor.flashNotification(
      "Error calling OpenAI chat endpoint.",
      "error",
    );
    throw error;
  }
}

export async function generateImageWithDallE(
  prompt: string,
  n: 1,
  size: "1024x1024" | "512x512" = "1024x1024",
  quality: "hd" | "standard" = "hd",
) {
  try {
    if (!apiKey) await initializeOpenAI();
    await editor.flashNotification("Contacting DALL·E, please wait...");
    const response = await fetch(
      aiSettings.dallEBaseUrl + "/images/generations",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt: prompt,
          quality: quality,
          n: n,
          size: size,
          response_format: "b64_json",
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP error, status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error calling DALL·E image generation endpoint:", error);
    throw error;
  }
}
