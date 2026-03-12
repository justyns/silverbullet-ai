// Mock for @silverbulletmd/silverbullet/lib/frontmatter
// This specifier is not exported by the npm package; provide a stub for tests.
export async function extractFrontMatter(_tree: any, _options?: any): Promise<Record<string, any>> {
  return {};
}
