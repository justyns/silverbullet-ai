---
tags: sidebar
navOrder: 10
---

# AI Core Library

Silverbullet offers the ability to share templates, snippets, etc as [Libraries](https://silverbullet.md/Libraries) that can be imported. The AICore library is meant to provide helpful utilities around using the silverbullet-ai plug.

# Installation

Use the Library Manager to install the AICore library:

1. Run the `Library: Install` command
2. Enter the URI: `ghr:justyns/silverbullet-ai/Library/AICore.md`

Alternatively, install via the `Library: Manager` command and search for "AICore" in the available libraries.


The included templates, prompts, and Space Lua scripts are briefly described below. Please consider [contributing](https://github.com/justyns/silverbullet-ai) any templates or prompts you find useful.

# Included templates and prompts

${template.each(query[[
  from index.tag "template"
  where string.find(name, "Library/AICore") == 1
]], template.new[==[* [[${name}]]: ${description or ""}]==])}

# Included Space Lua

${template.each(query[[
  from index.tag "page"
  where string.find(name, "Library/AICore/Space Lua") == 1
]], template.new[==[* [[${name}]]: ${description or ""}]==])}

