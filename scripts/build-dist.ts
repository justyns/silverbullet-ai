#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run
/**
 * Build script to create dist files for GitHub releases.
 * Combines all library Space Lua files into a single file
 */

import { walk } from "@std/fs/walk";
import { emptyDir } from "@std/fs/empty-dir";
import { join } from "@std/path";

const DIST_DIR = "dist";
const LIBRARY_DIR = "silverbullet-ai";
const PLUG_JS = "silverbullet-ai.plug.js";
const PLUG_MD = "PLUG.md";
const CHANGELOG_MD = "docs/Changelog.md";
const COMBINED_LIBRARY = "silverbullet-ai-library.md";

async function getVersion(): Promise<string> {
  const command = new Deno.Command("git", {
    args: ["describe", "--tags", "--always"],
    stdout: "piped",
    stderr: "piped",
  });
  const { stdout } = await command.output();
  return new TextDecoder().decode(stdout).trim();
}

function extractRecentChangelog(changelog: string, version: string): string {
  // Extract major.minor from version (e.g., "0.6" from "0.6.1" or "0.6.1-5-gabcdef")
  const versionMatch = version.match(/^(\d+\.\d+)/);
  if (!versionMatch) return "";
  const minorPrefix = versionMatch[1];

  const lines = changelog.split("\n");
  const result: string[] = [];
  let inMatchingVersion = false;

  for (const line of lines) {
    if (line.startsWith("## ") && line.includes("(")) {
      // Check if this version header matches our minor version
      const headerMatch = line.match(/^## (\d+\.\d+)/);
      if (headerMatch) {
        if (headerMatch[1] === minorPrefix) {
          inMatchingVersion = true;
        } else {
          break;
        }
      }
    }
    if (inMatchingVersion) {
      if (line.startsWith("---")) break;
      // Demote ## headers to ### for proper nesting under "## Recent Changes"
      if (line.startsWith("## ")) {
        result.push("#" + line);
      } else {
        result.push(line);
      }
    }
  }

  return result.join("\n").trim();
}

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

  // Generate PLUG.md with version and changelog
  const version = await getVersion();
  const plugMdContent = await Deno.readTextFile(PLUG_MD);
  const changelogContent = await Deno.readTextFile(CHANGELOG_MD);
  const recentChangelog = extractRecentChangelog(changelogContent, version);

  const enhancedPlugMd = plugMdContent.trimEnd() + `

## Version

Current version: **${version}**

## Recent Changes

${recentChangelog}

For the full changelog, see https://github.com/justyns/silverbullet-ai/releases
`;

  await Deno.writeTextFile(join(DIST_DIR, PLUG_MD), enhancedPlugMd);
  console.log(`✓ Created ${PLUG_MD} (version: ${version})`);

  // Copy plug.js to dist
  await Deno.copyFile(PLUG_JS, join(DIST_DIR, PLUG_JS));
  console.log(`✓ Copied ${PLUG_JS}`);

  console.log(`\nDist files ready in ${DIST_DIR}/`);
  console.log(`Files: ${PLUG_MD}, ${PLUG_JS}, ${COMBINED_LIBRARY}`);
}

main();
