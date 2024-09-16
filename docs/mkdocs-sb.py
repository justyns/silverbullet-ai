import logging
import re
import mkdocs.plugins
import os.path

log = logging.getLogger('mkdocs')

root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__)))

def find_target_file(root_dir, link):
    # Implement the logic to find the target file
    # This is a placeholder implementation
    potential_path = os.path.join(root_dir, f"{link}.md")
    return potential_path if os.path.exists(potential_path) else None

def replace_wiki_link(match, root_dir, page):
    # Wiki links in silverbullet are always relative from the root space directory
    link = match.group(1).strip()
    alias = match.group(2).strip() if len(match.groups()) > 1 and match.group(2) else os.path.basename(link)
    target_path = find_target_file(root_dir, link)
    log.info(f"target_path: {target_path}")
    log.info(f"page.file.abs_src_path: {page.file.abs_src_path}")
    if target_path:
        relative_path = os.path.relpath(target_path, os.path.dirname(os.path.dirname(page.file.abs_src_path)))
        log.info(f"wiki link: {link} -> {relative_path}")
        return f'[{alias}]({relative_path})'
    else:
        log.warning(f"Target file not found for wiki link: {link}")
        return f'[{alias}]({link}.md)'

def convert_admonitions(markdown):
    # Convert blockquotes with bold headers to MkDocs-style admonitions
    # Matches lines starting with "> **Header**:" and captures the header and content
    return re.sub(r'^> \*\*([\w\s]+)\*\*:\s*(.*(?:\n(?!>).*)*)', r'!!! \1\n\n    \2', markdown, flags=re.MULTILINE)

def process_links(markdown, root_dir, page):
    # Convert wiki-style links [[Page]] or [[Page|Alias]] to Markdown links
    # Captures the page name and optional alias, then calls replace_wiki_link function
    return re.sub(r'\[\[([^|\]]+)(?:\|([^\]]+))?\]\]', lambda m: replace_wiki_link(m, root_dir, page), markdown)

@mkdocs.plugins.event_priority(-50)
def on_page_markdown(markdown, page, **kwargs):
    markdown = process_links(markdown, root_dir, page)
    markdown = convert_admonitions(markdown)
    return markdown