# Context Enrichment

The AI plug automatically enriches chat messages with relevant context before sending them to the LLM. This helps the LLM understand your notes and provide more relevant responses.

## How It Works

When you send a message in chat, the plug can:

1. **Parse wiki-links** - Extract content from linked pages
2. **Search embeddings** - Find semantically related notes
3. **Expand templates** - Render SilverBullet queries and templates
4. **Run custom functions** - Execute your own enrichment logic

Each piece of context is wrapped as an "attachment" and inserted into the conversation in a cache-friendly order.

## Attachment Types

Text context is added to the conversation wrapped in a `<context type="…" name="…">` block. The `type` tells the model where the text came from:

| Type | Description |
|------|-------------|
| `note` | Content from a wiki-linked page like `[[PageName]]` |
| `rag` | Excerpts from semantically similar pages (embedding search) |
| `custom` | Content added by custom enrichment functions |
| `file` | Text extracted from an embedded file by a custom `ai.fileHandlers` handler |

**Note**: This is separate from native file attachments like for models that support vision.

## Configuration

Enable context enrichment features in your config:

```lua
config.set("ai", {
  chat = {
    parseWikiLinks = true,      -- Extract content from [[wiki-links]]
    searchEmbeddings = true,    -- Search indexed embeddings for context
    bakeMessages = true,        -- Render templates/queries before sending
    attachImages = true,        -- Send referenced images to vision models
    attachDocuments = false,    -- Send referenced PDFs to document-capable models
    downloadRemoteImages = false, -- Also download https:// image links
    maxFileSizeMB = 10          -- Skip files larger than this (default 10)
  }
})
```

## Wiki-Link Context

When `parseWikiLinks` is enabled, any `[[PageName]]` references in your message will have their content fetched and included as context.

**Example:**

```
Can you summarize the key points from [[Project Notes]]?
```

The content of the "Project Notes" page will be attached to your message, giving the LLM access to that information.

**Agent context:** Page-based agents (see [[Agents]]) can also include wiki-links in their page body. These become attachments that persist across the entire chat session.

## Embedding Search

When `searchEmbeddings` is enabled and you have [[Configuration/Embedding Models|embeddings configured]], the plug searches your indexed notes for content semantically related to your message.

Relevant excerpts are automatically included as context, enabling RAG (Retrieval Augmented Generation).

## File Attachments (Vision & Documents)

Files referenced in your messages are collected alongside text context and delivered automatically: each becomes a native part when the model supports it.

When `attachImages` is enabled and the selected model supports vision, images referenced in your chat messages are sent to the LLM:

```
Describe the animal in ![[photos/cat.png]]

Transcribe this diagram into a Mermaid block: ![diagram](architecture.png)
```

Both `![[image.png]]` and `![alt](image.png)` syntax work. In the chat panel, files embedded in the current page are also attached, so you can ask "describe the image on this page". Each file is labeled with its path (and any alt text / `|caption` you gave it), so the model can tell multiple attachments apart.

Supported image formats: png, jpg/jpeg, gif, webp. Files larger than `maxFileSizeMB` (default 10) are skipped. Remote `https://` image links are skipped unless `downloadRemoteImages` is enabled, which downloads and caches them locally before sending.

### Documents (PDF)

PDFs require `attachDocuments = true` **and** a model explicitly flagged document-capable.  There is no auto-detect for PDF support, so it is opt-in per model via `supportsDocuments`:

```lua
config.set("ai", {
  textModels = {
    { name = "gpt-4o", provider = "openai", modelName = "gpt-4o",
      supportsVision = true, supportsDocuments = true },
  },
})
```

### Custom file handlers

For file types a model can't read natively, register a handler in `ai.fileHandlers`, keyed by extension. It receives `{ path, mimeType, dataUrl }` and returns either `{ text = "..." }` (added as text context, so it reaches any model) or `{ mimeType = "...", data = "<base64>" }` (sent as a native attachment):

```lua
ai.fileHandlers = ai.fileHandlers or {}
ai.fileHandlers.draw = function(file)
  return { text = my_drawio_ocr(file.dataUrl) }
end
```

### Requesting a file (view_file tool)

Attachments are normally added up front. If the model instead only sees a reference, it can call the built-in `view_file(path)` tool to request the file.  It'll show up on its next turn since tool results still have to be strings.

This needs tools enabled, and bypasses the `attachImages`/`attachDocuments` toggles.

## Template Expansion

When `bakeMessages` is enabled, SilverBullet templates and queries in your message are rendered before sending:

```
What should I work on today?

Current tasks:
${query[[from index.tag("task") where _.done == false]]}
```

The query results will be included in the message sent to the LLM.

## Custom Enrichment Functions

You can add your own enrichment logic using [[Space Lua]]. Define a function in a `space-lua` block (so it is registered as a global in the Space Lua environment) and reference it by name. Dotted namespace names like `myNs.enrich` are also supported.

```lua
-- In a Space Lua block
function myCustomEnricher(content)
  -- Add custom context based on the message
  local extra = "Current date: " .. os.date("%Y-%m-%d")
  return content .. "\n\n" .. extra
end
```

Then add it to the configuration:

```lua
config.set("ai", {
  chat = {
    customEnrichFunctions = {"myCustomEnricher"}
  }
})
```

### Event-Based Enrichment

You can also listen to the `ai:enrichMessage` event to dynamically add enrichment functions:

```lua
event.listen {
  name = "ai:enrichMessage",
  run = function(data)
    -- Return function names to run based on message content
    if string.find(data.enrichedContent, "weather") then
      return {"addWeatherContext"}
    end
    return {}
  end
}
```

## Context Format

Attachments are formatted as XML-like context blocks when sent to the LLM:

```xml
<context type="note" name="Project Notes">
Content of the page goes here...
</context>
```

This format helps the LLM distinguish between your message and the attached context.  It's also inserted as it's own chat message to help preserve caching with providers that support it.

## Disabling Enrichment

To skip enrichment for a specific message, add `[enrich:false]` anywhere in your message:

```
[enrich:false] What is 2+2?
```

The attribute is removed before sending, and no enrichment is performed for that message.
