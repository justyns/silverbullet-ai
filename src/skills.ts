import { parse as parseYAML } from "yaml";

import { editor, index, lua, space } from "@silverbulletmd/silverbullet/syscalls";
import { base64Decode } from "@silverbulletmd/silverbullet/lib/crypto";
import { fileName, folderName } from "@silverbulletmd/silverbullet/lib/resolve";

import { aiSettings, initIfNeeded } from "./init.ts";
import type { ToolExecutionResult } from "./tools.ts";
import type { LuaToolDefinition } from "./types.ts";
import { jsToLuaLiteral, log } from "./utils.ts";

const SKILL_TAG = "meta/aiSkill";
export const SKILL_TOOL_NAME = "activate_skill";
const DEFAULT_SKILL_PATHS = ["Library/AISkills/"];

type Skill = {
  name: string;
  description: string;
  page: string;
  // Folder that relative paths in the skill resolve against
  dir: string;
  // share.uri the skill was imported from
  source?: string;
};

/** Throws on malformed YAML. */
export function splitFrontmatter(
  text: string,
): { frontmatter: Record<string, any>; body: string } {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match) return { frontmatter: {}, body: text.trim() };
  return {
    frontmatter: parseYAML(match[1]) ?? {},
    body: text.slice(match[0].length).trim(),
  };
}

function skillPaths(): string[] {
  const paths = aiSettings?.skills?.paths ?? DEFAULT_SKILL_PATHS;
  return paths.map((p) => p.replace(/\/?$/, "/"));
}

/**
 * Finds `<folder>/SKILL` pages under `ai.skills.paths` (https://agentskills.io/specification)
 * and pages tagged `#meta/aiSkill` anywhere. SKILL pages override tagged pages of the same name.
 */
export async function discoverSkills(): Promise<Skill[]> {
  const pages = await index.queryLuaObjects<
    { name: string; description?: string; itags?: string[] }
  >("page", {
    objectVariable: "_",
    where: await lua.parseExpression(
      `_.name:endsWith("/SKILL") or (_.itags and table.includes(_.itags, "${SKILL_TAG}"))`,
    ),
  });

  const paths = skillPaths();
  const isSkillPage = (name: string) =>
    name.endsWith("/SKILL") && paths.some((p) => name.startsWith(p));

  const skillPages = await Promise.all(
    pages.filter((p) => isSkillPage(p.name)).map((p) => readSkillPage(p.name)),
  );

  const taggedPages: Skill[] = [];
  for (const page of pages) {
    if (isSkillPage(page.name) || !page.itags?.includes(SKILL_TAG)) continue;
    if (!page.description) {
      log.warn(`Skipping skill ${page.name}: missing description`);
      continue;
    }
    taggedPages.push({
      name: fileName(page.name),
      description: page.description,
      page: page.name,
      dir: page.name,
    });
  }

  const skills = new Map<string, Skill>();
  for (const skill of [...skillPages.filter((s) => s !== null), ...taggedPages]) {
    const existing = skills.get(skill.name);
    if (existing) {
      log.warn(
        `Skill "${skill.name}" at ${skill.page} is shadowed by ${existing.page}`,
      );
      continue;
    }
    skills.set(skill.name, skill);
  }
  return [...skills.values()];
}

async function readSkillPage(page: string): Promise<Skill | null> {
  const dir = folderName(page);
  const folder = fileName(dir);
  let frontmatter: Record<string, any>;
  try {
    frontmatter = splitFrontmatter(await space.readPage(page)).frontmatter;
  } catch (e) {
    log.error(`Skipping skill ${page}: invalid frontmatter`, e);
    return null;
  }
  if (!frontmatter.description) {
    log.warn(`Skipping skill ${page}: missing description`);
    return null;
  }
  const name = String(frontmatter.name || folder);
  if (name !== folder) {
    log.warn(`Skill name "${name}" does not match its folder ${dir}`);
  }
  return {
    name,
    description: String(frontmatter.description),
    page,
    dir,
    source: frontmatter["share.uri"],
  };
}

