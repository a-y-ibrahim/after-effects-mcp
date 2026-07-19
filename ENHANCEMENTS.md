# After Effects MCP - Enhancements

This fork adds **comprehensive + precise control** on top of the original tools,
without breaking any existing tool. All additions are backward compatible.

## What was added

### -2. Multilingual + Arabic / RTL (works on After Effects in any language)

- **Locale independence:** every standard property lookup (transform, text, masks, audio,
  camera, effects, shapes) now uses locale‑independent `matchName`s (e.g. `ADBE Position`)
  instead of English display names (`Position`). The tools no longer break on Arabic / French /
  German / Japanese After Effects. A `_safeProp(parent, matchName, displayName)` helper tries the
  matchName first and falls back to the display name, so nothing regresses on English AE.
- **Arabic / RTL text:** `create-text-layer` (and `setLayerProperties` text path) auto‑detect
  Arabic, set right‑to‑left direction and default right alignment. Force it with `direction`
  (`auto` | `rtl` | `ltr`). For full Arabic shaping, enable AE's Middle‑Eastern text engine.
- **`localize-comp`:** duplicate a whole composition and swap in translated text for one or
  more layers in a single call, applying the same per‑layer Arabic/RTL auto‑detection. The
  source comp is untouched; every non‑text layer, effect, and animation carries over as-is.
  Translation is the caller's job (an AI assistant already does this well) - the tool only
  handles the mechanical, error‑prone part: duplicating safely and getting direction/alignment
  right per layer.
  Reaches text nested inside precompositions too: pass a `path` (a chain of precomp layers
  ending in the text layer) instead of a top‑level `layerIndex`/`layerName`. Every precomp
  the path passes through is duplicated the first time it's reached (and reused if another
  path passes through it again), so nested source content is never edited in place - not
  even when two localized layers share the same precomp.

### -1. Layer management (ported from Dakkshin/after-effects-mcp, upgraded)

Dedicated, typed tools that the Dakkshin repo only exposed via `run-script`, here
rebuilt as first-class tools with inline-wait + id-matching + undo grouping:
`create-camera`, `duplicate-layer`, `delete-layer`, `set-layer-mask`
(rect or point-path), `batch-set-layer-properties` (set transform/opacity/blend/3D
on many layers at once), `set-composition-properties` (duration/fps/size). With these,
this version now covers everything Dakkshin, TheLlamainator, and our own additions do.

### 0. `inspect-layer` - see precisely before editing precisely

Deep, structured dump of one layer: type, flags, in/out, parent, blend mode, 3D; the
full Transform group (each property's value + expression + keyframes with
times/values/interpolation); all effects with their property values; masks; markers;
source file/dimensions; and text (font/size/fill). This is the "eyes" that make precise
control reliable - read the exact current state, then edit with `set-effect-property`,
`setLayerKeyframe`, or `execute-script`.

### 1. `execute-script` - arbitrary ExtendScript (the big one)

Runs any After Effects scripting DOM code and returns the result. This unlocks
everything the fixed tool set never covered: **masks, track mattes, parenting,
3D layers / cameras / lights, blending modes, precomposing, time remapping,
layer styles, text animators, puppet pins, importing / replacing footage,
batch edits, project-wide changes**, etc.

- Your code runs as a **function body**, so use `return <value>;` to send data back.
- Return only JSON-serializable values (numbers, strings, arrays, plain objects).
- The whole script runs inside **one undo group** - do not call `app.beginUndoGroup` yourself.
- On error you get the message **and the line number**.

Example:

```
return { name: app.project.activeItem.name, layers: app.project.activeItem.numLayers };
```

### 2a. Background rendering via aerender (no UI freeze)

- `render-aerender` - renders a comp using **aerender** (a separate headless AE
  process), so your After Effects UI stays responsive. Requires a **saved** project
  (it saves the open project first by default, or pass `projectPath`). Supports
  Render Settings / Output Module templates and a frame range. Returns immediately
  unless you pass `waitMs`. Auto-locates `aerender.exe` (override with the
  `AE_AERENDER_PATH` env var).
- `render-status` - reports which background renders are running/finished plus each
  render log's tail.

> `start-render` (in-app, blocks the GUI) and `render-aerender` (background, headless)
> are both available - pick blocking for quick one-offs, aerender for long renders.

### 2b. Tool consolidation

