---
tags:
- meta
---

Utility functions for silverbullet-ai.

## Enrich Content with Wiki-Links

Extracts `[[wiki-links]]` from content and returns attachments for each referenced page.
Accepts an optional `alreadySeen` table of page names to skip (for deduplication across messages).
Returns a table with `content`, `attachments`, and `seenPages` keys.

```space-lua
-- priority: 40

function ai.enrichWithWikiLinks(content, alreadySeen)
  local wikiLinkPattern = "%[%[([^%]|]+)"
  local seenPages = alreadySeen or {}
  local attachments = {}

  for pageName in string.gmatch(content, wikiLinkPattern) do
    if not seenPages[pageName] then
      seenPages[pageName] = true
      local success, pageContent = pcall(function()
        return space.readPage(pageName)
      end)
      if success and pageContent then
        table.insert(attachments, {
          name = pageName,
          content = pageContent,
          type = "note"
        })
      end
    end
  end

  return {content = content, attachments = attachments, seenPages = seenPages}
end
```
