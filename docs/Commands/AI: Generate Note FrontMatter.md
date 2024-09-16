---
tags: commands
commandName: "AI: Generate Note FrontMatter"
commandSummary: "Extracts important information from the current note and converts it
to frontmatter attributes."
---

> **note**: **Experimental**: This is new and not well-tested.  Please submit feedback if you have ideas for making it better.

This command will attempt to extract useful information from a note and then generate frontmatter attributes for that note.

To add additional rules and instructions, `ai.promptInstructions.enhanceFrontMatterPrompt` can be set.  See [[Configuration/Prompt Instructions]].

Without very specific prompt rules, the LLM is likely to over-generate attributes.