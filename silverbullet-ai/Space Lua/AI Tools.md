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

ai.writePage = function(page, content)
  local result = system.invokeFunction("silverbullet-ai.requestWriteApproval", page, content)
  if not result.success then
    error(result.error or "Write rejected")
  end
  return result
end

-- Helper to count lines in a string
local function countLines(str)
  local lines = 0
  for _ in string.gmatch(str .. "\n", "[^\n]*\n") do
    lines = lines + 1
  end
  return lines
end

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
      local resultLines = {"Sections in " .. args.page .. ":"}
      for _, s in ipairs(sections) do
        table.insert(resultLines, string.rep("  ", s.level - 1) .. "- " .. s.title)
      end
      local resultStr = table.concat(resultLines, "\n")
      return {
        result = resultStr,
        summary = "Listed " .. #sections .. " sections in '" .. args.page .. "'"
      }
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
      local resultStr = table.concat(sectionLines, "\n")
      if matchCount > 1 then
        resultStr = resultStr .. "\n\n(Note: " .. matchCount .. " sections named '" .. args.section .. "' exist. Use occurrence parameter to select others.)"
      end
      return {
        result = resultStr,
        summary = "Read section '" .. args.section .. "' from '" .. args.page .. "' (" .. #resultStr .. " bytes, " .. (endLine - startLine + 1) .. " lines)"
      }
    end

    return {
      result = content,
      summary = "Read note '" .. args.page .. "' (" .. #content .. " bytes, " .. countLines(content) .. " lines)"
    }
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

      ai.writePage(args.page, newContent)
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

      ai.writePage(args.page, newContent)
      return "Updated: " .. args.page
    end
  end
}

ai.tools.search_replace = {
  description = "Find and replace text in a note. Use for targeted edits when you know the exact text to change.",
  parameters = {
    type = "object",
    properties = {
      page = {type = "string", description = "The page name to edit"},
      search = {type = "string", description = "The exact text to find"},
      replace = {type = "string", description = "The text to replace it with"},
      occurrence = {type = "string", description = "Which occurrences: 'first' (default), 'all', or a number like '2' for second occurrence only"}
    },
    required = {"page", "search", "replace"}
  },
  handler = function(args)
    if not space.pageExists(args.page) then
      return "Error: Page not found: " .. args.page
    end

    local content = space.readPage(args.page)
    local search = args.search
    local replace = args.replace
    local occurrence = args.occurrence or "first"

    -- Count total occurrences
    local count = 0
    local pos = 1
    while true do
      local found = string.find(content, search, pos, true)
      if not found then break end
      count = count + 1
      pos = found + 1
    end

    if count == 0 then
      return "Error: Text not found in " .. args.page .. ": " .. string.sub(search, 1, 50) .. (string.len(search) > 50 and "..." or "")
    end

    local newContent
    local replaced = 0

    if occurrence == "all" then
      -- Replace all occurrences using plain string replacement
      newContent = ""
      pos = 1
      while true do
        local found = string.find(content, search, pos, true)
        if not found then
          newContent = newContent .. string.sub(content, pos)
          break
        end
        newContent = newContent .. string.sub(content, pos, found - 1) .. replace
        replaced = replaced + 1
        pos = found + string.len(search)
      end
    else
      -- Replace specific occurrence(s)
      local targetOccurrence = 1
      if occurrence ~= "first" then
        targetOccurrence = tonumber(occurrence) or 1
      end

      if targetOccurrence > count then
        return "Error: Only " .. count .. " occurrence(s) found, cannot replace occurrence " .. targetOccurrence
      end

      newContent = ""
      pos = 1
      local currentOccurrence = 0
      while true do
        local found = string.find(content, search, pos, true)
        if not found then
          newContent = newContent .. string.sub(content, pos)
          break
        end
        currentOccurrence = currentOccurrence + 1
        if currentOccurrence == targetOccurrence then
          newContent = newContent .. string.sub(content, pos, found - 1) .. replace
          replaced = 1
          pos = found + string.len(search)
          -- Add the rest unchanged
          newContent = newContent .. string.sub(content, pos)
          break
        else
          newContent = newContent .. string.sub(content, pos, found + string.len(search) - 1)
          pos = found + string.len(search)
        end
      end
    end

    ai.writePage(args.page, newContent)

    if replaced == 1 then
      return "Replaced 1 occurrence in " .. args.page
    else
      return "Replaced " .. replaced .. " occurrences in " .. args.page
    end
  end
}

