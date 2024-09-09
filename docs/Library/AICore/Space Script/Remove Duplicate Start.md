---
tags:
- spacescript
- meta

description: >
  This space script checks lineBefore against the first line of the response and deletes it if its a duplicate.
---


```space-script
silverbullet.registerFunction({ name: "removeDuplicateStart" }, async (data) => {
  console.log(data);
  const { response, lineBefore, lineCurrent } = data;
  const lines = response.split('\n');
  
  // Check if the first line matches either the previous or current line, and remove it if it does
  if ((lines[0].trim() == lineBefore.trim()) || (lines[0].trim() == lineCurrent.trim())) {
    lines.shift();
  }
  console.log(lines);

  return lines.join('\n');
});
```