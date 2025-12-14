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

If you're new here, we recommend starting with the [[Quick Start]] guide.

> **Warning**: Please back up your notes before using this plug. It inserts and replaces text at certain points. We recommend using the git plug to keep your notes versioned automatically in a git repository.

## Features

{{ include_file("Features") }}

### Available commands

The list below are the commands available in this plugin.

* [[Commands/AI: Chat on current page]]
* [[Commands/AI: Connectivity Test]]
* [[Commands/AI: Enhance Note]]
* [[Commands/AI: Execute AI Prompt from Custom Template]]
* [[Commands/AI: Generate and insert image using DallE]]
* [[Commands/AI: Generate Note FrontMatter]]
* [[Commands/AI: Generate tags for note]]
* [[Commands/AI: Search]]
* [[Commands/AI: Select Embedding Model from Config]]
* [[Commands/AI: Select Image Model from Config]]
* [[Commands/AI: Select Text Model from Config]]
* [[Commands/AI: Suggest Page Name]]
* [[Commands/AI: Test Embedding Generation]]


