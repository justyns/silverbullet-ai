Ollama is supported both as a text/llm provider, and also can be used for embeddings generation.

To use Ollama locally, make sure you have it running first and the desired models downloaded.

## Provider Configuration (Recommended)

```lua
config.set {
  ai = {
    providers = {
      ollama = {
        baseUrl = "http://localhost:11434/v1",
        useProxy = false,  -- Bypass SilverBullet's proxy for local requests
        preferredModels = {"llama3.2", "qwen2.5-coder"}
      }
    },
    -- Optional: auto-select a default model on startup
    defaultTextModel = "ollama:llama3.2"
  }
}
```

With this configuration:

- Run **"AI: Select Text Model"** to see all models from your Ollama instance
- **"AI: Refresh Model List"** updates the cached model list
- `preferredModels` appear first in the picker (marked with ★)

## Legacy Configuration

!!! warning "Deprecated"
    The `textModels` array configuration is deprecated. Please migrate to the `providers` config above.

```lua
config.set {
  ai = {
    textModels = {
      {
        name = "ollama-phi-2",
        modelName = "phi",
        provider = "ollama",
        baseUrl = "http://localhost:11434/v1",
        requireAuth = false,
        useProxy = false
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

## Embedding Models

Embedding models still use the legacy `embeddingModels` array:

```lua
config.set {
  ai = {
    providers = {
      ollama = { baseUrl = "http://localhost:11434/v1", useProxy = false }
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

- **useProxy**: Set to `false` to bypass SilverBullet's proxy and make requests directly from the client browser.  Useful if running ollama somewhere accessible by the client, but not by the silverbullet server.
- **requireAuth**: Ollama defaults to `false`. Set to `true` if you have a reverse proxy providing authentication.

## Docker Configuration

If running both SilverBullet and Ollama in Docker on the same machine, use `host.docker.internal` instead of `localhost`:

```lua
config.set {
  ai = {
    providers = {
      ollama = {
        baseUrl = "http://host.docker.internal:11434/v1",
        useProxy = true
      }
    }
  }
}
```

> **note**: `host.docker.internal` is available on Docker Desktop (Mac/Windows) and recent versions of Docker on Linux. On older Linux Docker installations, you may need to add `--add-host=host.docker.internal:host-gateway` to your docker run command.

## Multiple Ollama Instances

You can configure multiple Ollama instances by using different key names with the explicit `provider` field:

```lua
config.set {
  ai = {
    providers = {
      ollamaLocal = {
        provider = "ollama",  -- Explicit provider type
        baseUrl = "http://localhost:11434/v1",
        useProxy = false
      },
      ollamaRemote = {
        provider = "ollama",
        baseUrl = "http://my-server:11434/v1",
        useProxy = true
      }
    }
  }
}
```

## Ollama Server Configuration

When running Ollama, these are some useful environment variables/options:

- `OLLAMA_ORIGINS` - Allow silverbullet's hostname _if not using useProxy=true_.
- `OLLAMA_HOST` - By default, only 127.0.0.1 is exposed.  If you use ollama on a different machine, this may need changed.
- `OLLAMA_CONTEXT_LENGTH` - By default, Ollama only uses a 4k context window.  You'll most likely want to increase this.
- `OLLAMA_FLASH_ATTENTION=1` - Can reduce memory usage as context size grows.
- `OLLAMA_KV_CACHE_TYPE=q8_0` - Quantizes the K/V context cache so that less memory is used by the context cache.


Please see [docs.ollama.com/faq](https://docs.ollama.com/faq) for more information.
