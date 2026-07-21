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

- `src/index.ts`: the MCP server, tool definitions and the file-bridge dispatch.
- `src/lib/bridge-core.ts`: pure, unit-tested helpers (result parsing, preset
  path resolution, id generation). Put logic here when it can be tested without
  a running server or a live After Effects.
- `src/scripts/mcp-bridge-auto.jsx`: the ExtendScript panel that runs inside
  After Effects and executes queued commands. This is ES3-era ExtendScript, not
  Node: no modern JS built-ins without the polyfills already at the top of the file.
- `tests/*.test.ts`: Vitest unit tests. The `tests/*.cjs` files are manual probes
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

**PR title must follow [Conventional Commits](https://www.conventionalcommits.org/):**
this repo squash-merges, so the PR title becomes the commit message on `main`, and
that message is what decides the next version and changelog entry (see Releasing
below). [`pr-title-lint.yml`](.github/workflows/pr-title-lint.yml) checks this on
every PR and fails the check if it doesn't match.

- `fix: ...` - a bug fix, ships as a **patch** release.
- `feat: ...` - a new capability (tool, optional parameter, accepted value), ships
  as a **minor** release.
- `feat!: ...` or `fix!: ...` (bang before the colon) - a breaking change, ships as
  a **major** release. Explain what breaks in the PR description.
- Anything else conventional (`docs:`, `chore:`, `refactor:`, `test:`, `ci:`, ...) is
  accepted but does not trigger a release on its own.

If a PR's actual content doesn't match its title's prefix (e.g. titled `fix:` but it
actually adds a new optional parameter), the release-versioning bug this exists to
prevent has just moved from "the release-mistake" list to "the wrong-title" list -
please pick the prefix by what the diff actually does, the same rule as the version
bump itself.

## Releasing

Releasing is automated by
[`release-please`](https://github.com/googleapis/release-please), Google's own
release-automation tool, via
[`.github/workflows/release-please.yml`](.github/workflows/release-please.yml):

1. As PRs with conventional-commit titles land on `main`, release-please keeps an
   open "Release PR" up to date: it computes the next version from the accumulated
   `fix:`/`feat:`/`feat!:` prefixes (same rules as [Semantic
   Versioning](https://semver.org/spec/v2.0.0.html) above) and writes the
   corresponding `CHANGELOG.md` section from the actual PR titles/descriptions.
2. Nothing publishes automatically just from merging regular PRs. Publishing
   happens only when a maintainer reviews and merges that Release PR - this is the
   explicit go-ahead point, review the generated version bump and changelog there.
3. Merging the Release PR tags the release and publishes a GitHub Release, which
   triggers [`.github/workflows/publish.yml`](.github/workflows/publish.yml)
   automatically: it type-checks, tests, and publishes to npm with a [provenance
   attestation](https://docs.npmjs.com/generating-provenance-statements).

Do not run `npm publish` or hand-edit `version` in `package.json` directly; the
Release PR is the only path that changes it, and the workflow is the only publish
path.

This requires two repository secrets:

- `RELEASE_PLEASE_TOKEN`: a fine-grained PAT (not the default `GITHUB_TOKEN` - GitHub
  blocks the default token's own actions from triggering other workflows, which
  would silently prevent the Release PR's merge from firing `publish.yml`) scoped to
  `Contents: Read and write` and `Pull requests: Read and write` on this repo.
- `NPM_TOKEN`: an npm **Automation** token (Account Settings → Access Tokens →
  Generate New Token → Automation on npmjs.com). Automation tokens are built to
  publish from CI without an interactive 2FA prompt, and cannot change account or
  org settings.

Add both under Settings → Secrets and variables → Actions in the GitHub repo.
