# Bundled Prompts

The plug ships with several pre-built AI prompt templates defined in Space Lua. These appear as commands in the command palette but are implemented as AI prompts that can be customized through configuration.

## Available Bundled Prompts

### AI: Enhance Note

A convenience command that runs three prompts in sequence:

1. AI: Generate tags for note
2. AI: Generate Note FrontMatter
3. AI: Suggest Page Name

### AI: Generate tags for note

Analyzes the current note and suggests tags based on its content. Generated tags are merged with any existing tags in the note's frontmatter.

**Customization:** Set `ai.promptInstructions.tagRules` in your config:

```lua
config.set("ai", {
  promptInstructions = {
    tagRules = [[
ONLY use existing tags. Don't create new tags.
ONLY add relevant tags. Favor a small number of tags instead of many.
Tag notes that contain confirmations or receipts with #receipt.
]]
  }
})
```

See [[Configuration/Prompt Instructions]] for more examples.

### AI: Generate Note FrontMatter

**Experimental.** Extracts useful information from the note content and generates frontmatter attributes.

**Customization:** Set `ai.promptInstructions.enhanceFrontMatterPrompt` in your config.

Without specific rules, the LLM may over-generate attributes. Consider providing guidance on which attributes are valuable for your use case.

### AI: Suggest Page Name

Sends the note to the LLM and asks for suggested titles. Presents a list of suggestions and renames the page if one is selected.

**Customization:** Set `ai.promptInstructions.pageRenameRules` or `ai.promptInstructions.pageRenameSystem` in your config:

```lua
config.set("ai", {
  promptInstructions = {
    pageRenameRules = [[
Retain ALL date and time information from the original note title.
If there is a date at the beginning, ensure a hyphen separates the timestamp from the title.
If tags include #receipt, move it to "Receipts/YYYY/MM-MMMM/" using the date from the note metadata.
]]
  }
})
```

## How These Work

Unlike native plug commands, these are defined as Space Lua commands that call into the AI plug. This means:

- They can be customized through configuration
- They appear in the command palette like regular commands
- They can be invoked from other Space Lua code
- You can create your own similar prompts

The source for these prompts can be found in the `silverbullet-ai/Space Lua/` directory of the plug.
