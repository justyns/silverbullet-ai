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

| Type | Description |
|------|-------------|
| `note` | Content from a wiki-linked page like `[[PageName]]` |
| `embedding` | Content from semantically similar pages found via embedding search |
| `custom` | Content added by custom enrichment functions |

## Configuration

Enable context enrichment features in your config:

```lua
config.set("ai", {
  chat = {
    parseWikiLinks = true,      -- Extract content from [[wiki-links]]
    searchEmbeddings = true,    -- Search indexed embeddings for context
    bakeMessages = true,        -- Render templates/queries before sending
    customEnrichFunctions = {}  -- List of custom function names
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

## Template Expansion

When `bakeMessages` is enabled, SilverBullet templates and queries in your message are rendered before sending:

```
What should I work on today?

Current tasks:
${query[[from index.tag("task") where _.done == false]]}
```

The query results will be included in the message sent to the LLM.

## Custom Enrichment Functions

You can add your own enrichment logic using Space Lua. Define a function and register it:

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
