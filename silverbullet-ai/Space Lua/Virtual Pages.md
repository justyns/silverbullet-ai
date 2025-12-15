---
description: Virtual pages for AI features
tags: meta/ai
---

These define virtual pages that display cached results from AI operations.

### Connectivity Test Page

```space-lua
virtualPage.define {
  pattern = "🛰️ AI Connectivity Test",
  run = function()
    return system.invokeFunction("silverbullet-ai.getConnectivityTestResults")
  end
}
```

### Search Results Page

```space-lua
virtualPage.define {
  pattern = "🤖 (.+)",
  run = function(query)
    return system.invokeFunction("silverbullet-ai.getSearchResults", query)
  end
}
```
