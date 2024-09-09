---
tags:
- spacescript
- meta

description: >
  This space script takes a string, and makes sure each line is a markdown task.
---

```space-script
silverbullet.registerFunction({ name: "convertToTaskList" }, async (data) => {
  const { response } = data;
  const lines = response.split('\n');
  const result = lines.map(line => {
    if (/^\s*-\s*\[\s*[xX]?\s*\]/.test(line)) {
      // Already a task
      return line.trim();
    }
    if (/^\s*-/.test(line)) {
      // bullet, but not a task
      return `- [ ] ${line.slice(1).trim()}`;
    }
    // everything else, should be a non list item
    return `- [ ] ${line.trim()}`;
  }).join('\n');
  return result;
});
```