Removed the redundant `mcp_aftereffects_applyEffect` / `mcp_aftereffects_applyEffectTemplate`
duplicates (they used a fixed 1s sleep). Use `apply-effect` / `apply-effect-template`.

### 2. Render queue automation

- `add-to-render-queue` - add a comp (by `compName`, `compIndex`, or active),
  set `outputPath`, apply existing Render Settings / Output Module templates,
  and optionally a render span (`startTime`/`endTime`).
- `render-queue` - `list` items + status + output paths, `clear` the queue, or `remove` one item.
- `start-render` - render all `QUEUED` items. **Blocks AE until finished** (the AE UI
  is unresponsive during the render). For long renders raise `timeoutMs`; if the wait
  times out the render keeps going and you can re-check with `render-queue`.

### 3. Bridge robustness + speed (affects every command)

- **Command IDs:** each queued command carries a unique id and the result echoes it
  back (`_commandId`). New tools wait for their _exact_ result instead of guessing by
  command name - eliminates stale/duplicate-result mix-ups.
- **Single undo group per command:** every MCP command is wrapped in one
  `beginUndoGroup`/`endUndoGroup`, so one Ctrl+Z cleanly reverses it.
- **Faster polling:** bridge poll interval lowered `2000ms → 750ms` for snappier
  round-trips on multi-step work.
- **Every tool is now id-matched:** `waitForBridgeResult` falls back to the last
  queued command's id, so _all_ tools (not just the new ones) wait for their own
  result instead of guessing by command name.
- **Immediate, precise feedback:** the authoring tools that used to just say
  "command queued - call get-results" (`run-script`, `create-composition`,
  `setLayerKeyframe`, `setLayerExpression`, `apply-effect`, `apply-effect-template`)
  now wait inline and return the real bridge result in one call.

### 4. OneDrive-proof shared folder (Windows reliability fix)

The server (Node) and the panel (ExtendScript) must read/write the SAME folder.
Previously both used `Documents/ae-mcp-bridge`, but on Windows the Documents folder is
often redirected to OneDrive (Known Folder Move), and the two processes could then
resolve different paths so the command/result files never meet - a permanent "Timed out".
Both sides now default to **`%LOCALAPPDATA%\ae-mcp-bridge`** on Windows (LOCALAPPDATA is
never redirected by OneDrive and is identical for both processes). Override with the
`AE_MCP_BRIDGE_DIR` env var (set it for BOTH the MCP server and After Effects). macOS
keeps `Documents/ae-mcp-bridge`.

### 5. `check-bridge` - health + version handshake

Verifies the panel is open and responding, and reports the bridge version, AE version,
the shared bridge folder, and the open project / active comp. **Run it first whenever
anything times out.** If the bridge version does not match the server's expected version
it warns explicitly - this catches the common "edited the server but forgot to re-run
`npm run install-bridge`" case (old panel + new server = "Unknown command").

### 6. Reliability audit (v1.6.4) - atomic writes, concurrency safety, real error surfacing

A full pass over the bridge protocol fixed issues that only show up under live use:

- **Atomic command/result writes:** the server writes to a temp file and renames it into
  place (with a direct-write fallback), so a reader can never see a half-written file.
- **Concurrency-safe dispatch:** a promise-queue mutex (`bridgeMutex`) plus a unified
  `sendBridgeCommand` helper make clear→write→wait atomic, so two overlapping tool calls
  can no longer clobber each other's command/result.
- **Real errors surface as errors:** AE-side failures (`{status:"error"}`, `success:false`,
  or a synthetic timeout) are now flagged `isError` in the MCP response instead of silently
  returning as a "success" with an error payload buried inside.
- **Non-JSON handler output** is now wrapped in a JSON envelope carrying `_commandId` /
  `_commandExecuted`, so even a raw string result still matches correctly.
- **`check-bridge` capability probe:** if a ping times out, it reads the raw result file and,
  if it sees `pong:true` but no `_commandId`, reports `stalePanelDetected: true` with the
  panel's reported version - turning "old panel + new server" into a diagnosis instead of a
  silent hang.
- **ExtendScript ES5 polyfills:** After Effects' scripting engine is ES3 and lacks methods
  like `Date.prototype.toISOString` that a Node test harness has natively (which is why this
  only surfaced against a real AE, not in isolated tests). Guarded polyfills cover
  `Date.toISOString`/`toJSON`/`now`, `Array.isArray`/`indexOf`/`forEach`/`map`/`filter`,
  `String.prototype.trim`, and `Object.keys`.

