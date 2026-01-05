# SilverBullet AI Plug

This plug integrates various LLMs (Large Language Models) into [SilverBullet](https://silverbullet.md/), the markdown-based note taking tool, allowing users to perform various AI-related tasks directly within their notes. It requires SilverBullet to work, and also access to either a self-hosted or SaaS LLM such as Ollama, OpenAI (ChatGPT), Google Gemini, etc.

silverbullet-ai is very new and is still in early development.  It may not work as expected.  Please report any issues you encounter, or feature ideas.

If you are new here, start with either the `AI: Chat on current page` command or the custom templated prompts!

**Warning**: Please backup your notes before using this plug.  It inserts and replaces text at certain points and isn't well-tested yet, so back up your data!

## Features

<!-- start-features -->
- **Interactive Chat**: Multi-turn conversations using the current note as the chat interface
- **AI Assistant Panel**: Right-side chat panel for persistent conversations across pages
- **RAG (Retrieval Augmented Generation)**: Automatic vector embedding search for relevant context
- **Context Enrichment**: Wiki-link parsing, template expansion, and custom enrichment functions
- **AI Agents**: Create specialized AI personas with custom system prompts, tool filtering, and page or Lua-based definitions
- **AI Tools**: Built-in tools (read, create, update notes; search, navigate; execute Lua) with custom tool support and approval gates
- **Templated Prompts**: Define custom prompts as pages or in Space Lua with multiple insertion modes
- **Vector Embeddings**: Chunk-based embeddings stored in SilverBullet's datastore for semantic search
- **Note Summaries**: *Experimental* - Generate and index page summaries
- **Image Generation**: DALL-E integration with auto-upload and caption insertion
- **Bundled Prompts**: Generate tags, suggest page names, generate frontmatter, enhance notes
- **Provider Support**: OpenAI, Google Gemini, Ollama, Mistral AI, Perplexity AI, OpenRouter, any OpenAI-compatible API

<!-- end-features -->

### Available commands

The list below are the commands available in this plugin.

<!-- start-commands-and-functions -->
- **AI: Generate and insert image using DallE**: Prompts the user for a custom prompt to send to DALL·E, then sends the prompt to DALL·E to generate an image.
The resulting image is then uploaded to the space and inserted into the note with a caption.
- **AI: Chat on current page**: Streams a conversation with the LLM, but uses the current page as a sort of chat history.
New responses are always appended to the end of the page.
- **AI: Execute AI Prompt from Custom Template**: Executes an AI prompt template. Supports two modes:
1. Page-based: Pass SlashCompletionOption with templatePage to read template from a page
2. Direct: Pass SpaceLuaPromptOptions with template string directly
- **AI: Select Text Model from Config**: Prompts the user to select a text/llm model from the configured models.
Supports both legacy textModels config and new providers config with dynamic discovery.
- **AI: Select Image Model from Config**: Prompts the user to select an image model from the configured models.
Note: Image models must be configured in the legacy imageModels array.
- **AI: Select Embedding Model from Config**: Prompts the user to select an embedding model from the configured models.
Note: Embedding models must be configured in the legacy embeddingModels array.
- **AI: Refresh Model List**: Refreshes the cached model lists from all configured providers.
- **AI: Select Agent**: Prompts the user to select an AI agent from available agents.
- **AI: Clear Agent**: Clears the currently selected AI agent.
- **AI: Test Embedding Generation**: Function to test generating embeddings.  Just puts the result in the current note, but
isn't too helpful for most cases.
- **AI: Search**: Ask the user for a search query, run the search, and navigate to the results page.
Search results are provided by calculating the cosine similarity between the
query embedding and each indexed embedding.
- **AI: Reindex All Embeddings**: Reindex all embeddings for all indexable pages in the space.
Shows progress notifications during the operation.
Doesn't use the queue
- **AI: Connectivity Test**: Command to run connectivity tests and navigate to the results page.
- **AI: Run Benchmark**: Runs the AI benchmark suite and navigates to the results page.
- **AI: Open Assistant**: Opens the AI Assistant panel (side panel)
- **AI: Open Assistant (Full Screen)**: Opens the AI Assistant as a full-screen modal (better for mobile)
- **AI: Toggle Assistant Panel**: Toggles the AI Assistant panel

<!-- end-commands-and-functions -->

## Usage

After installing the plug, you can access its features through the command palette. Configuration is done using Space Lua in your `CONFIG` page (or any page with a `space-lua` block).

### Configuration

SilverBullet v2 uses Space Lua for configuration. Add a `space-lua` block to your `CONFIG` page:

```lua
local openai_key = "sk-your-openai-key-here"

config.set {
  ai = {
    providers = {
      openai = {
        apiKey = openai_key,
        preferredModels = {"gpt-4o", "gpt-4o-mini"}
      },
      ollama = {
        baseUrl = "http://localhost:11434/v1",
        useProxy = false,
        preferredModels = {"llama3.2", "qwen2.5-coder"}
      }
    },

    -- Optional: auto-select a default model on startup
    defaultTextModel = "ollama:llama3.2",

    -- Chat settings (optional)
    chat = {
      userInformation = "I'm a software developer who likes taking notes.",
      userInstructions = "Please give short and concise responses."
    }
  }
}
```

With this configuration:

- **"AI: Select Text Model"** shows all available models from each provider
- **"AI: Refresh Model List"** updates the cached model lists
- `preferredModels` appear first in the picker (marked with ★)

#### Provider Options

| Option | Description |
|--------|-------------|
| `apiKey` | API key for the provider |
| `baseUrl` | Custom API endpoint |
| `useProxy` | Use SilverBullet's proxy (default: true, set false for local services) |
| `preferredModels` | Models shown first in picker |
| `fetchModels` | Fetch models from API (default: true). Set false if API doesn't support it |
| `provider` | Explicit provider type when key name doesn't match (e.g., `provider = "openai"` for OpenRouter) |

#### Ollama

```lua
config.set {
  ai = {
    providers = {
      ollama = {
        baseUrl = "http://localhost:11434/v1",
        useProxy = false,
        preferredModels = {"llama3.2", "qwen2.5-coder"}
      }
    },
    defaultTextModel = "ollama:llama3.2"
  }
}
```

#### Google Gemini

```lua
config.set {
  ai = {
    providers = {
      gemini = {
        apiKey = "your-google-ai-studio-key",
        preferredModels = {"gemini-2.0-flash", "gemini-1.5-pro"}
      }
    }
  }
}
```

Get your API key from [Google AI Studio](https://aistudio.google.com/app/apikey).

#### OpenRouter

[OpenRouter](https://openrouter.ai/) provides access to many models via one API:

```lua
config.set {
  ai = {
    providers = {
      openrouter = {
        provider = "openai",  -- OpenRouter uses OpenAI-compatible API
        apiKey = "your-openrouter-key",
        baseUrl = "https://openrouter.ai/api/v1",
        preferredModels = {"anthropic/claude-3.5-sonnet", "openai/gpt-4o"}
      }
    }
  }
}
```

#### Multiple Provider Instances

You can configure multiple instances of the same provider type:

```lua
config.set {
  ai = {
    providers = {
      ollamaLocal = {
        provider = "ollama",
        baseUrl = "http://localhost:11434/v1",
        useProxy = false
      },
      ollamaServer = {
        provider = "ollama",
        baseUrl = "http://my-server:11434/v1",
        useProxy = true
      }
    }
  }
}
```

#### Image Generation (DALL-E)

Image models use a separate configuration:

```lua
config.set {
  ai = {
    keys = {
      OPENAI_API_KEY = "your-openai-key"
    },
    imageModels = {
      {name = "dall-e-3", modelName = "dall-e-3", provider = "dalle"}
    }
  }
}
```

#### Chat Custom Instructions

The system prompt includes optional user information and instructions:

```lua
config.set {
  ai = {
    chat = {
      userInformation = "I'm a software developer who likes taking notes.",
      userInstructions = "Please give short and concise responses."
    }
  }
}
```

### Templated Prompts

You can use template notes to create custom prompts. Template notes must have:

- `tags` including `meta/template/aiPrompt`
- `aiprompt` object with a `description` key
- Optionally, `aiprompt.systemPrompt` to override the system prompt

Example template to summarize the current note:

``` markdown
---
tags: meta/template/aiPrompt

aiprompt:
  description: "Generate a summary of the current page."
---

Generate a short and concise summary of the note below.

title: ${@page.name}
Everything below is the content of the note:
${readPage(@page.ref)}
```

Run `AI: Execute AI Prompt from Custom Template` to use your templates.

## Build

To build this plug, make sure you have [SilverBullet installed](https://silverbullet.md/Install). Then:

```shell
deno task build
```

Or to watch for changes:

```shell
deno task watch
```

Copy the resulting `.plug.js` file into your space's `_plug` folder:

```shell
deno task build && cp *.plug.js /my/space/_plug/
```

## Installation

### Library Manager (Recommended)

Requires SilverBullet v2.3.0+

1. Run `Library: Install` command
2. Enter one of the following:

**Latest release:**
```
ghr:justyns/silverbullet-ai/PLUG.md
```

**Specific release:**
```
ghr:justyns/silverbullet-ai@0.6.2/PLUG.md
```

See [GitHub Releases](https://github.com/justyns/silverbullet-ai/releases) for available versions.

**Upgrading?** If you have an old version in `_plug/`, delete it before reinstalling via Library Manager.

See the [documentation](https://ai.silverbullet.md/) for full configuration details.
