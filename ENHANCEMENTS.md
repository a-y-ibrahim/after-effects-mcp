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

Current bridge protocol: `1.6.4-mcp-enhanced` (kept in sync between `BRIDGE_VERSION` in the
`.jsx` and `EXPECTED_BRIDGE_VERSION` in `index.ts`; `check-bridge` warns on any mismatch).

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
- Audio analysis is **PCM WAV only**; convert mp3/m4a to WAV first.
- Layer/comp targeting in the older tools is by **1-based index** (shifts when layers
  are reordered). Prefer `execute-script` with stable `layer.id` for fragile multi-step work.
- The file-polling bridge has a real architectural ceiling (per-command latency, no
  streaming). Replacing it with a socket/UXP panel would remove that ceiling but is a
  large, risky rewrite - not attempted here.
