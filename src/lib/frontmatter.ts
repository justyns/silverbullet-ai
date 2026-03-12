import { parse as parseYAML } from "yaml";
import type { ParseTree } from "@silverbulletmd/silverbullet/lib/tree";
import { renderToText } from "@silverbulletmd/silverbullet/lib/tree";

export interface FrontMatterOptions {
  removeFrontMatterSection?: boolean;
  removeKeys?: string[];
}

export async function extractFrontMatter(
  tree: ParseTree,
  options?: FrontMatterOptions,
): Promise<Record<string, any>> {
  if (!tree.children) return {};

  const frontMatterNode = tree.children.find(
    (c) => c.type === "FrontMatter",
  );
  if (!frontMatterNode) return {};

  // Get YAML text from FrontMatterBody child, or strip delimiters from the raw text
  const bodyNode = frontMatterNode.children?.find(
    (c) => c.type === "FrontMatterBody",
  );
  let yamlText: string;
  if (bodyNode) {
    yamlText = renderToText(bodyNode);
  } else {
    yamlText = renderToText(frontMatterNode)
      .replace(/^---\r?\n/, "")
      .replace(/\n---\s*$/, "");
  }

  let parsed: Record<string, any> = {};
  try {
    parsed = (parseYAML(yamlText) as Record<string, any>) || {};
  } catch {
    // malformed YAML — return empty
  }

  if (options?.removeFrontMatterSection) {
    const idx = tree.children.indexOf(frontMatterNode);
    if (idx !== -1) tree.children.splice(idx, 1);
  }

  return parsed;
}
