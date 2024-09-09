---
tags:
- spacescript
- meta

description: >
  This space script allows takes a string and indents each line one level, compared to the lineBefore.
---

```space-script
silverbullet.registerFunction({ name: "indentOneLevel" }, async (data) => {
  const { response, lineBefore, lineCurrent } = data;
  console.log(data);

  // Function to determine the indentation of a line
  const getIndentation = (line) => line.match(/^\s*/)[0];

  // Determine the maximum indentation of lineBefore and lineCurrent
  const maxIndentation = getIndentation(lineBefore).length > getIndentation(lineCurrent).length 
    ? getIndentation(lineBefore) 
    : getIndentation(lineCurrent);

  // Define additional indentation level
  const additionalIndentation = '  ';

  // Compute new indentation
  const newIndentation = maxIndentation + additionalIndentation;

  // Apply new indentation to all lines in the response
  const indentedLines = response.split('\n').map(line => `${newIndentation}${line.trim()}`).join('\n');

  console.log("indentedLines:", indentedLines);

  return indentedLines;
});
```