// Explicit one-shot installer: never runs at server startup or touches config pages.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
const hash = (data) => createHash("sha256").update(data).digest("hex");
const files = ["_plug/silverbullet-ai.plug.js", "silverbullet-ai-library.md"];
export async function installPlug(space, source, update = false) {
  const manifest = join(space, ".sbai-deployment.json");
  let previous = {};
  try {
    previous = JSON.parse(await readFile(manifest, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const data = await Promise.all(
    files.map((file) => readFile(join(source, file.split("/").at(-1)))),
  );
  // Preflight every file before changing anything. Only our own unchanged artifacts can be upgraded.
  for (const [index, file] of files.entries()) {
    try {
      const current = await readFile(join(space, file));
      if (hash(current) === hash(data[index])) continue;
      if (!update || previous[file] !== hash(current))
        throw new Error(
          `Refusing to overwrite ${file}; preserve/migrate existing installations manually`,
        );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  await mkdir(join(space, "_plug"), { recursive: true });
  const next = {};
  for (const [index, file] of files.entries()) {
    await writeFile(join(space, file), data[index]);
    next[file] = hash(data[index]);
  }
  await writeFile(manifest, JSON.stringify(next, null, 2) + "\n", {
    mode: 0o600,
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const source = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
  await installPlug(
    resolve(process.argv[2] ?? "/install-space"),
    source,
    process.argv.includes("--update"),
  );
  console.log(
    "Installed the local plug and its Space Lua library; no configuration pages changed.",
  );
}
