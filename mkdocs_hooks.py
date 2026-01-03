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

# Files to exclude from llms.txt
EXCLUDED_FILES = {
    "index.md",
    "Features.md",
    "Providers.md",
    "Commands.md",
    "mcp-server-design.md",
    "v2-migration-status.md",
}

# Category ordering and grouping
CATEGORY_ORDER = [
    "Getting Started",
    "Core Features",
    "Configuration",
    "Providers",
    "Optional",
    "SilverBullet References",
]

# Categories to skip entirely
SKIP_CATEGORIES = {"Commands"}

# Map docs to categories (files not listed go to "Optional")
DOC_CATEGORY_MAP = {
    "Getting Started": ["Quick Start", "Installation"],
    "Core Features": [
        "Configuration",
        "Templated Prompts",
        "Bundled Prompts",
        "Agents",
        "Tools",
        "Context Enrichment",
    ],
    "Optional": [
        "Development",
        "Changelog",
        "Space Lua",
        "Recommended Models",
        "SilverBullet v2 Migration Guide",
    ],
}

# External SilverBullet documentation links
SILVERBULLET_DOCS = [
    ("Space Lua", "Lua scripting system for SilverBullet"),
    ("Space Lua/Lua Integrated Query", "Query language for data"),
    ("Space Lua/Widget", "Custom UI widgets"),
    ("Template", "Template system reference"),
    ("Library", "Library system and plugs"),
    ("Event", "SilverBullet events reference"),
    ("Frontmatter", "Page metadata format"),
    ("Object", "Object/attribute system"),
]


def strip_frontmatter(content: str) -> str:
    """Remove YAML frontmatter from markdown content."""
    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) > 2:
            return parts[2].strip()
    return content


def get_doc_url(doc_path: str, base_url: str = BASE_URL) -> str:
    """Generate URL for a doc path."""
    url_path = quote(doc_path, safe="/")
    return f"{base_url}/{url_path}/"


def get_doc_name(doc_path: str) -> str:
    """Extract display name from doc path."""
    return doc_path.split("/")[-1]


def extract_description(content: str) -> str:
    """Extract first meaningful line as description."""
    content = strip_frontmatter(content)
    for line in content.split("\n"):
        line = line.strip()
        if line and not line.startswith("#") and not line.startswith(">"):
            # Clean up markdown formatting
            line = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", line)  # Remove links
            line = re.sub(r"\*\*([^*]+)\*\*", r"\1", line)  # Remove bold
            line = re.sub(r"\*([^*]+)\*", r"\1", line)  # Remove italic
            line = re.sub(r"`([^`]+)`", r"\1", line)  # Remove code
            if len(line) > 100:
                line = line[:97] + "..."
            return line
    return ""


def read_doc_content(docs_dir: Path, doc_path: str) -> str:
    """Read and clean a doc file's content."""
    file_path = docs_dir / f"{doc_path}.md"
    if not file_path.exists():
        return ""
    content = file_path.read_text()
    return strip_frontmatter(content)


def discover_docs(docs_dir: Path) -> dict[str, list[tuple[str, str]]]:
    """Discover all docs and categorize them."""
    categories: dict[str, list[tuple[str, str]]] = {cat: [] for cat in CATEGORY_ORDER}

    # Find category for a doc name
    def get_category(name: str, subdir: str | None) -> str | None:
        if subdir == "Configuration":
            return "Configuration"
        if subdir == "Providers":
            return "Providers"
        if subdir == "Commands":
            return None  # Skip commands
        for cat, docs in DOC_CATEGORY_MAP.items():
            if name in docs:
                return cat
        return "Optional"

    # Scan docs directory
    for path in sorted(docs_dir.rglob("*.md")):
        if path.name in EXCLUDED_FILES:
            continue
        rel_path = path.relative_to(docs_dir)
        parts = rel_path.parts

        # Skip excluded directories
        if any(p.startswith("_") or p == "template" or p == "Library" for p in parts):
            continue

        doc_name = path.stem
        if len(parts) > 1:
            subdir = parts[0]
            doc_path = f"{subdir}/{doc_name}"
        else:
            subdir = None
            doc_path = doc_name

        category = get_category(doc_name, subdir)
        if category is None:
            continue  # Skip this doc
        content = path.read_text()
        description = extract_description(content)
        categories[category].append((doc_path, description))

    # Add SilverBullet external docs
    for doc_path, description in SILVERBULLET_DOCS:
        categories["SilverBullet References"].append((doc_path, description))

    return categories


