# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project aims to
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Unit test suite (Vitest) covering bridge result parsing, atomic writes, preset
  path resolution, and command-id generation.
- Continuous integration (GitHub Actions) running type-check, build, and tests on
  Linux, macOS, and Windows across Node 18, 20, and 22.
- `src/lib/bridge-core.ts`: pure, testable helpers extracted from `index.ts`.
- Project maturity docs: `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`,
  issue and pull-request templates.

### Changed

- `index.ts` now imports its result-parsing, path-resolution, and id-generation
  helpers from `src/lib/bridge-core.ts` instead of defining them inline.

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