export function buildSkillTool(skills: Skill[]): LuaToolDefinition {
  const catalog = skills
    .map((s) => `- ${s.name}: ${s.description}`)
    .join("\n");
  return {
    description:
      "Load a skill's full instructions. When a task matches one of the skills below, call this with the skill's name before starting the task. " +
      "To read a file bundled with a loaded skill, pass its relative path as `file`.\n\n" +
      `Available skills:\n${catalog}`,
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          enum: skills.map((s) => s.name),
          description: "Skill name",
        },
        file: {
          type: "string",
          description:
            "Optional: path of a bundled file relative to the skill folder, e.g. references/REFERENCE.md",
        },
      },
      required: ["name"],
    },
    handler: "",
    source: "skill",
    readOnly: true,
    execute: (args) => executeSkillTool(skills, args),
  };
}

async function executeSkillTool(
  skills: Skill[],
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const skill = skills.find((s) => s.name === args.name);
  if (!skill) {
    return { success: false, error: `Unknown skill: ${args.name}` };
  }

  const file = args.file as string | undefined;
  if (file) {
    if (file.split("/").includes("..")) {
      return { success: false, error: `Invalid skill file path: ${file}` };
    }
    const path = `${skill.dir}/${file}`;
    if (!(await space.fileExists(path))) {
      return { success: false, error: `File not found: ${path}` };
    }
    const content = new TextDecoder().decode(await space.readFile(path));
    return {
      success: true,
      result: content,
      summary: `Read ${file} from skill ${skill.name}`,
    };
  }

  const { body } = splitFrontmatter(await space.readPage(skill.page));
  const ownFile = `${skill.page}.md`;
  const resources = (await space.listFiles())
    .map((f) => f.name)
    .filter((n) => n.startsWith(`${skill.dir}/`) && n !== ownFile)
    .map((n) => n.slice(skill.dir.length + 1));

  const lines = [
    `<skill_content name="${skill.name}">`,
    body,
    "",
    `Skill folder: ${skill.dir}`,
    `Relative paths in this skill are relative to the skill folder. Read them with ${SKILL_TOOL_NAME}'s file parameter.`,
  ];
  if (resources.length > 0) {
    lines.push(
      "<skill_resources>",
      ...resources.map((r) => `  <file>${r}</file>`),
      "</skill_resources>",
    );
  }
  lines.push("</skill_content>");

  return {
    success: true,
    result: lines.join("\n"),
    summary: `Activated skill ${skill.name}`,
  };
}

type GitHubSkillLocation = {
  owner: string;
  repo: string;
  ref: string;
  dir: string;
};

/** Accepts `/tree/<ref>/<dir>` and `/blob/<ref>/<dir>/SKILL.md` URLs. Refs containing `/` are not supported. */
export function parseGitHubSkillUrl(url: string): GitHubSkillLocation | null {
  const match = url.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:tree|blob)\/([^/]+)\/(.+?)(?:\/SKILL\.md)?\/?$/,
  );
  if (!match) return null;
  const [, owner, repo, ref, dir] = match;
  return { owner, repo, ref, dir };
}

async function readUriAsText(uri: string): Promise<string> {
  const result = await lua.evalExpression(
    `net.readURI(${jsToLuaLiteral(uri)}, {encoding="text/markdown"})`,
  );
  if (typeof result !== "string") {
    throw new Error(`Could not fetch ${uri}`);
  }
  return result;
}

async function readUriAsBytes(uri: string): Promise<Uint8Array> {
  const b64 = await lua.evalExpression(
    `encoding.base64Encode(net.readURI(${jsToLuaLiteral(uri)}, {encoding="application/octet-stream"}))`,
  );
  if (typeof b64 !== "string") {
    throw new Error(`Could not fetch ${uri}`);
  }
  return base64Decode(b64);
}

function githubBlobBase(gh: GitHubSkillLocation): string {
  return `https://github.com/${gh.owner}/${gh.repo}/blob/${gh.ref}/`;
}

