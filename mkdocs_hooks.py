"""Mkdocs hooks and macros for plug documentation."""

import logging
import os.path
import re
from pathlib import Path
from urllib.parse import quote

import mkdocs.plugins

log = logging.getLogger("mkdocs")
root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "docs"))

# llms.txt configuration
BASE_URL = "https://ai.silverbullet.md"
SB_BASE_URL = "https://silverbullet.md"
SKIP_DIRS = {"Commands", "Library", "template"}
SKIP_FILES = {"index.md", "Features.md", "Providers.md", "Commands.md", "mcp-server-design.md", "v2-migration-status.md"}
HEADER = """\
# SilverBullet AI

> SilverBullet AI is a plug for SilverBullet v2 that integrates LLMs for
> AI-powered note-taking, chat, semantic search, and content generation.

SilverBullet AI provides multi-turn chat, customizable AI agents with tools,
RAG-powered context enrichment, templated prompts, and supports multiple
providers (OpenAI, Ollama, Gemini, Mistral, OpenRouter, Perplexity).

"""
SB_DOCS = [
    ("Space Lua", "Lua scripting system for SilverBullet"),
    ("Space Lua/Lua Integrated Query", "Query language for data"),
    ("Space Lua/Widget", "Custom UI widgets"),
    ("Template", "Template system reference"),
    ("Library", "Library system and plugs"),
    ("Event", "SilverBullet events reference"),
    ("Frontmatter", "Page metadata format"),
    ("Object", "Object/attribute system"),
]
DOC_ORDER = ["Quick Start", "Installation", "Configuration", "Templated Prompts", "Bundled Prompts", "Agents", "Tools", "Context Enrichment"]


def strip_frontmatter(content: str) -> str:
    if content.startswith("---"):
        parts = content.split("---", 2)
        return parts[2].strip() if len(parts) > 2 else content
    return content


def extract_description(content: str) -> str:
    for line in strip_frontmatter(content).split("\n"):
        line = line.strip()
        if line and not line.startswith(("#", ">")):
            line = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", line)
            line = re.sub(r"[*`]([^*`]+)[*`]", r"\1", line)
            return line[:97] + "..." if len(line) > 100 else line
    return ""


def discover_docs(docs_dir: Path) -> dict[str, list[tuple[str, str, str]]]:
    categories: dict[str, list[tuple[str, str, str]]] = {"Core": [], "Configuration": [], "Providers": [], "Optional": []}
    for path in docs_dir.rglob("*.md"):
        if path.name in SKIP_FILES or any(d in path.parts for d in SKIP_DIRS) or path.name.startswith("_"):
            continue
        rel = path.relative_to(docs_dir)
        subdir = rel.parts[0] if len(rel.parts) > 1 else None
        cat = subdir if subdir in ("Configuration", "Providers") else "Core" if path.stem in DOC_ORDER else "Optional"
        content = path.read_text()
        doc_path = f"{subdir}/{path.stem}" if subdir else path.stem
        categories[cat].append((doc_path, extract_description(content), content))
    for cat in categories:
        order = {name: i for i, name in enumerate(DOC_ORDER)}
        categories[cat].sort(key=lambda x: (order.get(x[0].split("/")[-1], 999), x[0]))
    return categories


def generate_llms_txt(docs_dir: Path, full: bool = False) -> str:
    lines = [HEADER]
    categories = discover_docs(docs_dir)
    for cat in ["Core", "Configuration", "Providers", "Optional"]:
        if not categories.get(cat):
            continue
        lines.append(f"## {cat}\n" if not full else f"## {cat}\n")
        for doc_path, desc, content in categories[cat]:
            name = doc_path.split("/")[-1]
            url = f"{BASE_URL}/{quote(doc_path, safe='/')}/"
            if full:
                lines.extend([f"### {name}\n", strip_frontmatter(content), ""])
            else:
                lines.append(f"- [{name}]({url}): {desc}" if desc else f"- [{name}]({url})")
        lines.append("")
    lines.append("## SilverBullet References\n")
    if full:
        lines.append("See https://silverbullet.md for full SilverBullet documentation.\n")
    for doc_path, desc in SB_DOCS:
        url = f"{SB_BASE_URL}/{quote(doc_path, safe='/')}/"
        lines.append(f"- [{doc_path.split('/')[-1]}]({url}): {desc}")
    return "\n".join(lines)


def on_pre_build(config):
    docs_dir = Path(config["docs_dir"])
    (docs_dir / "llms.txt").write_text(generate_llms_txt(docs_dir))
    (docs_dir / "llms-full.txt").write_text(generate_llms_txt(docs_dir, full=True))
    log.info("Generated llms.txt and llms-full.txt")


def define_env(env):
    """Define mkdocs-macros environment with custom macros."""
    docs_dir = Path(env.conf["docs_dir"])

    @env.macro
    def include_file(path: str) -> str:
        """Include content from another markdown file (transclusion)."""
        file_path = docs_dir / f"{path}.md"
        if not file_path.exists():
            return f"<!-- File not found: {path} -->"

        content = file_path.read_text()
        if content.startswith("---"):
            parts = content.split("---", 2)
            if len(parts) > 2:
                return parts[2].strip()
        return content


def find_target_file(root_dir, link):
    potential_path = os.path.join(root_dir, f"{link}.md")
    return potential_path if os.path.exists(potential_path) else None


def replace_wiki_link(match, root_dir, page):
    link = match.group(1).strip()
    alias = (
        match.group(2).strip()
        if len(match.groups()) > 1 and match.group(2)
        else os.path.basename(link)
    )
    target_path = find_target_file(root_dir, link)
    if target_path:
        relative_path = os.path.relpath(
            target_path, os.path.dirname(page.file.abs_src_path)
        )
        return f"[{alias}]({relative_path})"
    else:
        log.warning(f"Target file not found for wiki link: {link}")
        return f"[{alias}]({link}.md)"


def convert_admonitions(markdown):
    return re.sub(
        r'^> \*\*([\w\s]+)\*\*:\s*(.*(?:\n(?!>).*)*)',
        r'!!! \1\n\n    \2',
        markdown,
        flags=re.MULTILINE,
    )


def process_links(markdown, root_dir, page):
    def replacer(m):
        # If it's a code block or inline code, leave it unchanged
        if m.group(0).startswith('`'):
            return m.group(0)
        # Otherwise it's a wiki link - convert it
        return replace_wiki_link(m, root_dir, page)

    return re.sub(
        r'```[\s\S]*?```|`[^`]+`|\[\[([^|\]]+)(?:\|([^\]]+))?\]\]',
        replacer,
        markdown,
    )


def process_image_embeds(markdown, root_dir, page):
    def replace_image(match):
        path = match.group(1).strip()
        image_path = os.path.join(root_dir, path)
        if os.path.exists(image_path):
            relative_path = os.path.relpath(
                image_path, os.path.dirname(page.file.abs_src_path)
            )
            return f"![]({relative_path})"
        return f"![]({path})"

    return re.sub(r'!\[\[([^\]]+)\]\]', replace_image, markdown)


@mkdocs.plugins.event_priority(-50)
def on_page_markdown(markdown, page, **kwargs):
    markdown = process_image_embeds(markdown, root_dir, page)
    markdown = process_links(markdown, root_dir, page)
    markdown = convert_admonitions(markdown)
    return markdown
