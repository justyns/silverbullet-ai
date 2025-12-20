---
description: Virtual pages for AI features
tags: space-lua
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

### Benchmark Results Page

```space-lua
virtualPage.define {
  pattern = "🧪 AI Benchmark",
  run = function()
    return system.invokeFunction("silverbullet-ai.getBenchmarkResults")
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
