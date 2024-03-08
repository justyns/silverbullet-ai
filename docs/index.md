# SilverBullet AI Plug

_SilverBullet AI_ is a plug that integrates various LLMs (Large Language Models) into [_SilverBullet_](https://silverbullet.md/), the markdown-based note taking tool, allowing users to perform various AI-related tasks directly within their notes. It requires SilverBullet to work, and also access to either a self-hosted or SaaS LLM such as Ollama, OpenAI (ChatGPT), Google Gemini, etc.

silverbullet-ai is very new and is still in early development.  It may not work as expected.  Please report any issues you encounter, or feature ideas.  You can do so through [Github Issues](https://github.com/justyns/silverbullet-ai/issues).

If you are new here, start with either the [[Commands/AI: Chat on current page]] command or the custom templated prompts!

**Warning**: Please backup your notes before using this plug.  It inserts and replaces text at certain points and isn't well-tested yet, so back up your data!

## Features

```template
{{[[Features]]}}
```

### Available commands

The list below are the commands available in this plugin.

```query
commands select name, commandName, commandSummary render [[template/Command]]
```


