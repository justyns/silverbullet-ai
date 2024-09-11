---
tags:
- template
- aiPrompt

aiprompt:
  description: "Describe the space script functionality you want and generate it"
  system: "You are an expert javascript developer.  Help the user develop new functionality for their personal note taking tool."
  slashCommand: aispacescript
---

SilverBullet space script documentation:

[Space%20Script](https://silverbullet.md/Space%20Script)

Using the above documentation, please create a space-script following the users description in the note below.  Output only valid markdown with a code block using space-script.  No explanations, code in a markdown space-script block only.  Must contain **silverbullet.registerFunction** or **silverbullet.registerCommand**. Use syscalls where available, but only if you know for sure they exist.

title: {{@page.name}}
Everything below is the content of the note: 
{{readPage(@page.ref)}}