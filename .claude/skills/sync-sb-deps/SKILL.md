---
name: sync-sb-deps
description: Align this repo's npm dependency versions with the latest published SilverBullet release, and bump the deps SilverBullet doesn't use (mcp-bridge, sse.js, yaml, test server). Use when the user asks to sync/align deps with SilverBullet, update dependencies, or after a new SilverBullet release.
---

# Sync deps with SilverBullet

Packages: root `package.json` and `e2e-tests/` follow SB. `mcp-bridge/` (published separately, `node >=20`) and `integration-tests/mcp-test-server/` are independent of SB.

## 1. Compare

```bash
node .claude/skills/sync-sb-deps/check.mjs            # latest SB release, 10-day minimum age
node .claude/skills/sync-sb-deps/check.mjs 2.12.0 10  # specific SB version
```

The `SB` column comes from the published npm package, not `../silverbullet` main. Upstream main runs ahead of the release, and the plug builds against the npm release. `n/a` marks packages that don't follow SB.

## 2. Rules

- SB column set: use SB's spec verbatim. If SB pins exactly, pin exactly. Never move past SB's major.
  - `@lezer/markdown` must equal SB's pin. `src/mocks/syscalls.ts` reimplements SB's markdown parse. Renovate has it disabled for this reason.
  - Keep root `engines.node` equal to SB's.
- SB column `-` or `n/a`: raise the range floor to the "settled" version. Settled means published ≥10 days ago, matching `minimumReleaseAge` in `renovate.json`. Ask before taking a row marked `NEW MAJOR`.
- Bump the `@silverbulletmd/silverbullet` minimum (`>=X`) only if the user asks. That is a release-level decision.

## 3. Apply

Edit the specs in each `package.json` by hand. `npm install pkg@^1.0.0` rewrites the range to the resolved version, which breaks "SB's spec verbatim". Then, in every package dir, including ones with no spec change:

```bash
date -u -d '10 days ago' -Iseconds          # print the cutoff once, paste it below
npm install --before=<cutoff> && npm update --before=<cutoff>
```

`--before` keeps transitive deps under the age limit too. Use the full timestamp. A bare date cuts at local midnight and can exclude a version the script counts as settled.

## 4. Verify

```bash
npm ls @silverbulletmd/silverbullet @lezer/markdown   # lezer must be deduped to one version
npm test && npm run build
(cd mcp-bridge && npm run build)
(cd integration-tests/mcp-test-server && timeout 5 npx tsx server.ts)   # should print "listening"
(cd e2e-tests && npx playwright --version)
```

`npm test` also collects tests from stale `.delta/worktrees/` copies. Their failures (missing playwright, `SB_TEST_URL not set`) are not caused by the bump. Compare against a run on the old lockfile before reporting them.

Commit package.json and lockfiles in one commit, e.g. `Align deps with SilverBullet 2.11.0 and bump mcp-bridge deps`.
