# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project aims to
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`see-frame`** (flagship): render one or more frames of a composition and return
  them to the model as images, so an AI assistant can visually verify its work and
  self-correct (make a change, look, fix). Downscales previews inside After Effects
  by default to stay fast and cheap; `maxWidth: 0` gives a native-resolution still.
  No other After Effects MCP returns rendered pixels. Bumps the bridge protocol to
  `1.7.0-mcp-enhanced`; the pure Node-side logic is unit tested.
- **`contact-sheet`**: sample N frames across a comp's duration and let After
  Effects composite them into one labeled thumbnail grid image, so motion, timing,
  and easing are visible at a glance and cheaply.
- **`match-reference`**: compare a comp to an on-disk reference image, returning a
  side-by-side and a difference map (via AE's Difference blend, no external
  library) so the model can see where the render deviates and converge on a match.

- Unit test suite (Vitest, 53 tests) covering bridge result parsing, atomic
  writes, preset path resolution, command-id generation, platform path helpers,
  the `.ffx` preset scanner, and WAV amplitude analysis, with scoped v8 coverage
  (`npm run test:coverage`, about 94% over `src/lib`).
- Continuous integration (GitHub Actions) running type-check, build, and tests on
  Linux, macOS, and Windows across Node 18, 20, and 22.
- CodeQL security scanning and Dependabot (npm + GitHub Actions) workflows.
- ESLint (flat config) and Prettier, with `lint`, `format`, and `format:check`
  scripts.
- Documentation: `docs/ARCHITECTURE.md` (the file-bridge protocol and code
  layout) and `docs/TOOLS.md` (a reference for all 44 tools).
- Project maturity docs and config: `CONTRIBUTING.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md`, issue and pull-request templates, `.editorconfig`,
  `.gitattributes`, and `.nvmrc`.
- New unit-tested modules: `src/lib/bridge-core.ts`, `src/lib/preset-scan.ts`,
  and `src/lib/wav.ts`.

### Changed

- Extracted pure logic (result parsing, atomic writes, preset scanning, WAV
  analysis, platform path resolution) out of `index.ts` into focused, unit-tested
  `src/lib` modules, with no change to the tool surface or behavior.
- The build is now deterministic (it cleans its output first), so stale artifacts
  never ship.

### Fixed

- Global and production installs no longer fail: replaced the `postinstall` build
  (which needs dev dependencies) with `prepare`/`prepack`.
- A fresh `npm install` no longer risks a broken build: the MCP SDK is pinned to a
  range that compiles (newer releases trigger a TypeScript inference regression).

### Security

- Removed the unused `node-fetch` dependency and replaced `copyfiles` with a Node
  one-liner in the build, eliminating both from the dependency tree and clearing
  their advisories.
- Hardened the WAV analyzer against a crafted file: reject unsupported bit depths,
  clamp the declared data-chunk size to the buffer, and bound `numPoints`, so a
  malicious audio source can no longer exhaust CPU or memory on the main thread.
- Hardened CI: least-privilege `permissions`, actions pinned to commit SHAs, and
  `persist-credentials: false` on checkout in both workflows.
- Added a `files` allowlist to `package.json` so only build output and docs are
  published (no tests, coverage, or source).
- Documented in `SECURITY.md` that the remaining `npm audit` advisories are all in
  the SDK's Express HTTP transport, which this stdio-only server never loads.

## [1.6.4] - 2026-07

### Added

- Reliability audit of the bridge protocol: atomic command/result writes, a
  concurrency-safe dispatch mutex, and real AE-side errors surfaced as errors.

### Fixed

- Single dockable panel on launch: the bridge no longer leaves an empty tab behind
  when opened from the Window menu.
- Cross-platform preset roots and bridge install paths for macOS and Windows.

## [1.6.0] - 2026-06

### Added

- `execute-script` (arbitrary ExtendScript), `inspect-comp`, and `inspect-layer`.
- Background rendering via `aerender` (`render-aerender`, `render-status`).
- Locale-independent property lookups (`matchName`) and native Arabic / RTL text.
- `check-bridge` health and version handshake with stale-panel detection.

Earlier history builds on the original
[Dakkshin/after-effects-mcp](https://github.com/Dakkshin/after-effects-mcp),
later extended by
[TheLlamainator/after-effects-mcp](https://github.com/TheLlamainator/after-effects-mcp).
See [CREDITS.md](CREDITS.md).
