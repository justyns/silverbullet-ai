// Needs to match the key in src/chat-panel.ts
const CHAT_HISTORY_KEY = "ai.panelChatHistory";

(function () {
  const messagesContainer = document.getElementById("messages");
  const userInput = document.getElementById("user-input");
  const sendBtn = document.getElementById("send-btn");
  const newChatBtn = document.getElementById("new-chat-btn");
  const exportBtn = document.getElementById("export-btn");
  const closeBtn = document.getElementById("close-btn");
  const agentIndicator = document.getElementById("agent-indicator");
  const agentNameEl = document.getElementById("agent-name");
  const clearAgentBtn = document.getElementById("clear-agent-btn");
  const tokenDisplayEl = document.getElementById("token-display");
  const tokenCountEl = document.getElementById("token-count");
  const contextLimitEl = document.getElementById("context-limit");
  const ragIndicatorEl = document.getElementById("rag-indicator");

  let chatHistory = [];
  let chatData = { id: null, messages: [] };
  let currentStreamId = null;
  let isStreaming = false;

  function formatNumber(n) {
    return n.toLocaleString();
  }

  let lastRagEnabled = false;

  async function updateChatStatus() {
    try {
      const status = await syscall(
        "system.invokeFunction",
        "silverbullet-ai.getChatStatus",
      );

      // Update token display
      tokenCountEl.textContent = formatNumber(status.tokens.total_tokens);
      contextLimitEl.textContent = status.model.contextLimit ? formatNumber(status.model.contextLimit) : "--";

      tokenDisplayEl.classList.remove("warning", "danger");
      if (status.model.contextLimit) {
        const ratio = status.tokens.total_tokens / status.model.contextLimit;
        if (ratio > 0.9) {
          tokenDisplayEl.classList.add("danger");
        } else if (ratio > 0.75) {
          tokenDisplayEl.classList.add("warning");
        }
      }

      // Update RAG status
      lastRagEnabled = status.rag.enabled && status.rag.indexEnabled;
      ragIndicatorEl.classList.remove("enabled", "disabled", "searching");

      if (lastRagEnabled) {
        ragIndicatorEl.classList.add("enabled");
        ragIndicatorEl.title = "Embeddings search (RAG) enabled";
      } else {
        ragIndicatorEl.classList.add("disabled");
        if (!status.rag.indexEnabled) {
          ragIndicatorEl.title = "Embeddings indexing disabled";
        } else {
          ragIndicatorEl.title = "Embeddings search disabled in chat";
        }
      }
    } catch (e) {
      console.error("Failed to update chat status:", e);
      ragIndicatorEl.classList.add("disabled");
    }
  }

  function setRagSearching() {
    if (lastRagEnabled) {
      ragIndicatorEl.classList.remove("enabled", "disabled");
      ragIndicatorEl.classList.add("searching");
      ragIndicatorEl.title = "Searching embeddings...";
    }
  }

  function generateChatId() {
    return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  let autocompleteVisible = false;
  let autocompleteItems = [];
  let selectedIndex = -1;
  let triggerStartPos = -1;

  async function queryPages(searchTerm) {
    try {
      const currentPage = await syscall("editor.getCurrentPage");
      if (!currentPage) {
        return [];
      }
      const completeEvent = {
        pageName: currentPage,
        linePrefix: "[[" + searchTerm,
        pos: searchTerm.length + 2,
      };
      const results = await syscall(
        "event.dispatch",
        "editor:complete",
        completeEvent,
      );

      const allOptions = [];
      for (const result of results) {
        if (result && result.options) {
          allOptions.push(...result.options);
        }
      }

      const searchLower = searchTerm.toLowerCase();
      const seen = new Set();
      return allOptions
        .filter((opt) => {
          if (seen.has(opt.label)) return false;
          seen.add(opt.label);
          if (searchTerm) {
            const label = (opt.label || "").toLowerCase();
            const displayLabel = (opt.displayLabel || "").toLowerCase();
            if (!label.includes(searchLower) && !displayLabel.includes(searchLower)) {
              return false;
            }
          }
          return true;
        })
        .sort((a, b) => (b.boost || 0) - (a.boost || 0))
        .slice(0, 15);
    } catch (e) {
      console.error("Failed to query pages:", e);
      return [];
    }
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  async function renderMarkdownToElement(content, element) {
    const html = await syscall("markdown.markdownToHtml", content);
    const finalHtml = await syscall(
      "system.invokeFunction",
      "silverbullet-ai.postProcessToolCallHtml",
      html,
    );
    // DOMPurify may not be loaded yet if script runs before CDN loads
    if (typeof DOMPurify !== "undefined") {
      element.innerHTML = DOMPurify.sanitize(finalHtml, {
        ADD_TAGS: ["details", "summary"],
        ADD_ATTR: ["open"],
      });
    } else {
      // Fallback: content is from our own backend, reasonably safe
      element.innerHTML = finalHtml;
    }
  }

  function showAutocomplete(items) {
    const dropdown = document.getElementById("autocomplete-dropdown");
    autocompleteItems = items;
    selectedIndex = items.length > 0 ? 0 : -1;

    if (items.length === 0) {
      hideAutocomplete();
      return;
    }

    dropdown.innerHTML = items
      .map((item, i) => {
        const label = escapeHtml(item.displayLabel || item.label);
        const detail = item.detail ? `<span class="detail">${escapeHtml(item.detail)}</span>` : "";
        const cssClass = item.cssClass || "";
        return `<div class="autocomplete-item ${i === 0 ? "selected" : ""} ${cssClass}" data-index="${i}">
          <span class="page-name">${label}</span>${detail}
        </div>`;
      })
      .join("");

    dropdown.classList.remove("hidden");
    autocompleteVisible = true;
  }

  function hideAutocomplete() {
    document.getElementById("autocomplete-dropdown").classList.add("hidden");
    autocompleteVisible = false;
    autocompleteItems = [];
    selectedIndex = -1;
    triggerStartPos = -1;
  }

  function selectAutocompleteItem(index) {
    if (index < 0 || index >= autocompleteItems.length) return;

    const item = autocompleteItems[index];
    const text = userInput.value;
    const cursorPos = userInput.selectionStart;

    const before = text.slice(0, triggerStartPos);
    const after = text.slice(cursorPos);

    const insertText = item.apply || item.label;
    const newText = before + "[[" + insertText + "]]" + after;
    const newCursorPos = triggerStartPos + insertText.length + 4;

    userInput.value = newText;
    userInput.setSelectionRange(newCursorPos, newCursorPos);

    hideAutocomplete();
    userInput.focus();
  }

  function updateSelection(newIndex) {
    if (newIndex < 0) newIndex = autocompleteItems.length - 1;
    if (newIndex >= autocompleteItems.length) newIndex = 0;

    const items = document.querySelectorAll(".autocomplete-item");
    items.forEach((item, i) => {
      item.classList.toggle("selected", i === newIndex);
    });
    selectedIndex = newIndex;
    items[newIndex]?.scrollIntoView({ block: "nearest" });
  }

  async function loadHistory() {
    try {
      const stored = await syscall("clientStore.get", CHAT_HISTORY_KEY);
      if (stored && stored.messages) {
        chatData = stored;
        chatHistory = chatData.messages;
        await renderAllMessages();
      } else {
        chatData = { id: generateChatId(), messages: [] };
      }
      await updateChatStatus();
    } catch (e) {
      console.error("Failed to load chat history:", e);
    }
  }

  async function saveHistory() {
    try {
      chatData.messages = chatHistory;
      await syscall("clientStore.set", CHAT_HISTORY_KEY, chatData);
    } catch (e) {
      console.error("Failed to save chat history:", e);
    }
  }

  async function renderMessage(role, content, streaming = false) {
    const msgEl = document.createElement("div");
    msgEl.className = "message " + role + (streaming ? " streaming" : "");

    if (role === "assistant" && !streaming && content) {
      try {
        await renderMarkdownToElement(content, msgEl);
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

  function renderEmbeddingsContext(context) {
    if (!context || !context.pages || context.pages.length === 0) {
      return null;
    }

    const detailsEl = document.createElement("details");
    detailsEl.className = "tool-call rag-context success";

    const summaryEl = document.createElement("summary");
    summaryEl.innerHTML =
      `<span class="rag-icon">🔍</span> <span class="status">RAG</span> read_notes → ${context.pages.length} page${
        context.pages.length > 1 ? "s" : ""
      }`;
    detailsEl.appendChild(summaryEl);

    const contentEl = document.createElement("div");
    contentEl.className = "context-details";

    for (const page of context.pages) {
      const itemEl = document.createElement("div");
      itemEl.className = "context-item";

      const linkEl = document.createElement("a");
      linkEl.href = encodeURIComponent(page.name);
      linkEl.textContent = page.name;
      itemEl.appendChild(linkEl);

      const simEl = document.createElement("span");
      simEl.className = "similarity";
      simEl.textContent = `${page.similarity}%`;
      itemEl.appendChild(simEl);

      if (page.excerpt) {
        const excerptEl = document.createElement("blockquote");
        excerptEl.textContent = page.excerpt;
        itemEl.appendChild(excerptEl);
      }

      contentEl.appendChild(itemEl);
    }

    detailsEl.appendChild(contentEl);
    return detailsEl;
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
          try {
            await renderMarkdownToElement(fullResponse, messageEl);
          } catch (e) {
            console.error("Failed to render markdown:", e);
          }
          chatHistory.push({ role: "assistant", content: fullResponse });
          await saveHistory();
          await updateChatStatus();
          break;
        } else if (result.status === "error") {
          isStreaming = false;
          messageEl.classList.remove("streaming");
          messageEl.textContent += "\n\n[Error: " +
            (result.error || "Unknown error") + "]";
          await updateChatStatus();
          break;
        }

        // TODO: Add a config option for this, it might be kind of aggressive since we're polling and not really streaming
        await new Promise((r) => setTimeout(r, 50));
      } catch (e) {
        console.error("Polling error:", e);
        isStreaming = false;
        messageEl.classList.remove("streaming");
        messageEl.textContent += "\n\n[Error: " + e.message + "]";
        await updateChatStatus();
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
    setRagSearching();

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

        if (result.embeddingsContext) {
          const contextEl = renderEmbeddingsContext(result.embeddingsContext);
          if (contextEl) {
            messagesContainer.insertBefore(contextEl, assistantEl);
          }
        }

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
    chatData = { id: generateChatId(), messages: [] };
    chatHistory = [];
    await saveHistory();
    await renderAllMessages();
    try {
      await syscall(
        "system.invokeFunction",
        "silverbullet-ai.resetSessionTokenUsage",
      );
    } catch (e) {
      console.error("Failed to reset token usage:", e);
    }
    await updateChatStatus();
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

  function updateAgentIndicator(agent) {
    if (agent && agent.aiagent) {
      agentNameEl.textContent = agent.aiagent.name ||
        agent.ref.split("/").pop() || agent.ref;
      agentIndicator.classList.remove("hidden");
    } else {
      agentIndicator.classList.add("hidden");
    }
  }

  async function loadCurrentAgent() {
    try {
      const agent = await syscall(
        "system.invokeFunction",
        "silverbullet-ai.chatAgentState",
        "get",
      );
      updateAgentIndicator(agent);
    } catch (e) {
      console.error("Failed to load current agent:", e);
    }
  }

  async function clearAgent() {
    try {
      await syscall(
        "system.invokeFunction",
        "silverbullet-ai.chatAgentState",
        "clear",
      );
      updateAgentIndicator(null);
    } catch (e) {
      console.error("Failed to clear agent:", e);
    }
  }

  userInput.addEventListener("input", async function () {
    this.style.height = "auto";
    this.style.height = Math.min(this.scrollHeight, 120) + "px";

    const text = this.value;
    const cursorPos = this.selectionStart;
    const textBeforeCursor = text.slice(0, cursorPos);

    // Check for [[ pattern first (wiki-link style)
    const bracketMatch = textBeforeCursor.match(/\[\[([\w\-/\s]*)$/);
    // and also @filename
    const atMatch = textBeforeCursor.match(/(?:^|[^\w])@([\w\-/]*)$/);

    if (bracketMatch) {
      triggerStartPos = cursorPos - bracketMatch[1].length - 2; // -2 for [[
      const pages = await queryPages(bracketMatch[1]);
      showAutocomplete(pages);
    } else if (atMatch) {
      triggerStartPos = cursorPos - atMatch[1].length - 1; // -1 for @
      const pages = await queryPages(atMatch[1]);
      showAutocomplete(pages);
    } else {
      hideAutocomplete();
    }
  });

  userInput.addEventListener("keydown", function (e) {
    if (autocompleteVisible) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        updateSelection(selectedIndex + 1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        updateSelection(selectedIndex - 1);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        selectAutocompleteItem(selectedIndex);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        hideAutocomplete();
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        selectAutocompleteItem(selectedIndex);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener("click", sendMessage);
  newChatBtn.addEventListener("click", newChat);
  exportBtn.addEventListener("click", exportChat);
  closeBtn.addEventListener("click", closePanel);
  clearAgentBtn.addEventListener("click", clearAgent);

  document
    .getElementById("autocomplete-dropdown")
    .addEventListener("click", function (e) {
      const item = e.target.closest(".autocomplete-item");
      if (item) {
        selectAutocompleteItem(parseInt(item.dataset.index));
      }
    });

  userInput.addEventListener("blur", function () {
    setTimeout(hideAutocomplete, 150);
  });

  // Handle toggle shortcut (Ctrl/Cmd+Shift+A) when panel has focus
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "a") {
      e.preventDefault();
      closePanel();
    }
  });

  // Handle link clicks - navigate internal links using SilverBullet
  messagesContainer.addEventListener("click", function (e) {
    const link = e.target.closest("a");
    if (!link) return;

    const href = link.getAttribute("href");
    if (!href) return;

    // External links - let browser handle normally
    if (href.startsWith("http://") || href.startsWith("https://")) {
      return;
    }

    // Internal page links - use editor.navigate
    e.preventDefault();
    const pageName = decodeURIComponent(href);
    syscall("editor.navigate", pageName);
  });

  loadHistory();
  loadCurrentAgent();
  userInput.focus();
})();
