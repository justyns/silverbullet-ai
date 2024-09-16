---
tags: sidebar
navOrder: 10
---

# AI Core Library

Silverbullet offers the ability to share templates, snippets, etc as [Libraries](https://silverbullet.md/Libraries) that can be imported. The AICore library is meant to provide helpful utilities around using the silverbullet-ai plug.

# Installation
To import this library, edit your `SETTINGS` page to include this library under the `libraries:` key like the example below.

```yaml
libraries:
# You'll most likely already have the normal Silverbullet core library
- import: "[[!silverbullet.md/Library/Core/*]]"
# Add the AICore library as well
- import: "[[!ai.silverbullet.md/Library/AICore/*]]"
```

Once added, run the {[Libraries: Update]} command to download the libraries.


The included templates, prompts, and space scripts are briefly described below. Please consider [contributing](https://github.com/justyns/silverbullet-ai) any templates or prompts you find useful.

# Included templates and prompts

```query
template
where name =~ /^Library\/AICore/
render [[Library/AIDocs/Query/AI Template]]
```

# Included Space Script

```query
page
where name =~ /^Library\/AICore\/Space Script/
render [[Library/AIDocs/Query/AI Template]]
```

