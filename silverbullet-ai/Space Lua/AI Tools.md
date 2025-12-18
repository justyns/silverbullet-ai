---
tags: space-lua
---

# AI Tools

Core built-in tools for the AI Assistant. See [AI Tools documentation](https://ai.silverbullet.md/AI%20Tools/) for details.

```space-lua
-- Find start and end lines for a specific occurence of a section with a matching header
local function findSection(content, sectionName, occurrence)
  local lines = {}
  for line in string.gmatch(content .. "\n", "([^\n]*)\n") do
    table.insert(lines, line)
  end

  occurrence = occurrence or 1
  local matchCount = 0
  local targetLevel = nil
  local startLine = nil
  local endLine = nil

  for i, line in ipairs(lines) do
    local hashes, title = string.match(line, "^(#+)%s+(.+)$")
    if hashes then
      local level = #hashes
      if not startLine then
        if string.lower(title) == string.lower(sectionName) then
          matchCount = matchCount + 1
          if matchCount == occurrence then
            targetLevel = level
            startLine = i
          end
        end
      else
        if level <= targetLevel then
          endLine = i - 1
          break
        end
      end
    end
  end

  -- Count remaining matches after we found ours
  if startLine then
    for i = (endLine or #lines) + 1, #lines do
      local hashes, title = string.match(lines[i], "^(#+)%s+(.+)$")
      if hashes and string.lower(title) == string.lower(sectionName) then
        matchCount = matchCount + 1
      end
    end
  end

  if not startLine then
    return nil, nil, nil, matchCount
  end

  return startLine, endLine or #lines, lines, matchCount
end

local function listSections(content)
  local sections = {}
  for line in string.gmatch(content, "[^\n]+") do
    local hashes, title = string.match(line, "^(#+)%s+(.+)$")
    if hashes then
      table.insert(sections, {level = #hashes, title = title})
    end
  end
  return sections
end

-- TODO: We need a way to not store the full results and maybe store a truncated version or summary
ai.tools.read_note = {
  description = "Read the content of a note. Optionally read only a specific section.",
  parameters = {
    type = "object",
    properties = {
      page = {type = "string", description = "The page name to read"},
      section = {type = "string", description = "Optional: read only this section (by header text)"},
      occurrence = {type = "number", description = "Which occurrence of the section to read if duplicates exist (default 1)"},
      listSections = {type = "boolean", description = "If true, list all section headers instead of content"}
    },
    required = {"page"}
  },
  handler = function(args)
    if not space.pageExists(args.page) then
      return "Error: Page not found: " .. args.page
    end
    local content = space.readPage(args.page)

    if args.listSections then
      local sections = listSections(content)
      if #sections == 0 then
        return "No sections found in " .. args.page
      end
      local result = {"Sections in " .. args.page .. ":"}
      for _, s in ipairs(sections) do
        table.insert(result, string.rep("  ", s.level - 1) .. "- " .. s.title)
      end
      return table.concat(result, "\n")
    end

    if args.section then
      local occurrence = args.occurrence or 1
      local startLine, endLine, lines, matchCount = findSection(content, args.section, occurrence)
      if not startLine then
        if matchCount > 0 then
          return "Error: Section '" .. args.section .. "' occurrence " .. occurrence .. " not found (only " .. matchCount .. " exist)"
        end
        return "Error: Section not found: " .. args.section
      end
      local sectionLines = {}
      for i = startLine, endLine do
        table.insert(sectionLines, lines[i])
      end
      local result = table.concat(sectionLines, "\n")
      if matchCount > 1 then
        result = result .. "\n\n(Note: " .. matchCount .. " sections named '" .. args.section .. "' exist. Use occurrence parameter to select others.)"
      end
      return result
    end

    return content
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

      -- Check path filter and recursive setting
      if pathFilter ~= "" then
        if not string.startsWith(name, pathFilter .. "/") and name ~= pathFilter then
          dominated = false
        end
        if dominated and not recursive then
          local remainder = string.sub(name, #pathFilter + 2)
          if string.find(remainder, "/") then
            dominated = false
          end
        end
      elseif not recursive then
        -- No path filter but recursive=false: only show top-level pages
        if string.find(name, "/") then
          dominated = false
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
  description = "Update a note's content. Can update the whole page, a specific section, or append/prepend to a section.",
  requiresApproval = true,
  parameters = {
    type = "object",
    properties = {
      page = {type = "string", description = "The page name to update"},
      content = {type = "string", description = "The content to write"},
      section = {type = "string", description = "Optional: target a specific section (by header text)"},
      occurrence = {type = "number", description = "Which occurrence of the section to update if duplicates exist (default 1)"},
      mode = {type = "string", description = "How to apply: 'replace' (default), 'append', or 'prepend'. For sections, 'replace' replaces section content (keeps header), 'append'/'prepend' add to it."}
    },
    required = {"page", "content"}
  },
  handler = function(args)
    if not space.pageExists(args.page) then
      return "Error: Page not found: " .. args.page .. ". Use create_note to create it if needed."
    end

    local mode = args.mode or "replace"
    local existingContent = space.readPage(args.page)

    if args.section then
      local occurrence = args.occurrence or 1
      local startLine, endLine, lines, matchCount = findSection(existingContent, args.section, occurrence)
      if not startLine then
        if matchCount > 0 then
          return "Error: Section '" .. args.section .. "' occurrence " .. occurrence .. " not found (only " .. matchCount .. " exist)"
        end
        return "Error: Section not found: " .. args.section
      end

      local before = {}
      for i = 1, startLine do
        table.insert(before, lines[i])
      end

      local after = {}
      for i = endLine + 1, #lines do
        table.insert(after, lines[i])
      end

      local sectionBody = {}
      for i = startLine + 1, endLine do
        table.insert(sectionBody, lines[i])
      end

      local newBody
      if mode == "append" then
        newBody = table.concat(sectionBody, "\n") .. "\n" .. args.content
      elseif mode == "prepend" then
        newBody = args.content .. "\n" .. table.concat(sectionBody, "\n")
      else
        newBody = args.content
      end

      local newContent = table.concat(before, "\n") .. "\n" .. newBody
      if #after > 0 then
        newContent = newContent .. "\n" .. table.concat(after, "\n")
      end

      space.writePage(args.page, newContent)
      local result = "Updated section '" .. args.section .. "' in " .. args.page
      if matchCount > 1 then
        result = result .. " (occurrence " .. occurrence .. " of " .. matchCount .. ")"
      end
      return result
    else
      local newContent
      if mode == "append" then
        newContent = existingContent .. "\n" .. args.content
      elseif mode == "prepend" then
        newContent = args.content .. "\n" .. existingContent
      else
        newContent = args.content
      end

      space.writePage(args.page, newContent)
      return "Updated: " .. args.page
    end
  end
}

ai.tools.create_note = {
  description = "Create a new note. Fails if the page already exists.",
  requiresApproval = true,
  parameters = {
    type = "object",
    properties = {
      page = {type = "string", description = "The page name to create"},
      content = {type = "string", description = "The content for the new page"}
    },
    required = {"page", "content"}
  },
  handler = function(args)
    if space.pageExists(args.page) then
      return "Error: Page already exists: " .. args.page .. ". Use update_note to modify it."
    end
    space.writePage(args.page, args.content)
    return "Created: " .. args.page
  end
}

ai.tools.navigate = {
  description = "Navigate to a page or position. Use to open pages for the user or jump to specific locations.",
  parameters = {
    type = "object",
    properties = {
      ref = {type = "string", description = "Page reference to navigate to (e.g., 'PageName', 'PageName@123' for position, 'PageName#anchor', 'PageName@L12C13' for specific line and column.)"},
      replaceState = {type = "boolean", description = "Replace current history state instead of pushing (default false)"},
      newWindow = {type = "boolean", description = "Open in a new window (default false)"}
    },
    required = {"ref"}
  },
  handler = function(args)
    editor.navigate(args.ref, args.replaceState or false, args.newWindow or false)
    return "Navigated to: " .. args.ref
  end
}
```
