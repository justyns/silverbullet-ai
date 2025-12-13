---
description: >
  Adds a button to send the current page to an interactive AI chat session.
tags: template
hooks.bottom.where: '(name =~ /.*AI Chat.*/ or tags = "aichat") and tags!="template"'
---

{[AI: Chat on current page|Send to AI]}