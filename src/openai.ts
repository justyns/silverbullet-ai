import { editor } from "$sb/syscalls.ts";
import { SSE } from "npm:sse.js@2.2.0";
import { aiSettings, apiKey, initializeOpenAI } from "./init.ts";
import { getPageLength } from "./editorUtils.ts";

export async function streamChatWithOpenAI(
  messages: Array<{ role: string; content: string }> | {
    systemMessage: string;
    userMessage: string;
  },
  cursorStart: number | undefined = undefined,
  cursorFollow: boolean = false,
): Promise<void> {
  try {
    if (!apiKey) await initializeOpenAI();

    const sseUrl = `${aiSettings.openAIBaseUrl}/chat/completions`;
    let payloadMessages;
    if ("systemMessage" in messages && "userMessage" in messages) {
      payloadMessages = [
        { role: "system", content: messages.systemMessage },
        { role: "user", content: messages.userMessage },
      ];
    } else {
      payloadMessages = messages;
    }

    var headers = {
      "Content-Type": "application/json",
    };
    if (aiSettings.requireAuth) {
      headers["Authorization"] = `Bearer ${apiKey}`;
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
    if (!cursorStart) {
      cursorPos = await getPageLength();
    } else {
      cursorPos = cursorStart;
    }
    // TODO: Leaving this here for now, but it doesn't quite work.  Need to fix it later.
    // const spinnerStates = ['⏳', '⌛️', '⏳', '⌛️'];
    // const spinnerStates = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    // const spinnerStates = ["…    ", "……  ", "……… ", "………"];
    // let currentStateIndex = 0;
    // let loadingMsg = ` 🤔 Thinking ${spinnerStates[currentStateIndex]} `;
    let loadingMsg = ` 🤔 Thinking …… `;
    await editor.insertAtPos(loadingMsg, cursorPos);
    let stillLoading = true;

    const updateLoadingSpinner = async () => {
      while (stillLoading) {
        const replaceTo = cursorPos + loadingMsg.length;
        currentStateIndex = (currentStateIndex + 1) % spinnerStates.length;
        loadingMsg = ` 🤔 Thinking ${spinnerStates[currentStateIndex]} …`;
        await editor.replaceRange(cursorPos, replaceTo, loadingMsg);
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    };
    // updateLoadingSpinner(); // Start updating the spinner in the background
    // await new Promise(resolve => setTimeout(resolve, 10000));

    source.addEventListener("message", function (e) {
      try {
        if (e.data == "[DONE]") {
          source.close();
          stillLoading = false;
        } else {
          const data = JSON.parse(e.data);
          const msg = data.choices[0]?.delta?.content || "";
          if (stillLoading) {
            stillLoading = false;
            editor.replaceRange(cursorPos, cursorPos + loadingMsg.length, msg);
          } else {
            editor.insertAtPos(msg, cursorPos);
          }
          cursorPos += msg.length;
        }
        if (cursorFollow) {
          editor.moveCursor(cursorPos, true);
        }
      } catch (error) {
        console.error("Error processing message event:", error, e.data);
      }
    });

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
