# SilverBullet AI Plug

This plug integrates various LLMs (Large Language Models) into [SilverBullet](https://silverbullet.md/), the markdown-based note taking tool, allowing users to perform various AI-related tasks directly within their notes. It requires SilverBullet to work, and also access to either a self-hosted or SaaS LLM such as Ollama, OpenAI (ChatGPT), Google Gemini, etc.

silverbullet-ai is very new and is still in early development.  It may not work as expected.  Please report any issues you encounter, or feature ideas.

If you are new here, start with either the `AI: Chat on current page` command or the custom templated prompts!

**Warning**: Please backup your notes before using this plug.  It inserts and replaces text at certain points and isn't well-tested yet, so back up your data!

## Features

- **Summarize Note**: Summarizes the content of a note or selected text.
- **Replace with Summary**: Replaces the selected text with its summary.
- **Insert Summary**: Inserts a summary of the selected text or note at the cursor position.
- **Call OpenAI with Note Context**: Sends the note or selected text to OpenAI based on a user-defined prompt.
- **Generate Tags for Note**: Generates tags for the current note using AI.
- **Generate and Insert Image using Dall-E**: Generates an image based on a prompt and inserts it into the note.

### Available commands

The list below are the commands available in this plugin.

<!-- start-commands-and-functions -->
<!-- end-commands-and-functions -->

## Supported Providers

Below is a list of providers currently supported.  Please note that several providers use a similar API.  For example, if you don’t see a provider on here, but know it offers an OpenAI compatible API, you can try using `provider: openai` and setting an appropriate `baseUrl`.

Please consider contributing any providers you have tested as working, along with an example configuration.

TODO: fix links, maybe turn into table with tested status/etc

Text models:
```template
{{#each {provider where textProvider}}}
- [[{{name}}|{{replace(name, "Providers/", "")}}]]
{{/each}}
```

Image models:
```template
{{#each {provider where imageProvider}}}
- [[{{name}}|{{replace(name, "Providers/", "")}}]]
{{/each}}
```

## Installation

```template
{{[[Installation]]}}
```