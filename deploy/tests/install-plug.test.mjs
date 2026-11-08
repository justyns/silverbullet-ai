import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installPlug } from "../install-plug.mjs";
test("installs local artifacts, protects config and edits, and upgrades only managed files", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "sbai-install-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const source = join(dir, "dist"),
    space = join(dir, "space");
  await mkdir(source);
  await mkdir(space);
  await writeFile(join(source, "silverbullet-ai.plug.js"), "plug1");
  await writeFile(join(source, "silverbullet-ai-library.md"), "library1");
  await writeFile(join(space, "CONFIG.md"), "my settings");
  await installPlug(space, source);
  assert.equal(
    await readFile(join(space, "_plug/silverbullet-ai.plug.js"), "utf8"),
    "plug1",
  );
  assert.equal(await readFile(join(space, "CONFIG.md"), "utf8"), "my settings");
  await writeFile(join(source, "silverbullet-ai.plug.js"), "plug2");
  await assert.rejects(installPlug(space, source), /Refusing/);
  await installPlug(space, source, true);
  assert.equal(
    await readFile(join(space, "_plug/silverbullet-ai.plug.js"), "utf8"),
    "plug2",
  );
  await writeFile(join(space, "silverbullet-ai-library.md"), "user edits");
  await writeFile(join(source, "silverbullet-ai-library.md"), "library2");
  await writeFile(join(source, "silverbullet-ai.plug.js"), "plug3");
  await assert.rejects(installPlug(space, source, true), /Refusing/);
  assert.equal(
    await readFile(join(space, "_plug/silverbullet-ai.plug.js"), "utf8"),
    "plug2",
  );
});
test("refuses to adopt an existing installation without a matching manifest", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "sbai-existing-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, "_plug"));
  await writeFile(join(dir, "_plug/silverbullet-ai.plug.js"), "existing");
  await writeFile(join(dir, "silverbullet-ai.plug.js"), "new");
  await writeFile(join(dir, "silverbullet-ai-library.md"), "library");
  await assert.rejects(installPlug(dir, dir, true), /Refusing/);
});