### 7. Single dockable panel (v1.6.0-1.6.1)

The bridge previously always opened as a floating window, leaving an empty, unusable tab
behind whenever it was launched from **Window > mcp-bridge-auto.jsx** (After Effects'
normal dockable-panel entry point). Root cause: it never used the `Panel` object AE passes
in - dockable ScriptUI panels work fine on AE 2025/2026 with the correct pattern. Fixed to
`(this instanceof Panel) ? this : new Window(...)`, with proper `layout.layout(true)` /
resize handling on both the docked and floating (`File > Scripts > Run Script File`) paths.
Also fixed a follow-up bug where the docked-panel path called `panel.update()`, a method
that only exists on a floating `Window`, which silently broke every command until guarded.

### 8. `analyze-audio-waveform`: any audio format, not just WAV (v1.8.0)

Previously this tool only understood uncompressed PCM WAV and rejected anything else
outright. It now transparently transcodes mp3, m4a/aac, ogg, flac, or a video file's
audio track to a temporary PCM WAV first, using **ffmpeg** if it is installed and on
`PATH` (override its location with `AE_FFMPEG_PATH`). The temporary file is deleted
after analysis. If ffmpeg is not found, the tool reports that clearly instead of just
saying "unsupported format" - the fix is either installing ffmpeg or converting the
file to WAV by hand. WAV files still go through the original, dependency-free path
unchanged.

### 9. `animate-to-audio`: keyframes generated straight from an audio file (v1.9.0)

Closes the gap between "analyze this audio" and "animate to it": previously, turning
`analyze-audio-waveform`'s amplitude/peak data into actual keyframes meant the calling
AI had to compute every `{time, value}` pair itself and call `setLayerKeyframe`
repeatedly - one bridge round-trip and one undo step per keyframe. `animate-to-audio`
does both steps in one call and one round-trip:

- **`waveform` mode**: one keyframe per analyzed sample, continuously following the
  amplitude envelope (a glow/scale/opacity that rides the music, "VU meter" style).
  Supports moving-average smoothing (`smoothingWindow`) so raw per-sample jitter
  doesn't become jittery keyframes, and a response curve (`linear` / `exponential` /
  `logarithmic`) to shape how punchy vs. continuously detailed the response reads.
- **`peaks` mode**: a baseline -> hit -> decay keyframe run at each detected
  transient (a scale/opacity pop on every kick/snare, "beat pulse" style).
  `velocitySensitivePeaks` (on by default) scales each hit's height by how loud that
  specific transient was, instead of every hit popping to the same value; back-to-back
  peaks closer together than the decay time have their decay clamped so keyframe times
  never come out of order.
- Targets a plain layer property (transform, text) by name/matchName, or an effect's
  property via `effectIndex`/`effectName`/`effectMatchName` + `propertyPath` - the same
  targeting scheme `set-effect-property` already uses. Accepts every audio format
  `analyze-audio-waveform` does (ffmpeg fallback included).
- All keyframes generated by one call are set via a single bridge command
  (`setPropertyKeyframesBatch` on the ExtendScript side), so a whole audio-driven
  animation is one undo step, not hundreds. Keyframe count is capped at 2000 with a
  clear error rather than silently degrading After Effects' responsiveness.

`analyze-audio-waveform`'s WAV-native-plus-ffmpeg-fallback loading logic was extracted
into a shared `loadAudioAnalysis` helper so this tool and `analyze-audio-waveform` can
never drift apart on which audio input they accept.

### 10. `animate-from-data`: keyframes generated from any numeric series, not just audio (v1.10.0)

Same idea as `animate-to-audio`, generalized: any time-ordered numeric data - stock
prices, sensor readings, scores, survey results - can drive a property the same way,
with no audio involved at all.

- Two input shapes: `data` (explicit `{time, value}` points, sorted automatically) or
  `values` + `interval` (an evenly-spaced series with an implied time step). Exactly
  one of the two is required; giving both is a validation error, not a silent pick.
- Each raw value is normalized using `[inputMin, inputMax]` - auto-detected from the
  series (after smoothing) when not given, so a series with an unknown range still
  maps cleanly - then mapped to `[outputMin, outputMax]`, reusing the exact same
  curve-shaping (`linear` / `exponential` / `logarithmic`) and moving-average
  smoothing `animate-to-audio` uses. A flat/degenerate input range (every value
  identical, or an explicit `inputMin === inputMax`) maps to the output range's
  midpoint instead of dividing by zero.
