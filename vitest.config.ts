import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@silverbulletmd/silverbullet/lib/attribute": resolve(
        __dirname,
        "src/mocks/silverbullet-lib-attribute.ts",
      ),
      "@silverbulletmd/silverbullet/lib/frontmatter": resolve(
        __dirname,
        "src/mocks/silverbullet-lib-frontmatter.ts",
      ),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["e2e-tests/**", "node_modules/**"],
  },
});