ai.tools.create_note = {
  description = "Create a new note. Fails if the page already exists.",
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
    ai.writePage(args.page, args.content)
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

ai.tools.eval_lua = {
  description = "Execute a Lua expression and return the result. Use for calculations, data transformations, or accessing SilverBullet APIs not covered by other tools. Available globals include: space, editor, sync, system, markdown, template, and standard Lua functions.",
  requiresApproval = true,
  parameters = {
    type = "object",
    properties = {
      expression = {type = "string", description = "The Lua expression to evaluate. Can be a simple expression or a function body wrapped in (function() ... end)() for multiple statements."},
      env = {type = "object", description = "Optional environment variables to make available to the expression"}
    },
    required = {"expression"}
  },
  handler = function(args)
    local parsed = spacelua.parseExpression(args.expression)
    local result = spacelua.evalExpression(parsed, args.env)
    if result == nil then
      return "nil"
    end
    if type(result) == "table" then
      return js.stringify(result)
    end
    return tostring(result)
  end
}

ai.tools.update_frontmatter = {
  description = "Update frontmatter (YAML metadata) on a page. Can set or delete individual keys without affecting the rest of the page content.",
  requiresApproval = true,
  parameters = {
    type = "object",
    properties = {
      page = {type = "string", description = "The page name to update"},
      set = {type = "object", description = "Key-value pairs to set or update in frontmatter (e.g., {status: 'done', priority: 1, tags: ['work', 'urgent']})"},
      delete = {type = "array", items = {type = "string"}, description = "Keys to remove from frontmatter"}
    },
    required = {"page"}
  },
  handler = function(args)
    if not space.pageExists(args.page) then
      return "Error: Page not found: " .. args.page
    end

    local patches = {}
    local setKeys = {}
    local reservedKeys = {page = true, set = true, delete = true}

    -- Handle explicit 'set' parameter
    if args.set then
      for key, value in pairs(args.set) do
        table.insert(patches, {op = "set-key", path = key, value = value})
        table.insert(setKeys, key)
      end
    end

    -- Also accept keys passed directly (LLMs often flatten the structure)
    for key, value in pairs(args) do
      if not reservedKeys[key] then
        table.insert(patches, {op = "set-key", path = key, value = value})
        table.insert(setKeys, key)
      end
    end

    if args.delete then
      for _, key in ipairs(args.delete) do
        table.insert(patches, {op = "delete-key", path = key})
      end
    end

    if #patches == 0 then
      return "Error: No changes specified. Provide 'set' and/or 'delete' parameters."
    end

    local content = space.readPage(args.page)
    local newContent = index.patchFrontmatter(content, patches)

    ai.writePage(args.page, newContent)

    local changes = {}
    if #setKeys > 0 then
      table.insert(changes, "set: " .. table.concat(setKeys, ", "))
    end
    if args.delete and #args.delete > 0 then
      table.insert(changes, "deleted: " .. table.concat(args.delete, ", "))
    end

    return "Updated frontmatter on " .. args.page .. " (" .. table.concat(changes, "; ") .. ")"
  end
}

ai.tools.rename_note = {
  description = "Rename a page to a new name. This also updates all backlinks across the space to point to the new name.",
  requiresApproval = true,
  parameters = {
    type = "object",
    properties = {
      oldPage = {type = "string", description = "The current page name to rename"},
      newPage = {type = "string", description = "The new name for the page"}
    },
    required = {"oldPage", "newPage"}
  },
  handler = function(args)
    if not space.pageExists(args.oldPage) then
      return "Error: Page not found: " .. args.oldPage
    end

    if space.pageExists(args.newPage) then
      return "Error: Target page already exists: " .. args.newPage
    end

    local success = system.invokeFunction("silverbullet-ai.renamePage", args.oldPage, args.newPage)

    if success then
      return "Renamed '" .. args.oldPage .. "' to '" .. args.newPage .. "' (backlinks updated)"
    else
      return "Error: Rename failed or was cancelled"
    end
  end
}
```
