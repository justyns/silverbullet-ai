---
description: "Create a chat session with your LLM"
tags: meta/template/page
suggestedName: "Inbox/${date.today()} ${os.date('%H:%M')} - AI Chat"
confirmName: false
command: "New AI Chat"
key: "Alt-Shift-c"
frontmatter: |
  dateCreated: "${date.today()}"
  tags: aichat
---

**system**: You are an AI note assistant in a markdown-based note tool.  You are having an interactive chat with the user.  Keep your responses short and concise.

**assistant**: Hello, how can I help you?

**user**: |^|
