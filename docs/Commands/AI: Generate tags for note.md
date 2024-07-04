---
tags: commands
commandName: "AI: Generate tags for note"
commandSummary: "Asks the LLM to generate tags for the current note.
Generated tags are added to the note's frontmatter."
---

When triggered, generate a list of tags for the current note and set them in the yaml frontmatter.

All existing page tags are sent as part of the context along with the note, but additional rules and instructions can also be configured in `ai.promptInstructions.tagRules`.  See [[Configuration/Prompt Instructions]] for examples.