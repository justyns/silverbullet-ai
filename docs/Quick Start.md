This is a short introduction to installing and using the SilverBullet AI plug with **SilverBullet v2**.

## Installation

Run `Library: Install` and enter `ghr:justyns/silverbullet-ai/PLUG.md` (see [[Installation]] for more options)

## Configuration

Add your configuration to a Space Lua block. This example uses OpenAI, but see [[Providers]] for other options including self-hosted models with Ollama.

```lua
config.set {
  ai = {
    providers = {
      openai = {
        apiKey = "your-openai-key-here",
        preferredModels = {"gpt-4o", "gpt-4o-mini"}
      }
    },
    defaultTextModel = "openai:gpt-4o",
    -- Optional: enable embeddings for semantic search
    defaultEmbeddingModel = "openai:text-embedding-3-small",
    indexEmbeddings = true,
    -- Optional: configure DALL-E for image generation
    defaultImageModel = "openai:dall-e-3",
    -- Optional: customize chat behavior
    chat = {
      userInformation = "I'm a software developer who likes taking notes.",
      userInstructions = "Please give short and concise responses."
    }
  }
}
```

With this configuration:

- Models are fetched automatically from the provider's API
- `preferredModels` appear first in the model picker (marked with ★)
- `defaultTextModel`, `defaultEmbeddingModel`, and `defaultImageModel` use the same API key
- Run **"AI: Refresh Model List"** to update cached models after config changes

See [[Configuration]] for all options, including [[Configuration/Chat Instructions]], [[Configuration/Embedding Models]], and [[Configuration/Image Models]].

## Usage

Open a new note, run [[Commands/AI: Chat on current page]] or press ++ctrl+shift+enter++ (++cmd+shift+enter++ on Mac) to start a chat session.

Or use [[Commands/AI: Toggle Assistant Panel]] (++ctrl+shift+a++) for a side-panel chat that persists across pages.

And that's it! Look at the other [[Commands]] available, as well as check out the [[Templated Prompts]] to go further.

### Troubleshooting

If something didn't work right, try using the `AI: Connectivity Test` command and also checking your browser's javascript console.
