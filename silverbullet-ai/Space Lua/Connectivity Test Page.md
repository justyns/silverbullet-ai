---
description: Virtual page for AI connectivity test results
tags: meta/ai
---

# AI Connectivity Test Virtual Page

This defines a virtual page that displays cached connectivity test results.

```space-lua
virtualPage.define {
  pattern = "🛰️ AI Connectivity Test",
  run = function()
    return system.invokeFunction("silverbullet-ai.getConnectivityTestResults")
  end
}
```
