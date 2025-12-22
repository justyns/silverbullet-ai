---
tags: provider
textProvider: true
imageProvider: false
apiProvider: ollama
embeddingProvider: true
---

Ollama is supported both as a text/llm provider, and also can be used for embeddings generation.

To use Ollama locally, make sure you have it running first and the desired models downloaded. Then, set the `baseUrl` to the url of your ollama instance:

```lua
config.set {
  ai = {
    textModels = {
      {
        name = "ollama-phi-2",
        -- Run `ollama list` to see a list of models downloaded
        modelName = "phi",
        provider = "ollama",
        baseUrl = "http://localhost:11434/v1",
        requireAuth = false,
        useProxy = false  -- Bypass SilverBullet's proxy for local requests
      }
    },
    embeddingModels = {
      {
        name = "ollama-all-minilm",
        modelName = "all-minilm",
        provider = "ollama",
        baseUrl = "http://localhost:11434",
        requireAuth = false,
        useProxy = false
      }
    }
  }
}
```

## Configuration Options

- **requireAuth**: When using Ollama and chrome, requireAuth needs to be set to false so that the Authorization header isn't set. Otherwise you will get a CORS error. It can also be set to true if there is a reverse proxy in front of it providing authentication.
- **useProxy**: Set to `false` to bypass SilverBullet's proxy and make requests directly. Useful for local services like Ollama.

## Docker Configuration

If running both SilverBullet and Ollama in Docker on the same machine, use `host.docker.internal` instead of `localhost` to reach Ollama from the SilverBullet container:

```lua
config.set {
  ai = {
    textModels = {
      {
        name = "ollama-phi-2",
        modelName = "phi",
        provider = "ollama",
        baseUrl = "http://host.docker.internal:11434/v1",
        requireAuth = false,
        useProxy = false
      }
    }
  }
}
```

> **note**: `host.docker.internal` is available on Docker Desktop (Mac/Windows) and recent versions of Docker on Linux. On older Linux Docker installations, you may need to add `--add-host=host.docker.internal:host-gateway` to your docker run command.

## Ollama configuration

When running Ollama, these are some useful environment variables/options:

- `OLLAMA_ORIGINS` - Allow silverbullet's hostname _if not using useProxy=true_.
- `OLLAMA_HOST` - By default, only 127.0.0.1 is exposed.  If you use ollama on a different machine, this may need changed.
- `OLLAMA_CONTEXT_LENGTH` - By default, Ollama only uses a 4k context window.  You'll most likely want to increase this.
- `OLLAMA_FLASH_ATTENTION=1` - Can reduce memory usage as context size grows.
- `OLLAMA_KV_CACHE_TYPE=q8_0` - Quantizes the K/V context cache so that less memory is used by the context cache.


Please see [docs.ollama.com/faq](https://docs.ollama.com/faq) for more information.