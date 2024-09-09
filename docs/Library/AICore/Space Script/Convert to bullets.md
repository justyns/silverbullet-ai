---
tags:
- spacescript
- meta

description: >
  This space script allows takes a string and converts each line to a bullet item in a list, if it is not already.
---


```space-script
silverbullet.registerFunction({ name: "convertToBulletList" }, async (data) => {
  const { response, lineBefore, lineAfter } = data;
  const lines = response.split('\n');
  
  // Get the indentation level of the line before
  const indentationMatch = lineBefore.match(/^\s*/);
  const indentation = indentationMatch ? indentationMatch[0] : '';
  
  const bulletLines = lines.map(line => {
    // Trim the line and add the indentation back
    const trimmedLine = `${indentation}${line.trim()}`;
    
    // Add a bullet if the line doesn't already start with one
    if (!trimmedLine.trim().startsWith('- ')) {
      return `- ${trimmedLine.trim()}`;
    }
    return trimmedLine;
  });

  const result = bulletLines.join('\n');
  return result;
});
```