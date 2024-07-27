---
tags: commands
commandName: "AI: Suggest Page Name"
commandSummary: "Ask the LLM to provide a name for the current note, allow the user to choose from the suggestions, and then rename the page."
---

When triggered, sends the current note to the LLM and asks for a few suggested titles.  A title can be selected from the list, and then the page will be automatically renamed.

Additional user-specific instructions can be configured in `ai.promptInstructions.pageRenameRules`. See [[Configuration/Prompt Instructions]] for examples.

![[Commands/page-suggest-name.gif]]