(function () {
  const toolNameEl = document.getElementById("tool-name");
  const argsListEl = document.getElementById("args-list");
  const diffSectionEl = document.getElementById("diff-section");
  const diffViewEl = document.getElementById("diff-view");
  const approveBtn = document.getElementById("approve-btn");
  const rejectBtn = document.getElementById("reject-btn");
  const feedbackInput = document.getElementById("feedback-input");

  let approvalId = null;
  let responded = false;
  let hasDiffSupport = false;
  let isWriteApproval = false;

  const MAX_VALUE_LENGTH = 500;

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function truncateValue(value, maxLength = MAX_VALUE_LENGTH) {
    const str = typeof value === "string" ? value : JSON.stringify(value);
    if (str.length <= maxLength) return { text: str, truncated: false };
    return { text: str.substring(0, maxLength), truncated: true };
  }

  function renderArgs(args) {
    argsListEl.innerHTML = "";

    if (!args || Object.keys(args).length === 0) {
      argsListEl.innerHTML =
        '<div class="arg-item"><span class="arg-value" style="color: var(--subtle);">No arguments</span></div>';
      return;
    }

    for (const [key, value] of Object.entries(args)) {
      const item = document.createElement("div");
      item.className = "arg-item";

      const nameSpan = document.createElement("span");
      nameSpan.className = "arg-name";
      nameSpan.textContent = key + ":";

      const valueSpan = document.createElement("span");
      valueSpan.className = "arg-value";

      const { text, truncated } = truncateValue(value);
      valueSpan.textContent = text;
      if (truncated) {
        valueSpan.classList.add("truncated");
      }

      item.appendChild(nameSpan);
      item.appendChild(valueSpan);
      argsListEl.appendChild(item);
    }
  }

  function renderDiff(diffLines) {
    diffViewEl.innerHTML = "";

    if (!diffLines || diffLines.length === 0) {
      diffViewEl.innerHTML =
        '<div class="diff-empty">No changes to preview</div>';
      return;
    }

    for (const line of diffLines) {
      const lineEl = document.createElement("div");
      lineEl.className = "diff-line " + line.type;

      const prefix = line.type === "add"
        ? "+ "
        : line.type === "remove"
        ? "- "
        : "  ";
      lineEl.textContent = prefix + line.line;

      diffViewEl.appendChild(lineEl);
    }
  }

  async function loadDiff() {
    if (!hasDiffSupport) {
      return;
    }

    diffSectionEl.style.display = "block";

    if (window.innerWidth > 600) {
      diffSectionEl.setAttribute("open", "");
    }

    // Use appropriate diff function based on approval type
    const diffFunction = isWriteApproval
      ? "silverbullet-ai.getWriteDiff"
      : "silverbullet-ai.getToolDiff";

    try {
      const result = await syscall(
        "system.invokeFunction",
        diffFunction,
        approvalId,
      );

      if (result && result.diff) {
        renderDiff(result.diff);
      } else if (result && result.error) {
        diffViewEl.innerHTML = '<div class="diff-empty">' +
          escapeHtml(result.error) + "</div>";
      } else {
        diffViewEl.innerHTML =
          '<div class="diff-empty">No diff available</div>';
      }
    } catch (e) {
      console.error("Failed to load diff:", e);
      diffViewEl.innerHTML =
        '<div class="diff-empty">Failed to load diff</div>';
    }
  }

  async function submitResponse(approved) {
    if (responded) return;
    responded = true;

    const feedback = approved ? null : (feedbackInput.value.trim() || null);

    // Use appropriate submit function based on approval type
    const submitFunction = isWriteApproval
      ? "silverbullet-ai.submitWriteApproval"
      : "silverbullet-ai.submitToolApproval";

    try {
      await syscall(
        "system.invokeFunction",
        submitFunction,
        approvalId,
        approved,
        feedback,
      );
    } catch (e) {
      console.error("Failed to submit approval:", e);
    }
  }

  function init(data) {
    approvalId = data.approvalId;
    hasDiffSupport = data.hasDiffSupport || false;
    isWriteApproval = data.isWriteApproval || false;
    toolNameEl.textContent = data.toolName;
    renderArgs(data.args);
    loadDiff();
  }

  approveBtn.addEventListener("click", () => submitResponse(true));
  rejectBtn.addEventListener("click", () => submitResponse(false));

  document.addEventListener("keydown", (e) => {
    // Don't capture shortcuts when typing in textarea
    if (document.activeElement === feedbackInput) {
      if (e.key === "Escape") {
        feedbackInput.blur();
      }
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitResponse(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      submitResponse(false);
    }
  });

  if (window.toolApprovalData) {
    init(window.toolApprovalData);
  }
})();
