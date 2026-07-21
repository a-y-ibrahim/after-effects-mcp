# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project aims to
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.10.1](https://github.com/a-y-ibrahim/after-effects-mcp/compare/after-effects-mcp-v1.10.0...after-effects-mcp-v1.10.1) (2026-07-21)


### Bug Fixes

* verify release-please labeling works end-to-end in production (temporary, will be reverted) ([047c2c1](https://github.com/a-y-ibrahim/after-effects-mcp/commit/047c2c1f171841d1e6bc68013c9e8484930f12f9))

## [Unreleased]

## [1.10.0] - 2026-07-19

### Added

- **`animate-from-data`**: generate After Effects keyframes for a layer or
  effect property directly from an arbitrary numeric time series - stock
  prices, sensor readings, scores, survey results, anything time-ordered and
  numeric, no audio involved. Accepts either explicit `{time, value}` points
  (`data`) or an evenly-spaced series (`values` + `interval`). Each raw value
  is normalized using `[inputMin, inputMax]` (auto-detected from the series
  when not given) and mapped to `[outputMin, outputMax]`, reusing the same
  response-curve shaping and moving-average smoothing `animate-to-audio`
  uses. Targets a plain layer property or an effect property via the same
  scheme `animate-to-audio` and `set-effect-property` already use (now
  shared between the two audio/data tools as one `PropertyTargetSchema`).
  Reuses `animate-to-audio`'s bridge-side keyframe-batching handler
  unchanged - it was already fully generic - so no ExtendScript changes were
  needed; registered under its own `setPropertyKeyframesBatch` bridge
  command name for a self-documenting dispatch table. Bumps the bridge
  protocol to `1.10.0-mcp-enhanced`.

## [1.9.0] - 2026-07-16

### Added

- **`animate-to-audio`**: generate After Effects keyframes for a layer or
  effect property directly from an audio file's waveform, in one call. Two
  modes: `waveform` follows the amplitude envelope continuously (e.g. glow
  intensity, scale, or opacity riding the music); `peaks` pulses the property
  at each detected transient/beat and decays back to a baseline, optionally
  scaling each hit's height by how loud that specific transient was
  (`velocitySensitivePeaks`). Accepts any audio format `analyze-audio-waveform`
  does (PCM WAV natively, anything else via ffmpeg). Every keyframe from one
  call is sent to the bridge and set in a single round-trip and a single undo
  step, regardless of how many there are. `analyze-audio-waveform`'s own
  WAV-native-plus-ffmpeg-fallback logic was extracted into a shared
  `loadAudioAnalysis` helper so both tools stay in sync on which audio input
  they accept.

## [1.8.0] - 2026-07-16

### Added

- **`analyze-audio-waveform`** now accepts any audio format, not just PCM WAV.
  Non-WAV input (mp3, m4a/aac, ogg, flac, a video file's audio track, ...) is
  transcoded to a temporary PCM WAV via **ffmpeg** if it is installed and on
  `PATH` (override its location with the `AE_FFMPEG_PATH` env var); the
  temporary file is removed after analysis. Uncompressed WAV still goes
  through the original, dependency-free path unchanged. If ffmpeg is not
  installed, the tool now reports that explicitly instead of a generic
  "unsupported format" error.

## [1.7.4] - 2026-07-13

### Added

- **`localize-comp`** now reaches text layers nested inside precompositions: pass a
  `path` (a chain of precomp layers ending in the text layer) instead of a
  top-level `layerIndex`/`layerName`. Every precomposition on the path is
  duplicated the first time it's reached, and the duplicate is reused if another
  path passes through the same precomp again, so nested source content is never
  edited in place. Bumps the bridge protocol to `1.7.4-mcp-enhanced`.

### Fixed

- Automatic Arabic detection (`_hasArabic`, used by `create-text-layer` and
  `localize-comp` to set right-to-left direction and default right alignment)
  silently matched nothing when run inside real After Effects, despite working
  as expected outside it. ExtendScript's regex engine does not reliably parse a
  literal character class whose range boundaries are certain BMP characters
  written directly as source text; rebuilt the same ranges via `new RegExp()`
  with `\uXXXX` escape text instead, which is unaffected. Also corrects the
  Arabic Presentation Forms-B range, which previously ran three code points too
  far (into two unassigned code points and the byte-order mark). Found and
  verified live, in After Effects, while testing the precomp change above.
- `localize-comp`: when two translations in the same call passed through the
  same precomposition, the second failed with "layer not found". After
  Effects renames a layer to match its source whenever the layer has no custom
  name of its own, so the first translation's `replaceSource` silently renamed
  the shared precomp layer (e.g. "Scene" to "Scene (localized)") out from under
  the second translation's lookup. The layer's original name is now captured
  before the swap and restored after it. Found and verified live while testing
  the precomp change above.
- Reading or writing a layer's Transform properties (Position, Scale,
  Rotation, Opacity, Anchor Point) via `layer.property(matchName)` directly -
  instead of through the layer's "ADBE Transform Group" first - returns `null`
  instead of throwing, in every layer type, on at least one recent After
  Effects 2026 build (26.3x). This silently broke `create-text-layer`,
  `create-shape-layer`, `create-adjustment-layer` (`createSolidLayer` with
  `isAdjustment`), and the position/scale/rotation/opacity path of
  `batch-set-layer-properties`/`setLayerProperties`, each of which crashed on
  `.setValue(...)` against the `null`. Every direct Transform-group property
  access now goes through a new `_transformProp(layer, matchName)` helper that
  reads it via "ADBE Transform Group" first. Found and verified live while
  testing the precomp change above.

## [1.7.3] - 2026-07-13

### Added

- **`localize-comp`**: duplicate a composition and swap in translated text for one
  or more text layers in a single call, auto-detecting Arabic and applying
  right-to-left direction/alignment per layer (the same logic as
  `create-text-layer`). The source composition is left untouched; every other
  layer, effect, and animation carries over unchanged. Translation itself stays
  the caller's job - the tool only automates the mechanical, error-prone part.
  Bumps the bridge protocol to `1.7.3-mcp-enhanced`.

### Changed

- Releases now publish to npm automatically: a GitHub Actions workflow runs on
  every published GitHub Release, re-verifies the type-check and test suite,
  confirms the release tag matches `package.json`, and publishes with
  `--provenance`, so the published package is cryptographically linked to the
  exact commit it was built from. Manual `npm publish` from a local machine is no
  longer needed.

## [1.7.2] - 2026-07-05

### Changed

- Faster bridge round-trips: the server now polls the result file with an adaptive
  backoff (starting at 40ms) instead of a fixed 250ms, and the panel checks for
  commands every 250ms instead of 500ms. This lowers per-command latency, which
  adds up over multi-step builds. It only changes how often the two sides check for
  each other; it does not affect what After Effects renders. Bridge protocol
  `1.7.2-mcp-enhanced`.
- Updated TypeScript to 6.0.3 and `@types/node` to 26.1.0. The MCP SDK stays
  pinned to `~1.9.0`; the type-check was re-verified clean under the new compiler
  with that pin in place.

## [1.7.1] - 2026-07-04

### Fixed

- `contact-sheet` and `match-reference` could fail importing a frame they had just
  rendered ("File exists but couldn't be opened") because the OS write-lock had not
  released yet. They now retry the import briefly. Bridge protocol `1.7.1-mcp-enhanced`.

## [1.7.0] - 2026-07-04

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
- Unit test suite (Vitest, 53 tests at release) covering bridge result parsing,
  atomic writes, preset path resolution, command-id generation, platform path
  helpers, the `.ffx` preset scanner, and WAV amplitude analysis, with scoped v8
  coverage (`npm run test:coverage`, about 94% over `src/lib`).
- Continuous integration (GitHub Actions) running type-check, build, and tests on
  Linux, macOS, and Windows across Node 18, 20, and 22.
- CodeQL security scanning and Dependabot (npm + GitHub Actions) workflows.
- ESLint (flat config) and Prettier, with `lint`, `format`, and `format:check`
  scripts.
- Documentation: `docs/ARCHITECTURE.md` (the file-bridge protocol and code
  layout) and `docs/TOOLS.md` (a reference for all 47 tools).
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
