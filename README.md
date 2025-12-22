# SilverBullet AI Plug

This plug integrates various LLMs (Large Language Models) into [SilverBullet](https://silverbullet.md/), the markdown-based note taking tool, allowing users to perform various AI-related tasks directly within their notes. It requires SilverBullet to work, and also access to either a self-hosted or SaaS LLM such as Ollama, OpenAI (ChatGPT), Google Gemini, etc.

silverbullet-ai is very new and is still in early development.  It may not work as expected.  Please report any issues you encounter, or feature ideas.

If you are new here, start with either the `AI: Chat on current page` command or the custom templated prompts!

**Warning**: Please backup your notes before using this plug.  It inserts and replaces text at certain points and isn't well-tested yet, so back up your data!

## Features

<!-- start-features -->
## Chat & Conversation

- **Interactive Chat**: Multi-turn conversations using the current note as the chat interface
- **AI Assistant Panel**: Right-side chat panel for persistent conversations across pages
- **RAG (Retrieval Augmented Generation)**: Automatic vector embedding search for relevant context
- **Context Enrichment**: Wiki-link parsing, template expansion, and custom enrichment functions

## AI Agents

- **Custom Agents**: Create specialized AI personas with custom system prompts
- **Tool Filtering**: Restrict which tools agents can access
- **Page-Based Agents**: Define agents as pages with embedded context via wiki-links
- **Lua-Defined Agents**: Define agents directly in Space Lua

## AI Tools

- **Built-in Tools**: Read, create, update notes; search, navigate; execute Lua
- **Custom Tools**: Define your own tools in Space Lua
- **Approval Gates**: Require user confirmation before tools execute
- **Diff Previews**: See proposed changes before writing to pages

## Templated Prompts

- **Custom Templates**: Define AI prompts as pages with `meta/template/aiPrompt` tag
- **Space Lua Prompts**: Define prompts directly in Lua
- **Multiple Insertion Modes**: Insert at cursor, page start/end, replace selection, etc.
- **Post-Processing**: Transform LLM responses with custom functions

## Embeddings & Search

- **Vector Embeddings**: Chunk-based embeddings stored in SilverBullet's datastore
- **Similarity Search**: Semantic search across indexed pages
- **Note Summaries**: *Experimental* - Generate and index page summaries

## Bundled Prompts

Pre-built AI prompt templates that ship with the plug:

- **Generate Tags**: Suggests tags based on note content
- **Suggest Page Name**: Recommends titles for notes
- **Generate FrontMatter**: *Experimental* - Extracts metadata from content
- **Enhance Note**: Runs all three above in sequence

## Image Generation

- **DALL-E Integration**: Generate images from text prompts
- **Auto-Upload**: Generated images are uploaded to your space
- **Caption Insertion**: Images inserted with descriptive captions

## Provider Support

- OpenAI (GPT-4, GPT-3.5, etc.)
- Google Gemini
- Ollama (local)
- Mistral AI
- Perplexity AI
- OpenRouter
- Any OpenAI-compatible API

## Utilities

- **Model Selection**: Switch between configured models on the fly
- **Connectivity Testing**: Verify API endpoints and model access
- **Benchmarking**: Test model performance and capabilities

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
- **AI: Select Image Model from Config**: Prompts the user to select an image model from the configured models.
- **AI: Select Embedding Model from Config**: Prompts the user to select an embedding model from the configured models.
- **AI: Select Agent**: undefined
- **AI: Clear Agent**: undefined
- **AI: Test Embedding Generation**: Function to test generating embeddings.  Just puts the result in the current note, but
isn't too helpful for most cases.
- **AI: Search**: Ask the user for a search query, run the search, and navigate to the results page.
Search results are provided by calculating the cosine similarity between the
query embedding and each indexed embedding.
- **AI: Connectivity Test**: Command to run connectivity tests and navigate to the results page.
- **AI: Run Benchmark**: undefined
- **AI: Open Assistant**: Opens the AI Assistant panel
- **AI: Toggle Assistant Panel**: Toggles the AI Assistant panel

<!-- end-commands-and-functions -->

## Usage

After installing the plug, you can access its features through the command palette. Configuration is done using Space Lua in your `CONFIG` page (or any page with a `space-lua` block).

### Configuration

SilverBullet v2 uses Space Lua for configuration. Add a `space-lua` block to your `CONFIG` page:

```lua
config.set {
  ai = {
    -- API keys
    keys = {
      OPENAI_API_KEY = "your-openai-key-here"
    },

    -- Configure one or more image models
    imageModels = {
      {name = "dall-e-3", modelName = "dall-e-3", provider = "dalle"},
      {name = "dall-e-2", modelName = "dall-e-2", provider = "dalle"}
    },

    -- Configure one or more text models
    -- Provider may be openai, gemini, or ollama.
    textModels = {
      {name = "gpt-4-turbo", provider = "openai", modelName = "gpt-4-turbo"},
      {name = "gpt-3-turbo", provider = "openai", modelName = "gpt-3.5-turbo"},
      {
        name = "ollama-llama3",
        modelName = "llama3",
        provider = "ollama",
        baseUrl = "http://localhost:11434/v1",
        requireAuth = false
      }
    },

    -- Chat section is optional, but may help provide better results
    chat = {
      userInformation = "I'm a software developer who likes taking notes.",
      userInstructions = "Please give short and concise responses. When providing code, do so in python unless requested otherwise."
    }
  }
}
```

#### Ollama

To use Ollama locally, make sure you have it running first and the desired models downloaded:

```lua
config.set {
  ai = {
    textModels = {
      {
        name = "ollama-llama3",
        modelName = "llama3",  -- Run `ollama list` to see available models
        provider = "ollama",
        baseUrl = "http://localhost:11434/v1",
        requireAuth = false,
        useProxy = false  -- Bypass SilverBullet's proxy for local requests
      }
    }
  }
}
```

**requireAuth**: When using Ollama and Chrome, requireAuth needs to be set to false so that the Authorization header isn't set. Otherwise you will get a CORS error.

**useProxy**: Set to false to bypass SilverBullet's proxy and make requests directly to Ollama.

#### Mistral.ai

Mistral.ai is a hosted service that offers an openai-compatible api:

```lua
config.set {
  ai = {
    keys = {
      MISTRAL_API_KEY = "your-mistral-key-here"
    },
    textModels = {
      {
        name = "mistral-medium",
        modelName = "mistral-medium",
        provider = "openai",
        baseUrl = "https://api.mistral.ai/v1",
        secretName = "MISTRAL_API_KEY"
      }
    }
  }
}
```

#### Perplexity.ai

Perplexity.ai is another hosted service that offers an openai-compatible api and [various models](https://docs.perplexity.ai/docs/model-cards):

```lua
config.set {
  ai = {
    keys = {
      PERPLEXITY_API_KEY = "your-perplexity-key-here"
    },
    textModels = {
      {
        name = "sonar-medium-online",
        modelName = "sonar-medium-online",
        provider = "openai",
        baseUrl = "https://api.perplexity.ai",
        secretName = "PERPLEXITY_API_KEY"
      }
    }
  }
}
```

#### Google Gemini

Google Gemini is supported as a text provider:

```lua
config.set {
  ai = {
    keys = {
      GOOGLE_AI_STUDIO_KEY = "your-google-ai-studio-key-here"
    },
    textModels = {
      {
        name = "gemini-2.0-flash",
        modelName = "gemini-2.0-flash",
        provider = "gemini",
        secretName = "GOOGLE_AI_STUDIO_KEY"
      }
    }
  }
}
```

**Note**: Get your API key from [Google AI Studio](https://aistudio.google.com/app/apikey). AI Studio is not the same as the Gemini App (previously Bard).

#### Dall-E

Dall-E can be configured for generating images:

```lua
config.set {
  ai = {
    keys = {
      OPENAI_API_KEY = "your-openai-key-here"
    },
    imageModels = {
      {name = "dall-e-3", modelName = "dall-e-3", provider = "dalle"},
      {name = "dall-e-2", modelName = "dall-e-2", provider = "dalle"}
    }
  }
}
```

#### Chat Custom Instructions

OpenAI introduced [custom instructions for ChatGPT](https://openai.com/blog/custom-instructions-for-chatgpt) to help improve responses. We emulate this by allowing a system prompt to be injected into each new chat session.

The system prompt is rendered similar to the one below:

Always added:
> This is an interactive chat session with a user in a note-taking tool called SilverBullet.

If **userInformation** is set:
> The user has provided the following information about their self: **${ai.chat.userInformation}**

If **userInstructions** is set:
> The user has provided the following instructions for the chat, follow them as closely as possible: **${ai.chat.userInstructions}**


### Templated Prompts

**NOTE:** All built-in prompts will be replaced with templated prompts eventually.

You can use template notes to create your own custom prompts to send to the LLM.

Template notes make use of all of the template language available to SilverBullet.

To be a templated prompt, the note must have the following frontmatter:

- `tags` must include `meta/template/aiPrompt`
- `aiprompt` object must exist and have a `description` key
- Optionally, `aiprompt.systemPrompt` can be specified to override the system prompt

For example, here is a templated prompt to summarize the current note and insert the summary at the cursor:

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

With the above note saved as `AI: Generate note summary`, you can run the `AI: Execute AI Prompt from Custom Template` command from the command palette, select the `AI: Generate note summary` template, and the summary will be streamed to the current cursor position.

Another example prompt is to pull in remote pages and ask the llm to generate Space Lua code for you:

```
---
tags: meta/template/aiPrompt

aiprompt:
  description: "Describe the Space Lua functionality you want and generate it"
  systemPrompt: "You are an expert Lua developer. Help the user develop new functionality for their personal note taking tool."
  slashCommand: aiSpaceLua
---

SilverBullet Space Lua documentation:

${readPage([[!silverbullet.md/Space%20Lua]])}

Using the above documentation, please create Space Lua code following the user's description in the note below. Output only valid markdown with a code block using space-lua. No explanations, code in a markdown space-lua block only.

title: ${@page.name}
Everything below is the content of the note:
${readPage(@page.ref)}
```


## Build
To build this plug, make sure you have [SilverBullet installed](https://silverbullet.md/Install). Then, build the plug with:

```shell
deno task build
```

Or to watch for changes and rebuild automatically

```shell
deno task watch
```

Then, copy the resulting `.plug.js` file into your space's `_plug` folder. Or build and copy in one command:

```shell
deno task build && cp *.plug.js /my/space/_plug/
```

SilverBullet will automatically sync and load the new version of the plug (or speed up this process by running the {[Sync: Now]} command).

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
ghr:justyns/silverbullet-ai@0.5.0/PLUG.md
```

See [GitHub Releases](https://github.com/justyns/silverbullet-ai/releases) for available versions.

**Upgrading?** If you have an old version in `_plug/`, delete it before reinstalling via Library Manager.

See the [documentation](https://ai.silverbullet.md/) for full configuration details.
