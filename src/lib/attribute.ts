import { parse as parseYAML } from "yaml";
import type { ParseTree } from "@silverbulletmd/silverbullet/lib/tree";
import { renderToText } from "@silverbulletmd/silverbullet/lib/tree";

export async function extractAttributes(
  tree: ParseTree,
): Promise<Record<string, any>> {
  const attrs: Record<string, any> = {};

  function walk(node: ParseTree) {
    if (node.type === "Attribute") {
      const nameNode = node.children?.find((c) => c.type === "AttributeName");
      const valueNode = node.children?.find((c) => c.type === "AttributeValue");
      if (nameNode && valueNode) {
        const name = renderToText(nameNode);
        const valueStr = renderToText(valueNode);
        try {
          attrs[name] = parseYAML(valueStr);
        } catch {
          attrs[name] = valueStr;
        }
      }
      return; // don't descend into Attribute children
    }
    if (node.children) {
      for (const child of node.children) walk(child);
    }
  }

  walk(tree);
  return attrs;
}
