#meta

Adds a button to send the current page to an interactive AI chat session.
Displays on pages with "AI Chat" in the name or tagged with `aichat`.

```space-lua
event.listen {
  name = "hooks:renderBottomWidgets",
  run = function(e)
    local pageName = editor.getCurrentPage()
    local pageText = editor.getText()
    local fm = index.extractFrontmatter(pageText)
    local tags = fm.frontmatter.tags or {}

    -- Check if page name contains "AI Chat" or has aichat tag
    local hasAIChatInName = string.find(pageName, "AI Chat")
    local hasAIChatTag = false
    for _, tag in ipairs(tags) do
      if tag == "aichat" then
        hasAIChatTag = true
        break
      end
    end

    if hasAIChatInName or hasAIChatTag then
      return widgets.commandButton("Send to AI", "AI: Chat on current page")
    end
  end
}
```