- Same property-targeting scheme as `animate-to-audio` (plain layer property or an
  effect's property), extracted into one shared `PropertyTargetSchema` both tools
  spread into their input schema, so the field set and its wording can't drift
  between the two.
- Reuses `animate-to-audio`'s bridge command handler (`setPropertyKeyframesBatch` on
  the ExtendScript side) unchanged - that function was already fully generic, with
  nothing audio-specific in it, so this tool required zero ExtendScript changes.
  Registered under its own bridge command name (`setPropertyKeyframesBatch`, matching
  the ExtendScript function name 1:1) rather than reusing `animate-to-audio`'s
  audio-flavored command name, so the dispatch table stays self-documenting.
- The value-mapping/smoothing math (`mapAmplitudeToValue`, `smoothAmplitudes`) lives
  in `lib/audio-reactive.ts` and is imported as-is rather than duplicated - it was
  never actually audio-specific, only its callers were. `lib/data-keyframes.ts` holds
  this tool's own data-series-specific logic (sorting, range auto-detection, point
  construction from `values`+`interval`).

Current bridge protocol: `1.10.0-mcp-enhanced` (kept in sync between `BRIDGE_VERSION` in
the `.jsx`, `EXPECTED_BRIDGE_VERSION` in `index.ts`, and the version quoted in both
READMEs' "first test" section; `check-bridge` warns on a `BRIDGE_VERSION`/
`EXPECTED_BRIDGE_VERSION` mismatch but the README copies aren't checked by anything -
grep for the old version string across `README.md`/`README.ar.md`/`ENHANCEMENTS.md`
when bumping it, this has gone stale twice already).

## Activate the changes (after pulling/building this fork)

```powershell
cd after-effects-mcp
npm run build            # compiles src/index.ts -> build/, copies bridge jsx
npm run install-bridge   # pushes the updated bridge into AE's ScriptUI Panels
```

Then:

1. Restart **After Effects**, and reopen `Window > mcp-bridge-auto.jsx` (keep it open).
2. Restart your **MCP client** (Claude Code / Desktop) so it reloads the new server tools.

## Honest remaining limitations

- Still **one command at a time** (the bridge processes a single command file);
  the ID system, mutex, and atomic writes make that collision-safe and fast, but it is
  not a parallel queue.
- `start-render` blocks the AE UI by design (it's the in-app render queue). Use
  `render-aerender` for a non-blocking background render instead.
- Audio analysis reads uncompressed **PCM WAV** natively; any other format
  (mp3, m4a/aac, ogg, flac, ...) is transcoded on the fly via **ffmpeg**, which
  must be installed and on `PATH` (override with `AE_FFMPEG_PATH`). Without
  ffmpeg, non-WAV files still need converting to WAV first. The conversion
  input is restricted to the `file` protocol (`-protocol_whitelist file`) so a
  path that happens to look like a URL cannot make ffmpeg fetch a network
  resource instead, and both the version probe and the conversion itself run
  under a hard timeout so a hung ffmpeg process cannot block the server
  indefinitely. The temporary WAV is written under the OS temp directory with
  a random name and deleted right after analysis; its access permissions rely
  on the OS's own per-user temp directory isolation (true by default on
  Windows and macOS, the two supported platforms) rather than an explicit
  chmod, so a shared, misconfigured temp directory on an unsupported platform
  is a residual not defended against here.
- Layer/comp targeting in the older tools is by **1-based index** (shifts when layers
  are reordered). Prefer `execute-script` with stable `layer.id` for fragile multi-step work.
- The file-polling bridge has a real architectural ceiling (per-command latency, no
  streaming). Replacing it with a socket/UXP panel would remove that ceiling but is a
  large, risky rewrite - not attempted here.
- `animate-to-audio`'s keyframe math (curve shaping, smoothing, peak detection ->
  keyframe timing) is unit-tested directly and was additionally exercised against a
  real ffmpeg-generated audio file end-to-end outside the test suite, but the
  ExtendScript side that actually sets the keyframes in After Effects
  (`setPropertyKeyframesBatch`) has only been reviewed and syntax-checked, not run
  against a real After Effects install - this project's CI has no After Effects
  available to it. Treat it as reviewed-but-not-live-verified until it's been run
  against a real project.
