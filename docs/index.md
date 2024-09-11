# SilverBullet AI Plug

_SilverBullet AI_ is a plug that integrates various LLMs (Large Language Models) into [_SilverBullet_](https://silverbullet.md/), the markdown-based note-taking tool. This integration allows users to perform a wide range of AI-related tasks directly within their notes.

## What are LLMs?

LLMs, or Large Language Models, are advanced AI systems trained on vast amounts of text data. They can understand and generate human-like text, making them powerful tools for various language-related tasks.

## Requirements

- SilverBullet installation
- Access to either a self-hosted or SaaS LLM such as:
  - Ollama
  - OpenAI (ChatGPT)
  - Google Gemini
  - Others (see [[Providers]])

## Development Status

SilverBullet AI is currently in early development. It may not work as expected. We encourage users to:

- Report any issues encountered
- Share feature ideas

You can do so through our [Github Issues](https://github.com/justyns/silverbullet-ai/issues) page, or the SilverBullet [community discourse](https://community.silverbullet.md/).

## Getting Started

If you're new here, we recommend starting with:

1. [[Quick Start]]
2. [[AI Core Library]]

> **Warning**: Please back up your notes before using this plug. It inserts and replaces text at certain points. We recommend using the git plug to keep your notes versioned automatically in a git repository.

## Features

```template
{{[[Features]]}}
```

### Available commands

The list below are the commands available in this plugin.

```query
commands select name, commandName, commandSummary render [[template/Command]]
```


