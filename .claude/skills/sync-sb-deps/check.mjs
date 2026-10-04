#!/usr/bin/env node
// Compare this repo's npm deps against the latest published SilverBullet release.
// Usage: node .claude/skills/sync-sb-deps/check.mjs [sbVersion] [minAgeDays]
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Only these follow SB's versions. mcp-bridge and the test server are independent.
const SB_ALIGNED = ["package.json", "e2e-tests/package.json"];
const PACKAGES = [
  ...SB_ALIGNED,
  "mcp-bridge/package.json",
  "integration-tests/mcp-test-server/package.json",
];
const sbVersion = process.argv[2] ?? "latest";
const minAgeDays = Number(process.argv[3] ?? 10);

function npmView(spec, ...fields) {
  return JSON.parse(
    execFileSync("npm", ["view", spec, ...fields, "--json"], {
      encoding: "utf8",
    }),
  );
}

const sb = npmView(
  `@silverbulletmd/silverbullet@${sbVersion}`,
  "version",
  "engines",
  "dependencies",
  "devDependencies",
);
const sbDeps = { ...sb.dependencies, ...sb.devDependencies };
console.log(`SilverBullet ${sb.version}, engines.node ${sb.engines.node}\n`);

const cutoff = Date.now() - minAgeDays * 86400_000;

function latestSettled(name) {
  const { time, "dist-tags": tags } = npmView(name, "time", "dist-tags");
  const settled = Object.keys(time)
    .filter((v) => /^\d+\.\d+\.\d+$/.test(v) && Date.parse(time[v]) < cutoff)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  return { settled: settled[0], latest: tags.latest };
}

const major = (v) => v.match(/\d+/)?.[0];

const rows = [];
for (const file of PACKAGES) {
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  rows.push([file, `engines.node ${pkg.engines?.node ?? "-"}`, "", "", ""]);
  for (const [name, spec] of Object.entries({
    ...pkg.dependencies,
    ...pkg.devDependencies,
  })) {
    if (name === "@silverbulletmd/silverbullet") continue;
    const { settled, latest } = latestSettled(name);
    const sbSpec = SB_ALIGNED.includes(file) ? sbDeps[name] ?? "-" : "n/a";
    const flag = major(settled) !== major(spec) ? " NEW MAJOR" : "";
    rows.push(["", name, spec, sbSpec, `${settled} (${latest})${flag}`]);
  }
}

const header = ["file", "package", "ours", "SB", `settled ≥${minAgeDays}d (latest)`];
const widths = header.map((h, i) =>
  Math.max(h.length, ...rows.map((r) => r[i].length))
);
for (const r of [header, ...rows]) {
  console.log(r.map((c, i) => c.padEnd(widths[i])).join("  "));
}
