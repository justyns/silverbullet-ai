---
tags: space-lua
---

# AI Tools

Example tools for the AI Assistant. See [AI Tools documentation](https://ai.silverbullet.md/AI%20Tools/) for details.

```space-lua
ai.tools.read_note = {
  description = "Read the full content of a note by its page name",
  parameters = {
    type = "object",
    properties = {
      page = {type = "string", description = "The page name to read"}
    },
    required = {"page"}
  },
  handler = function(args)
    if not space.pageExists(args.page) then
      return "Error: Page not found: " .. args.page
    end
    return space.readPage(args.page)
  end
}

ai.tools.list_pages = {
  description = "List pages in the space. Pages ending with / have subpages (e.g., 'Projects/' has children).",
  parameters = {
    type = "object",
    properties = {
      limit = {type = "number", description = "Maximum pages to return (default 20)"},
      path = {type = "string", description = "Only list pages under this path (e.g., 'Journal' or 'Projects/Active')"},
      recursive = {type = "boolean", description = "List all nested subpages (default false, only direct children)"},
      hideMeta = {type = "boolean", description = "Hide pages tagged with 'meta' (default true)"}
    }
  },
  handler = function(args)
    local limit = args.limit or 20
    local pathFilter = args.path or ""
    local recursive = args.recursive == true
    local hideMeta = args.hideMeta ~= false

    local pages = space.listPages()

    -- Build set of pages that have children
    local hasChildren = {}
    for page in each(pages) do
      local parent = string.match(page.name, "(.+)/[^/]+$")
      if parent then
        hasChildren[parent] = true
      end
    end

    local results = {}
    local total = 0

    for page in each(pages) do
      local dominated = true
      local name = page.name

      -- Check path filter
      if pathFilter ~= "" then
        if not string.startsWith(name, pathFilter .. "/") and name ~= pathFilter then
          dominated = false
        end
        -- Check recursive filter
        if dominated and not recursive then
          local remainder = string.sub(name, #pathFilter + 2)
          if string.find(remainder, "/") then
            dominated = false
          end
        end
      end

      -- Check meta filter
      if dominated and hideMeta and page.tags then
        for _, tag in ipairs(page.tags) do
          if tag == "meta" then
            dominated = false
            break
          end
        end
      end

      if dominated then
        total = total + 1
        if total <= limit then
          local suffix = hasChildren[name] and "/" or ""
          table.insert(results, "- " .. name .. suffix)
        end
      end
    end

    local header = "Pages"
    if pathFilter ~= "" then
      header = header .. " in " .. pathFilter
    end
    return header .. " (" .. math.min(total, limit) .. " of " .. total .. "):\n" .. table.concat(results, "\n")
  end
}

ai.tools.get_page_info = {
  description = "Get metadata about a page including tags, last modified date, size, and subpage count",
  parameters = {
    type = "object",
    properties = {
      page = {type = "string", description = "The page name"}
    },
    required = {"page"}
  },
  handler = function(args)
    if not space.pageExists(args.page) then
      return "Error: Page not found: " .. args.page
    end
    local meta = space.getPageMeta(args.page)
    local info = {
      "Page: " .. meta.name,
      "Size: " .. (meta.size or 0) .. " bytes",
      "Last modified: " .. (meta.lastModified or "unknown"),
    }
    if meta.tags and #meta.tags > 0 then
      table.insert(info, "Tags: " .. table.concat(meta.tags, ", "))
    end

    -- Count subpages
    local subpageCount = 0
    local prefix = args.page .. "/"
    for page in each(space.listPages()) do
      if string.startsWith(page.name, prefix) then
        subpageCount = subpageCount + 1
      end
    end
    if subpageCount > 0 then
      table.insert(info, "Subpages: " .. subpageCount)
    end

    return table.concat(info, "\n")
  end
}

ai.tools.update_note = {
  description = "Update the content of a note. Use with caution - this overwrites the entire page.",
  requiresApproval = true,
  parameters = {
    type = "object",
    properties = {
      page = {type = "string", description = "The page name to update"},
      content = {type = "string", description = "The new content for the page"}
    },
    required = {"page", "content"}
  },
  handler = function(args)
    if not space.pageExists(args.page) then
      return "Error: Page not found: " .. args.page
    end
    space.writePage(args.page, args.content)
    return "Updated: " .. args.page
  end
}
```
