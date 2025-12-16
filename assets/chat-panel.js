// Needs to match the key in src/chat-panel.ts
const CHAT_HISTORY_KEY = "ai.panelChatHistory";

(function () {
  const messagesContainer = document.getElementById("messages");
  const userInput = document.getElementById("user-input");
  const sendBtn = document.getElementById("send-btn");
  const newChatBtn = document.getElementById("new-chat-btn");
  const exportBtn = document.getElementById("export-btn");
  const closeBtn = document.getElementById("close-btn");

  let chatHistory = [];
  let currentStreamId = null;
  let isStreaming = false;

  async function loadHistory() {
    try {
      const history = await syscall("clientStore.get", CHAT_HISTORY_KEY);
      if (history && Array.isArray(history)) {
        chatHistory = history;
        await renderAllMessages();
      }
    } catch (e) {
      console.error("Failed to load chat history:", e);
    }
  }

  async function saveHistory() {
    try {
      await syscall("clientStore.set", CHAT_HISTORY_KEY, chatHistory);
    } catch (e) {
      console.error("Failed to save chat history:", e);
    }
  }

  async function renderMessage(role, content, streaming = false) {
    const msgEl = document.createElement("div");
    msgEl.className = "message " + role + (streaming ? " streaming" : "");

    if (role === "assistant" && !streaming && content) {
      try {
        const html = await syscall("markdown.markdownToHtml", content);
        msgEl.innerHTML = html;
      } catch (e) {
        console.error("Failed to render markdown:", e);
        msgEl.textContent = content;
      }
    } else {
      msgEl.textContent = content;
    }

    messagesContainer.appendChild(msgEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return msgEl;
  }

  async function renderAllMessages() {
    messagesContainer.innerHTML = "";

    if (chatHistory.length === 0) {
      messagesContainer.innerHTML = `
        <div class="empty-state" id="empty-state">
          <h4>Start a conversation</h4>
          <p>Ask anything about your notes or something.</p>
        </div>
      `;
      return;
    }

    for (const msg of chatHistory) {
      if (msg.role !== "system") {
        await renderMessage(msg.role, msg.content);
      }
    }
  }

  async function pollForChunks(streamId, messageEl) {
    while (isStreaming && currentStreamId === streamId) {
      try {
        const result = await syscall(
          "system.invokeFunction",
          "silverbullet-ai.getPanelChatChunk",
          streamId,
        );

        if (result.chunks && result.chunks.length > 0) {
          const currentText = messageEl.textContent;
          messageEl.textContent = currentText + result.chunks.join("");
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        if (result.status === "complete") {
          isStreaming = false;
          messageEl.classList.remove("streaming");
          const fullResponse = messageEl.textContent;
          // Re-render as markdown now that streaming is complete
          try {
            const html = await syscall("markdown.markdownToHtml", fullResponse);
            messageEl.innerHTML = html;
          } catch (e) {
            console.error("Failed to render markdown:", e);
          }
          chatHistory.push({ role: "assistant", content: fullResponse });
          await saveHistory();
          break;
        } else if (result.status === "error") {
          isStreaming = false;
          messageEl.classList.remove("streaming");
          messageEl.textContent += "\n\n[Error: " +
            (result.error || "Unknown error") + "]";
          break;
        }

        // TODO: Add a config option for this, it might be kind of aggressive since we're polling and not really streaming
        await new Promise((r) => setTimeout(r, 50));
      } catch (e) {
        console.error("Polling error:", e);
        isStreaming = false;
        messageEl.classList.remove("streaming");
        messageEl.textContent += "\n\n[Error: " + e.message + "]";
        break;
      }
    }

    sendBtn.disabled = false;
    userInput.disabled = false;
    userInput.focus();
  }

  async function sendMessage() {
    const content = userInput.value.trim();
    if (!content || isStreaming) return;

    chatHistory.push({ role: "user", content });
    await renderAllMessages();

    userInput.value = "";
    userInput.style.height = "auto";

    sendBtn.disabled = true;
    userInput.disabled = true;

    const assistantEl = await renderMessage("assistant", "", true);

    try {
      const result = await syscall(
        "system.invokeFunction",
        "silverbullet-ai.startPanelChat",
        chatHistory,
      );

      if (result.streamId) {
        currentStreamId = result.streamId;
        isStreaming = true;
        pollForChunks(result.streamId, assistantEl);
      } else if (result.error) {
        assistantEl.classList.remove("streaming");
        assistantEl.textContent = "[Error: " + result.error + "]";
        sendBtn.disabled = false;
        userInput.disabled = false;
      }
    } catch (e) {
      console.error("Failed to start chat:", e);
      assistantEl.classList.remove("streaming");
      assistantEl.textContent = "[Error: " + e.message + "]";
      sendBtn.disabled = false;
      userInput.disabled = false;
    }

    await saveHistory();
  }

  async function newChat() {
    chatHistory = [];
    await saveHistory();
    await renderAllMessages();
    userInput.focus();
  }

  async function exportChat() {
    if (chatHistory.length === 0) return;
    try {
      await syscall(
        "system.invokeFunction",
        "silverbullet-ai.exportPanelChat",
      );
    } catch (e) {
      console.error("Failed to export chat:", e);
    }
  }

  function closePanel() {
    syscall("system.invokeFunction", "silverbullet-ai.closeAIAssistant");
  }

  userInput.addEventListener("input", function () {
    this.style.height = "auto";
    this.style.height = Math.min(this.scrollHeight, 120) + "px";
  });

  userInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener("click", sendMessage);
  newChatBtn.addEventListener("click", newChat);
  exportBtn.addEventListener("click", exportChat);
  closeBtn.addEventListener("click", closePanel);

  loadHistory();
  userInput.focus();
})();
