Refreshes the cached model lists from all configured providers.

## When to Use

Run this command when:

- You've added a new provider or updated your configuration
- New models have been added to a provider (e.g., OpenAI released a new model)
- Models aren't appearing in the model picker that you expect to see

## How It Works

Model lists are cached for performance. This command clears the cache and fetches fresh model lists from each provider's API.

Providers with `fetchModels: false` will not be refreshed, as they rely only on `preferredModels` for the model list.
