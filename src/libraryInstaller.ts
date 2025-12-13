import { lua, markdown, space } from "@silverbulletmd/silverbullet/syscalls";
import { extractFrontMatter } from "@silverbulletmd/silverbullet/lib/frontmatter";
import { log } from "./utils.ts";

const PLUG_PAGE = "Library/justyns/silverbullet-ai";
const LIB_PAGE = "Library/justyns/AICore";
const REPO = "justyns/silverbullet-ai";
const AICORE_PATH = "Library/AICore.md";

/**
 * Extract branch/tag from various URI formats:
 * - ghr:owner/repo@version/path -> version
 * - github:owner/repo@branch/path -> branch
 * - github:owner/repo/path -> "main"
 * - https://github.com/owner/repo/blob/branch/path -> branch
 */
function extractBranchOrTag(uri: string): string {
  // ghr:owner/repo@version/path
  const ghrMatch = uri.match(/^ghr:[^@]+@([^\/]+)\//);
  if (ghrMatch) {
    return ghrMatch[1];
  }

  // github:owner/repo@branch/path
  const githubWithBranch = uri.match(/^github:[^@]+@([^\/]+)\//);
  if (githubWithBranch) {
    return githubWithBranch[1];
  }

  // github:owner/repo/path (no branch)
  if (uri.startsWith("github:") && !uri.includes("@")) {
    return "main";
  }

  // https://github.com/owner/repo/blob/branch/path
  const httpsMatch = uri.match(/github\.com\/[^\/]+\/[^\/]+\/blob\/([^\/]+)\//);
  if (httpsMatch) {
    return httpsMatch[1];
  }

  return "main";
}

/**
 * Install the AICore library using the same version/branch as the plug.
 * Uses the github: URI scheme to fetch from repo (not release assets).
 */
export async function installAICoreLibrary(): Promise<void> {
  try {
    // Check if plug page exists (was installed via Library Manager)
    const plugExists = await space.pageExists(PLUG_PAGE);
    if (!plugExists) {
      log("Plug page not found, skipping AICore library auto-install");
      return;
    }

    const plugPageText = await space.readPage(PLUG_PAGE);
    const tree = await markdown.parseMarkdown(plugPageText);
    const frontmatter = await extractFrontMatter(tree);

    if (!frontmatter?.share?.uri) {
      log(
        "Plug not installed via Library Manager, skipping AICore library auto-install",
      );
      return;
    }

    // Extract branch/tag from the plug's install URI
    const branchOrTag = extractBranchOrTag(frontmatter.share.uri);

    // Construct AICore URI using github: scheme (always from repo, not release)
    const aicoreUri = `github:${REPO}@${branchOrTag}/${AICORE_PATH}`;

    // Check if already installed with this URI
    const installed = await lua.evalExpression(
      `library.getInstalled("${aicoreUri}")`,
    );

    if (installed) {
      log("AICore already installed");
      return;
    }

    // Check if AICore exists at a different URI (different version)
    const aicorePageExists = await space.pageExists(LIB_PAGE);
    if (aicorePageExists) {
      log("AICore exists, not updating automatically");
      // TODO: Should we update it automatically or assume the user will update using the library manager?
      return;
    }

    log(`Installing AICore library from ${aicoreUri}`);
    await lua.evalExpression(`library.install("${aicoreUri}")`);
    log("AICore library installed");
  } catch (e) {
    console.error("Failed to auto-install AICore library:", e);
  }
}
