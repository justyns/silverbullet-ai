# SilverBullet AI Plug

This plug integrates various LLMs (Large Language Models) into [SilverBullet](https://silverbullet.md/), the markdown-based note taking tool, allowing users to perform various AI-related tasks directly within their notes. It requires SilverBullet to work, and also access to either a self-hosted or SaaS LLM such as Ollama, OpenAI (ChatGPT), Google Gemini, etc.

silverbullet-ai is very new and is still in early development.  It may not work as expected.  Please report any issues you encounter, or feature ideas.

If you are new here, start with either the `AI: Chat on current page` command or the custom templated prompts!

**Warning**: Please backup your notes before using this plug.  It inserts and replaces text at certain points and isn't well-tested yet, so back up your data!

## Features

<!-- start-features -->

- **Summarize Note**: Summarizes the content of a note or selected text.
- **Replace with Summary**: Replaces the selected text with its summary.
- **Insert Summary**: Inserts a summary of the selected text or note at the cursor position.
- **Call OpenAI with Note Context**: Sends the note or selected text to OpenAI based on a user-defined prompt.
- **Interactive Chat**:  Have an interactive chat, utilizing the current note as the chat interface.
  - **RAG (**R**etrieval **A**ugmented Generation)**: Search local vector embeddings of all your notes for relevant context to your current chat query and provide it to the LLM.
- **Templated Prompts**: Define custom notes as a templated prompt that can be rendered, sent to llm, and then inserted into the page.
- **Generate Tags for Note**: Generates tags for the current note using AI.  Custom rules can also be specified to steer towards better tags.
- **Generate and Insert Image using Dall-E**: Generates an image based on a prompt and inserts it into the note.
- **Rename a note based on Note Context**: Sends the note, including enriched data, to the LLM and asks for a new note title.  Custom rules or examples can also be provided to generate better titles.
- **Generate vector embeddings**: Chunks each page, generates vector embeddings of the text, and indexes those embeddings.  No external database required.
- **Similarity search**: Allows doing a similarity search based on indexed embeddings.
- **Note Summary generation and search**: **Experimental** generates a summary of each note, then generates embeddings and indexes that summary to be searched using a similarity/semantic search.
- **FrontMatter generation**: **Experimental** extracts useful information from a note’s context and generates frontmatter attributes for it.
<!-- end-features -->

### Available commands

The list below are the commands available in this plugin.

<!-- start-commands-and-functions -->
- **AI: Generate tags for note**: Asks the LLM to generate tags for the current note.
Generated tags are added to the note's frontmatter.
- **AI: Generate and insert image using DallE**: Prompts the user for a custom prompt to send to DALL·E, then sends the prompt to DALL·E to generate an image.
The resulting image is then uploaded to the space and inserted into the note with a caption.
- **AI: Chat on current page**: Streams a conversation with the LLM, but uses the current page as a sort of chat history.
New responses are always appended to the end of the page.
- **AI: Execute AI Prompt from Custom Template**: Executes an AI prompt template. Supports two modes:
1. Page-based: Pass SlashCompletionOption with templatePage to read template from a page
2. Direct: Pass SpaceLuaPromptOptions with template string directly
- **AI: Suggest Page Name**: Ask the LLM to provide a name for the current note, allow the user to choose from the suggestions, and then rename the page.
- **AI: Generate Note FrontMatter**: Extracts important information from the current note and converts it
to frontmatter attributes.
- **AI: Enhance Note**: Enhances the current note by running the commands to generate tags for a note,
generate new frontmatter attributes, and a new note name.
- **AI: Select Text Model from Config**: Prompts the user to select a text/llm model from the configured models.
- **AI: Select Image Model from Config**: Prompts the user to select an image model from the configured models.
- **AI: Select Embedding Model from Config**: Prompts the user to select an embedding model from the configured models.
- **AI: Test Embedding Generation**: Function to test generating embeddings.  Just puts the result in the current note, but
isn't too helpful for most cases.
- **AI: Search**: Ask the user for a search query, run the search, and navigate to the results page.
Search results are provided by calculating the cosine similarity between the
query embedding and each indexed embedding.
- **AI: Connectivity Test**: Command to run connectivity tests and navigate to the results page.

<!-- end-commands-and-functions -->

## Usage

After installing the plug, you can access its features through the command palette. Configuration is done using Space Lua in your `CONFIG` page (or any page with a `space-lua` block).

### Configuration

SilverBullet v2 uses Space Lua for configuration. Add a `space-lua` block to your `CONFIG` page:

```lua
-- Set your API keys
config.set("OPENAI_API_KEY", "your-openai-key-here")

-- Configure AI models
config.set("ai", {
  -- Configure one or more image models
  imageModels = {
    {name = "dall-e-3", modelName = "dall-e-3", provider = "dalle"},
    {name = "dall-e-2", modelName = "dall-e-2", provider = "dalle"}
  },

  -- Configure one or more text models
  -- Provider may be openai or gemini. Most local or self-hosted LLMs offer an openai compatible api.
  textModels = {
    {name = "gpt-4-turbo", provider = "openai", modelName = "gpt-4-turbo"},
    {name = "gpt-3-turbo", provider = "openai", modelName = "gpt-3.5-turbo"},
    {
      name = "ollama-llama3",
      modelName = "llama3",
      provider = "openai",
      baseUrl = "http://localhost:11434/v1",
      requireAuth = false
    }
  },

  -- Chat section is optional, but may help provide better results
  chat = {
    userInformation = "I'm a software developer who likes taking notes.",
    userInstructions = "Please give short and concise responses. When providing code, do so in python unless requested otherwise."
  }
})
```

#### Ollama

To use Ollama locally, make sure you have it running first and the desired models downloaded:

```lua
config.set("ai", {
  textModels = {
    {
      name = "ollama-llama3",
      modelName = "llama3",  -- Run `ollama list` to see available models
      provider = "openai",
      baseUrl = "http://localhost:11434/v1",
      requireAuth = false
    }
  }
})
```

**requireAuth**: When using Ollama and Chrome, requireAuth needs to be set to false so that the Authorization header isn't set. Otherwise you will get a CORS error.

#### Mistral.ai

Mistral.ai is a hosted service that offers an openai-compatible api:

```lua
config.set("MISTRAL_API_KEY", "your-mistral-key-here")

config.set("ai", {
  textModels = {
    {
      name = "mistral-medium",
      modelName = "mistral-medium",
      provider = "openai",
      baseUrl = "https://api.mistral.ai/v1",
      secretName = "MISTRAL_API_KEY"
    }
  }
})
```

#### Perplexity.ai

Perplexity.ai is another hosted service that offers an openai-compatible api and [various models](https://docs.perplexity.ai/docs/model-cards):

```lua
config.set("OPENAI_API_KEY", "your-perplexity-key-here")

config.set("ai", {
  textModels = {
    {
      name = "sonar-medium-online",
      modelName = "sonar-medium-online",
      provider = "openai",
      baseUrl = "https://api.perplexity.ai"
    }
  }
})
```

#### Google Gemini (Experimental)

Google does not offer an openai-compatible api, so consider the support for Gemini to be experimental:

```lua
config.set("GOOGLE_AI_STUDIO_KEY", "your-google-ai-studio-key-here")

config.set("ai", {
  textModels = {
    {
      name = "gemini-pro",
      modelName = "gemini-pro",
      provider = "gemini",
      secretName = "GOOGLE_AI_STUDIO_KEY"
    }
  }
})
```

**Note**: AI Studio is not the same as the Gemini App (previously Bard). You need access to https://aistudio.google.com/app specifically.

#### Dall-E

Dall-E can be configured for generating images:

```lua
config.set("OPENAI_API_KEY", "your-openai-key-here")

config.set("ai", {
  imageModels = {
    {name = "dall-e-3", modelName = "dall-e-3", provider = "dalle"},
    {name = "dall-e-2", modelName = "dall-e-2", provider = "dalle"}
  }
})
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

- `tags` must include `template` and `aiPrompt`
- `aiprompt` object must exist and have a `description` key
- Optionally, `aiprompt.systemPrompt` can be specified to override the system prompt

For example, here is a templated prompt to summarize the current note and insert the summary at the cursor:

``` markdown
---
tags:
- template
- aiPrompt

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
tags:
- template
- aiPrompt

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


## Cost (OpenAI)

While this plugin is free to use, OpenAI does charge for their API usage.  Please see their [pricing page](https://openai.com/pricing) for cost of the various apis.

As of 2024-02, here's a rough idea of what to expect:

- Dall-E image generation, HD 1024x1024; $0.080 per image
- GPT-4-turbo; $0.01 per 1k input tokens, $0.03 per 1k output tokens
- GPT-3.5-turbo; $0.0005 per 1k input tokens, $0.0015 per 1k output tokens
- Per the above pricing page, a rough estimate is that 1000 tokens is about 750 words

<!-- TODO: Add pricing for mistral.ai -->

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

### Method 1: Library Manager (v2.3.0+)

1. Run `Library: Install` command
2. Enter: `https://github.com/justyns/silverbullet-ai/blob/main/PLUG.md`

### Method 2: Space Lua Config

Add to your Space Lua configuration:

```lua
config.set("plugs", {
  "github:justyns/silverbullet-ai/silverbullet-ai.plug.js"
})
```

Then run `Plugs: Update`.

**Upgrading?** If you have an old version in `_plug/`, delete it before reinstalling via Library Manager.

See the [documentation](https://ai.silverbullet.md/) for full configuration details.
