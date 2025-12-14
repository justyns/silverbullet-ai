"""Mkdocs hooks and macros for plug documentation."""

import logging
import os.path
import re
from pathlib import Path

import mkdocs.plugins

log = logging.getLogger("mkdocs")
root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "docs"))


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
