#!/usr/bin/env -S deno run --allow-read --allow-write
/**
 * Build script to create dist files for GitHub releases.
 * Combines all library Space Lua files into a single file
 */

import { walk } from "jsr:@std/fs@1/walk";
import { emptyDir } from "jsr:@std/fs@1/empty-dir";
import { join } from "jsr:@std/path@1";

const DIST_DIR = "dist";
const LIBRARY_DIR = "silverbullet-ai";
const PLUG_JS = "silverbullet-ai.plug.js";
const PLUG_MD = "PLUG.md";
const COMBINED_LIBRARY = "silverbullet-ai-library.md";

interface LibraryFile {
  path: string;
  content: string;
}

async function main() {
  await emptyDir(DIST_DIR);

  // Collect all library files
  const libraryFiles: LibraryFile[] = [];

  for await (const entry of walk(LIBRARY_DIR, { includeDirs: false })) {
    const relativePath = entry.path.replace(`${LIBRARY_DIR}/`, "");
    const content = await Deno.readTextFile(entry.path);
    libraryFiles.push({
      path: relativePath,
      content: content,
    });
  }

  // Sort for consistent ordering - put Space Lua config first
  libraryFiles.sort((a, b) => {
    // Prioritize Space Lua files, then sort alphabetically
    const aIsSpaceLua = a.path.startsWith("Space Lua/");
    const bIsSpaceLua = b.path.startsWith("Space Lua/");
    if (aIsSpaceLua && !bIsSpaceLua) return -1;
    if (!aIsSpaceLua && bIsSpaceLua) return 1;
    // Put AI Config first within Space Lua
    if (a.path.includes("AI Config")) return -1;
    if (b.path.includes("AI Config")) return 1;
    return a.path.localeCompare(b.path);
  });

  // Build combined library file
  let combinedContent = `---
tags:
- meta
- silverbullet-ai
---
# SilverBullet AI Library

This file contains all the Space Lua code, widgets, and AI prompt templates for the silverbullet-ai plug.

Install by copying this file to your space, or use \`Library: Install\` with \`ghr:justyns/silverbullet-ai/PLUG.md\`.

`;

  for (const file of libraryFiles) {
    // Clean heading: remove .md extension, replace / with " / "
    const heading = file.path.replace(/\.md$/, "").replace(/\//g, " / ");
    combinedContent += `## ${heading}\n\n`;

    // Strip frontmatter from individual files but keep the content
    let fileContent = file.content;
    if (fileContent.startsWith("---")) {
      const endOfFrontmatter = fileContent.indexOf("---", 3);
      if (endOfFrontmatter !== -1) {
        fileContent = fileContent.slice(endOfFrontmatter + 3).trim();
      }
    }

    combinedContent += fileContent + "\n\n";
  }

  // Write combined library file
  await Deno.writeTextFile(join(DIST_DIR, COMBINED_LIBRARY), combinedContent);
  console.log(`✓ Created ${DIST_DIR}/${COMBINED_LIBRARY}`);

  // Copy PLUG.md to dist
  await Deno.copyFile(PLUG_MD, join(DIST_DIR, PLUG_MD));
  console.log(`✓ Copied ${PLUG_MD}`);

  // Copy plug.js to dist
  await Deno.copyFile(PLUG_JS, join(DIST_DIR, PLUG_JS));
  console.log(`✓ Copied ${PLUG_JS}`);

  console.log(`\nDist files ready in ${DIST_DIR}/`);
  console.log(`Files: ${PLUG_MD}, ${PLUG_JS}, ${COMBINED_LIBRARY}`);
}

main();
