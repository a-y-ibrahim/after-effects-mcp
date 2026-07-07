# Contributing

Thanks for your interest in improving After Effects MCP. This guide covers local
setup, the test workflow, and the conventions the project follows.

## Prerequisites

- Node.js 18 or later to run the server; Node 20 or later to run the test suite
  (Vitest 4 requires Node 20+)
- Adobe After Effects 2022 or later (only needed to test against a live AE bridge)

## Local setup

```bash
git clone https://github.com/a-y-ibrahim/after-effects-mcp.git
cd after-effects-mcp
npm install            # installs deps and builds
git config core.hooksPath .githooks   # enable the commit-message hook (see below)
```

## Everyday commands

```bash
npm run build       # compile TypeScript + copy the bridge script into build/
npm run typecheck   # tsc --noEmit, no output
npm test            # run the Vitest unit suite
npm run test:watch  # watch mode while developing
```

Please run `npm run typecheck` and `npm test` before opening a pull request. CI
runs the same checks on Linux, macOS, and Windows across Node 18, 20, and 22.

## How the project is laid out

- `src/index.ts` — the MCP server: tool definitions and the file-bridge dispatch.
- `src/lib/bridge-core.ts` — pure, unit-tested helpers (result parsing, preset
  path resolution, id generation). Put logic here when it can be tested without
  a running server or a live After Effects.
- `src/scripts/mcp-bridge-auto.jsx` — the ExtendScript panel that runs inside
  After Effects and executes queued commands. This is ES3-era ExtendScript, not
  Node: no modern JS built-ins without the polyfills already at the top of the file.
- `tests/*.test.ts` — Vitest unit tests. The `tests/*.cjs` files are manual probes
  that talk to a live AE instance and are not part of the automated suite.

## The bridge, in one paragraph

The server (Node) and the panel (ExtendScript) never call each other directly.
They exchange two JSON files in a shared folder (`%LOCALAPPDATA%\ae-mcp-bridge`
on Windows, `~/Documents/ae-mcp-bridge` on macOS): the server writes a command
with a unique id, the panel executes it and writes back a result echoing that id.
Every command is matched by id so results never cross wires.

## Adding a tool

1. Register it in `src/index.ts` with a `zod` schema and a clear description.
2. If it needs new panel behavior, add a `case` in `src/scripts/mcp-bridge-auto.jsx`
   and bump `BRIDGE_VERSION` there and `EXPECTED_BRIDGE_VERSION` in `src/index.ts`
   together, so `check-bridge` can flag a stale panel.
3. Address AE properties by `matchName` (e.g. `ADBE Position`), not by localized
   display name, so the tool keeps working on non-English After Effects.
4. Add unit tests for any pure logic you introduce.

## Conventions

- Keep commit messages free of em-dashes. The `.githooks/commit-msg` hook enforces
  this; enable it once with `git config core.hooksPath .githooks`.
- Prefer editing existing files over adding new ones.
- Match the surrounding code style; keep new modules focused and testable.

## Pull requests

Open PRs against `main`. Describe what changed and why, note anything you tested
against a live After Effects, and make sure CI is green.

## Releasing

1. Bump `version` in `package.json` and add a dated section to `CHANGELOG.md`.
2. Commit and push to `main`, then tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. Publish a GitHub Release from that tag, using the changelog entry as its notes.

Publishing the release triggers
[`.github/workflows/publish.yml`](.github/workflows/publish.yml) automatically: it
type-checks, tests, verifies the tag matches `package.json`, and publishes to npm
with a [provenance attestation](https://docs.npmjs.com/generating-provenance-statements).
Do not run `npm publish` by hand; the workflow is the only publish path.

This requires a repository secret named `NPM_TOKEN`, an npm **Automation** token
(Account Settings → Access Tokens → Generate New Token → Automation on npmjs.com).
Automation tokens are built to publish from CI without an interactive 2FA prompt,
and cannot change account or org settings. Add it under Settings → Secrets and
variables → Actions in the GitHub repo.
