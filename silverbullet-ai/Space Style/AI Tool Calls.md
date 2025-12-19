Styles for AI tool call widgets displayed in the chat panel and on pages.

```space-style
/* priority: 50 */

.tool-call {
  margin: 8px 0;
  border: 1px solid var(--border, #ddd);
  border-radius: 6px;
  font-size: 13px;
  background: var(--bg, #fff);
}

.tool-call summary {
  padding: 8px 12px;
  cursor: pointer;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 6px;
  list-style: none;
}

.tool-call summary::-webkit-details-marker {
  display: none;
}

.tool-call summary::before {
  content: "▶";
  display: inline-block;
  margin-right: 6px;
  font-size: 10px;
  transition: transform 0.2s;
}

.tool-call[open] summary::before {
  transform: rotate(90deg);
}

.tool-call[open] summary {
  border-bottom: 1px solid var(--border, #ddd);
  border-radius: 6px 6px 0 0;
}

.tool-call summary:hover {
  background: rgba(0, 0, 0, 0.08);
}

.tool-call .status {
  font-weight: bold;
}

.tool-call.success .status {
  color: #22c55e;
}

.tool-call.error .status {
  color: #ef4444;
}

.tool-call .tool-details {
  padding: 8px 12px;
  background: var(--bg, #fff);
  border-radius: 0 0 6px 6px;
}

.tool-call .tool-args,
.tool-call .tool-result {
  margin-bottom: 8px;
}

.tool-call .tool-result:last-child {
  margin-bottom: 0;
}

.tool-call .tool-details pre {
  margin: 4px 0 0 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  color: var(--text, #333);
  background: rgba(0, 0, 0, 0.05);
  padding: 6px 8px;
  border-radius: 4px;
}

/* Dark theme overrides */
[data-theme="dark"] .tool-call {
  border-color: var(--border, #444);
  background: var(--bg, #1e1e1e);
}

[data-theme="dark"] .tool-call summary {
  background: rgba(255, 255, 255, 0.05);
}

[data-theme="dark"] .tool-call summary:hover {
  background: rgba(255, 255, 255, 0.08);
}

[data-theme="dark"] .tool-call .tool-details {
  background: var(--bg, #1e1e1e);
}

[data-theme="dark"] .tool-call .tool-details pre {
  color: var(--text, #d4d4d4);
  background: rgba(255, 255, 255, 0.05);
}
```