def generate_llms_summary(docs_dir: Path) -> str:
    """Generate llms.txt with links to docs."""
    lines = [
        "# SilverBullet AI",
        "",
        "> SilverBullet AI is a plug for SilverBullet v2 that integrates LLMs for",
        "> AI-powered note-taking, chat, semantic search, and content generation.",
        "",
        "SilverBullet AI provides multi-turn chat, customizable AI agents with tools,",
        "RAG-powered context enrichment, templated prompts, and supports multiple",
        "providers (OpenAI, Ollama, Gemini, Mistral, OpenRouter, Perplexity).",
        "",
    ]

    categories = discover_docs(docs_dir)

    for category in CATEGORY_ORDER:
        docs = categories.get(category, [])
        if not docs:
            continue

        lines.append(f"## {category}")
        is_external = category == "SilverBullet References"

        for doc_path, description in docs:
            name = get_doc_name(doc_path)
            base = SB_BASE_URL if is_external else BASE_URL
            url = get_doc_url(doc_path, base)
            if description:
                lines.append(f"- [{name}]({url}): {description}")
            else:
                lines.append(f"- [{name}]({url})")
        lines.append("")

    return "\n".join(lines)


def generate_llms_full(docs_dir: Path) -> str:
    """Generate llms-full.txt with inlined content."""
    lines = [
        "# SilverBullet AI",
        "",
        "> SilverBullet AI is a plug for SilverBullet v2 that integrates LLMs for",
        "> AI-powered note-taking, chat, semantic search, and content generation.",
        "",
        "SilverBullet AI provides multi-turn chat, customizable AI agents with tools,",
        "RAG-powered context enrichment, templated prompts, and supports multiple",
        "providers (OpenAI, Ollama, Gemini, Mistral, OpenRouter, Perplexity).",
        "",
    ]

    categories = discover_docs(docs_dir)

    for category in CATEGORY_ORDER:
        docs = categories.get(category, [])
        if not docs:
            continue

        # Skip external docs for full content (we don't have their content)
        if category == "SilverBullet References":
            lines.append(f"## {category}")
            lines.append("")
            lines.append("See https://silverbullet.md for full SilverBullet documentation.")
            lines.append("")
            for doc_path, description in docs:
                name = get_doc_name(doc_path)
                url = get_doc_url(doc_path, SB_BASE_URL)
                lines.append(f"- [{name}]({url}): {description}")
            lines.append("")
            continue

        lines.append(f"## {category}")
        lines.append("")
        for doc_path, _ in docs:
            name = get_doc_name(doc_path)
            content = read_doc_content(docs_dir, doc_path)
            if content:
                lines.append(f"### {name}")
                lines.append("")
                lines.append(content)
                lines.append("")

    return "\n".join(lines)


def generate_llms_txt(docs_dir: Path) -> None:
    """Generate both llms.txt and llms-full.txt."""
    llms_path = docs_dir / "llms.txt"
    llms_full_path = docs_dir / "llms-full.txt"

    llms_content = generate_llms_summary(docs_dir)
    llms_path.write_text(llms_content)
    log.info(f"Generated {llms_path}")

    llms_full_content = generate_llms_full(docs_dir)
    llms_full_path.write_text(llms_full_content)
    log.info(f"Generated {llms_full_path}")


def on_pre_build(config):
    """Generate llms.txt and llms-full.txt before build."""
    docs_dir = Path(config["docs_dir"])
    generate_llms_txt(docs_dir)


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
    return re.sub(
        r'\[\[([^|\]]+)(?:\|([^\]]+))?\]\]',
        lambda m: replace_wiki_link(m, root_dir, page),
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
