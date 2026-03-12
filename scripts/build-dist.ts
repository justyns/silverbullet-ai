import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execSync } from "node:child_process";

const DIST_DIR = "dist";
const LIBRARY_DIR = "silverbullet-ai";
const PLUG_JS = "silverbullet-ai.plug.js";
const PLUG_MD = "PLUG.md";
const CHANGELOG_MD = "docs/Changelog.md";
const COMBINED_LIBRARY = "silverbullet-ai-library.md";

async function* walk(dir: string): AsyncGenerator<{ path: string }> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
    } else {
      yield { path: fullPath };
    }
  }
}

async function emptyDir(dir: string) {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
}

function getVersion(): string {
  return execSync("git describe --tags --always").toString().trim();
}

function extractRecentChangelog(changelog: string, version: string): string {
  const versionMatch = version.match(/^(\d+\.\d+)/);
  if (!versionMatch) return "";
  const minorPrefix = versionMatch[1];

  const lines = changelog.split("\n");
  const result: string[] = [];
  let inMatchingVersion = false;

  for (const line of lines) {
    if (line.startsWith("## ") && line.includes("(")) {
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

  const libraryFiles: LibraryFile[] = [];

  for await (const entry of walk(LIBRARY_DIR)) {
    const relativePath = entry.path.replace(`${LIBRARY_DIR}/`, "");
    const content = await readFile(entry.path, "utf-8");
    libraryFiles.push({ path: relativePath, content });
  }

  libraryFiles.sort((a, b) => {
    const aIsSpaceLua = a.path.startsWith("Space Lua/");
    const bIsSpaceLua = b.path.startsWith("Space Lua/");
    if (aIsSpaceLua && !bIsSpaceLua) return -1;
    if (!aIsSpaceLua && bIsSpaceLua) return 1;
    if (a.path.includes("AI Config")) return -1;
    if (b.path.includes("AI Config")) return 1;
    return a.path.localeCompare(b.path);
  });

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
    const heading = file.path.replace(/\.md$/, "").replace(/\//g, " / ");
    combinedContent += `## ${heading}\n\n`;

    let fileContent = file.content;
    if (fileContent.startsWith("---")) {
      const endOfFrontmatter = fileContent.indexOf("---", 3);
      if (endOfFrontmatter !== -1) {
        fileContent = fileContent.slice(endOfFrontmatter + 3).trim();
      }
    }

    combinedContent += fileContent + "\n\n";
  }

  await writeFile(join(DIST_DIR, COMBINED_LIBRARY), combinedContent, "utf-8");
  console.log(`✓ Created ${DIST_DIR}/${COMBINED_LIBRARY}`);

  const version = getVersion();
  const plugMdContent = await readFile(PLUG_MD, "utf-8");
  const changelogContent = await readFile(CHANGELOG_MD, "utf-8");
  const recentChangelog = extractRecentChangelog(changelogContent, version);

  const enhancedPlugMd = plugMdContent.trimEnd() + `

## Version

Current version: **${version}**

## Recent Changes

${recentChangelog}

For the full changelog, see https://github.com/justyns/silverbullet-ai/releases
`;

  await writeFile(join(DIST_DIR, PLUG_MD), enhancedPlugMd, "utf-8");
  console.log(`✓ Created ${PLUG_MD} (version: ${version})`);

  await copyFile(PLUG_JS, join(DIST_DIR, PLUG_JS));
  console.log(`✓ Copied ${PLUG_JS}`);

  console.log(`\nDist files ready in ${DIST_DIR}/`);
  console.log(`Files: ${PLUG_MD}, ${PLUG_JS}, ${COMBINED_LIBRARY}`);
}

main();
