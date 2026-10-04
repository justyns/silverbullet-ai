# Skills

Skills are instructions the Assistant loads only when a task needs them. They follow the [Agent Skills](https://agentskills.io/specification) format, so skills written for Claude Code, Codex, Cursor and other clients work unchanged.

The chat sees each skill's name and description. When a task matches, the model calls the `activate_skill` tool to load the full instructions, and can read files bundled with the skill through the same tool. Skills require a model that supports tool calling.

## Adding Skills

### Agent Skills folders

Any page named `SKILL` inside a folder under `Library/AISkills/` is a skill:

```
Library/AISkills/
└── pdf-processing/
    ├── SKILL.md
    ├── references/REFERENCE.md
    └── scripts/extract.py
```

`SKILL.md` needs a `name` and `description` in its frontmatter:

```markdown
---
name: pdf-processing
description: Extract text from PDFs. Use when the user mentions PDFs.
---

# PDF Processing

See references/REFERENCE.md for field names.
```

To scan other folders, set `ai.skills.paths`:

```lua
config.set("ai", {
  skills = { paths = {"Library/AISkills/", "Skills/"} }
})
```

### Tagged pages

A page anywhere in the space tagged `#meta/aiSkill` with a `description` is also a skill. Its name is the last segment of the page name, and its subpages are its bundled files.

```markdown
---
tags: meta/aiSkill
description: Run my weekly review. Use when the user asks for a weekly review.
---

1. List tasks completed this week...
```

If a folder skill and a tagged page share a name, the folder skill is used.

## Installing Skills

### AI: Import Skill

Paste a GitHub skill folder URL, e.g. `https://github.com/anthropics/skills/tree/main/skills/pdf`, to import all of its files. Any other URI to a `SKILL.md` imports just that file.

### Library: Install

Skills can be published as a SilverBullet library. Create a `meta/library` page under `Library/AISkills/` and list the skill files under `files`:

```markdown
---
name: Library/AISkills/myuser/PDF Skills
tags: meta/library
files:
- pdf-processing/SKILL.md
- pdf-processing/references/REFERENCE.md
---
```

## Agents and MCP

[[Agents]] can include or exclude `activate_skill` like any other tool, which turns all skills on or off for that agent. `activate_skill` is also exposed through the [[MCP Server]].

## Limitations

- Bundled scripts can be read but not run, because the Assistant has no shell.
- The `allowed-tools` frontmatter field is ignored.