async function downloadBundledFiles(
  gh: GitHubSkillLocation,
  dir: string,
): Promise<void> {
  const listing = await lua.evalExpression(
    `net.readURI(${jsToLuaLiteral(`https://api.github.com/repos/${gh.owner}/${gh.repo}/git/trees/${gh.ref}?recursive=1`)})`,
  ) as { tree: { path: string; type: string }[] };
  const prefix = `${gh.dir}/`;
  const files = listing.tree.filter((e) =>
    e.type === "blob" && e.path.startsWith(prefix) &&
    e.path !== `${prefix}SKILL.md`
  );
  await Promise.all(files.map(async (e) => {
    const data = await readUriAsBytes(`${githubBlobBase(gh)}${e.path}`);
    await space.writeFile(`${dir}/${e.path.slice(prefix.length)}`, data);
  }));
}

/**
 * Imports into the first `ai.skills.paths` entry, with SilverBullet share frontmatter
 * (`share.uri`, pull mode) on the SKILL page. Returns the SKILL page name, or null if
 * the user declined to overwrite an existing skill.
 */
export async function importSkill(uri: string): Promise<string | null> {
  const gh = parseGitHubSkillUrl(uri);
  const skillUri = gh ? `${githubBlobBase(gh)}${gh.dir}/SKILL.md` : uri;
  const text = await readUriAsText(skillUri);

  const name = splitFrontmatter(text).frontmatter.name;
  if (typeof name !== "string" || !/^[A-Za-z0-9_-]+$/.test(name)) {
    throw new Error(`SKILL.md has a missing or invalid name: ${name}`);
  }

  const dir = `${skillPaths()[0]}${name}`;
  const page = `${dir}/SKILL`;
  if (
    (await space.pageExists(page)) &&
    !(await editor.confirm(`Skill ${name} already exists. Overwrite it?`))
  ) {
    return null;
  }
  const shared = await lua.evalExpression(
    `(function(t)
      return share.setFrontmatter({uri=${jsToLuaLiteral(skillUri)}, mode="pull", hash=share.contentHash(t)}, t)
    end)(${jsToLuaLiteral(text)})`,
  ) as string;
  await space.writePage(page, shared);

  if (gh) {
    await downloadBundledFiles(gh, dir);
  }
  return page;
}

/**
 * Pulls the SKILL page through SilverBullet's share framework, then re-downloads bundled
 * files for GitHub skills. Returns false when the skill was already up to date or the user
 * kept local edits.
 */
export async function updateSkill(name: string): Promise<boolean> {
  const skill = (await discoverSkills()).find((s) => s.name === name);
  if (!skill?.source) {
    throw new Error(`Skill ${name} has no share.uri to update from`);
  }
  const changed = await lua.evalExpression(
    `share.sharePage(${jsToLuaLiteral(skill.page)})`,
  ) as boolean;
  const gh = parseGitHubSkillUrl(skill.source);
  if (changed && gh) {
    await downloadBundledFiles(gh, skill.dir);
  }
  return changed;
}

export async function importSkillCommand() {
  await initIfNeeded();
  const uri = await editor.prompt(
    "Skill URI (a GitHub skill folder, or any URI to a SKILL.md):",
  );
  if (!uri) return;
  try {
    const page = await importSkill(uri.trim());
    if (page) {
      await editor.flashNotification(`Imported skill to ${page}`);
    }
  } catch (e) {
    log.error("Error importing skill:", e);
    await editor.flashNotification(`Skill import failed: ${e}`, "error");
  }
}

export async function updateSkillCommand() {
  await initIfNeeded();
  const skills = (await discoverSkills()).filter((s) => s.source);
  if (skills.length === 0) {
    await editor.flashNotification("No imported skills to update", "error");
    return;
  }
  const selected = await editor.filterBox(
    "Update Skill",
    skills.map((s) => ({ name: s.name, description: s.source })),
  );
  if (!selected) return;
  try {
    const changed = await updateSkill(selected.name);
    await editor.flashNotification(
      changed
        ? `Updated skill ${selected.name}`
        : `Skill ${selected.name} not changed`,
    );
  } catch (e) {
    log.error("Error updating skill:", e);
    await editor.flashNotification(`Skill update failed: ${e}`, "error");
  }
}
