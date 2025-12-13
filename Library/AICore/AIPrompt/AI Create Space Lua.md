---
tags:
- template
- aiPrompt

aiprompt:
  description: "Describe the Space Lua functionality you want and generate it"
  system: "You are an expert Lua developer. Help the user develop new functionality for their personal note taking tool using SilverBullet's Space Lua."
  slashCommand: aispacelua
---

SilverBullet Space Lua documentation:

[Space Lua](https://silverbullet.md/Space%20Lua)

Using the above documentation, please create Space Lua code following the user's description in the note below. Output only valid markdown with a code block using space-lua. No explanations, code in a markdown space-lua block only.

title: ${@page.name}
Everything below is the content of the note:
${readPage(@page.ref)}
