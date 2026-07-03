# Tool Reference

The server exposes **44 tools**. Each tool's full input schema (parameter names,
types, and which are required) is self-described through MCP, so your client shows
it inline. This page is the grouped catalog with each tool's purpose.

When something times out or behaves oddly, run **`check-bridge`** first.

## Inspection & diagnostics

| Tool              | Purpose                                                                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `inspect-comp`    | Map a whole composition: settings plus every layer with a useful summary (index, id, name, type, flags, in/out/start, parent, blend mode, effect/mask counts, has-audio). Use it to navigate, then `inspect-layer` for detail. |
| `inspect-layer`   | Deeply inspect one layer before precise edits: type, flags, in/out, parent, blend mode, 3D; the full Transform group (values, expressions, keyframes); effects; masks; markers; source; and text.                              |
| `get-results`     | Get results from the last script executed in After Effects.                                                                                                                                                                    |
| `check-bridge`    | Health check: verify the panel is open and responding, report bridge/AE versions, the shared folder, and the open project/active comp. Flags a version mismatch.                                                               |
| `run-bridge-test` | Run the bridge test script to verify communication and apply test effects.                                                                                                                                                     |
| `get-help`        | Get help on using the After Effects MCP integration.                                                                                                                                                                           |

## Composition & layers

| Tool                         | Purpose                                                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `create-composition`         | Create a new composition with specified parameters.                                                                                                                      |
| `set-composition-properties` | Change a composition's duration, frame rate, and/or width+height.                                                                                                        |
| `create-text-layer`          | Create a text layer with Arabic / RTL support. Direction is auto-detected (Arabic to right-to-left, right-aligned) or forced with `direction`. Works in any AE language. |
| `create-camera`              | Create a camera layer in a composition.                                                                                                                                  |
| `create-adjustment-layer`    | Create an adjustment layer in the specified (or active) comp.                                                                                                            |
| `duplicate-layer`            | Duplicate a layer, optionally renaming the copy.                                                                                                                         |
| `delete-layer`               | Delete a layer, targeted by `layerIndex` or `layerName`.                                                                                                                 |
| `center-layers`              | Center one layer, the selected layers, or all layers in a composition.                                                                                                   |
| `set-layer-mask`             | Create or modify a mask on a layer from `maskRect` (rectangle) or `maskPath` (vertices).                                                                                 |
| `batch-set-layer-properties` | Set transform/visibility properties on many layers in one call (3D, position, scale, rotation, opacity, blend mode, start/out).                                          |

## Animation

| Tool                    | Purpose                                                                          |
| ----------------------- | -------------------------------------------------------------------------------- |
| `setLayerKeyframe`      | Set a keyframe for a layer property at a given time.                             |
| `setLayerExpression`    | Set or remove an expression on a layer property.                                 |
| `get-layer-clip-frames` | Get a layer's clip start/end frames, source frame range, and duration in frames. |

## Effects

| Tool                                | Purpose                                                                          |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| `apply-effect`                      | Apply an effect to a layer.                                                      |
| `add-any-effect`                    | Add any effect to a layer by matchName or display name.                          |
| `apply-effect-template`             | Apply a predefined effect template to a layer.                                   |
| `list-layer-effects`                | List effects on a layer, with optional recursive property detail.                |
| `list-available-effects`            | List all effects available in this AE installation, with optional filter.        |
| `set-effect-property`               | Set or keyframe any property on an existing effect by name/index/path.           |
| `set-effect-keyframe`               | Set an effect-property keyframe with optional graph interpolation and easy-ease. |
| `remove-effect`                     | Remove one effect (or all effects) from a layer.                                 |
| `mcp_aftereffects_get_effects_help` | Get help on using After Effects effects.                                         |

## Presets

| Tool             | Purpose                                                        |
| ---------------- | -------------------------------------------------------------- |
| `list-presets`   | List available `.ffx` presets from common or provided folders. |
| `search-presets` | Search `.ffx` presets by name or path.                         |
| `apply-preset`   | Apply a `.ffx` preset file to a layer.                         |

## Audio & markers

| Tool                     | Purpose                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `get-audio-info`         | Get audio metadata, source file path, markers, and audio-level keyframes for a layer.                                          |
| `set-audio-levels`       | Set audio levels (dB) for an audio/AV layer, with per-channel control and optional keyframing.                                 |
| `analyze-audio-waveform` | Analyze a WAV file to extract normalized amplitude data and detect peaks/transients. Get the path from `get-audio-info` first. |
| `add-marker`             | Add a marker to a layer or composition (comment, label color, chapter, URL, duration).                                         |
| `add-markers-bulk`       | Add many markers at once, e.g. at peaks detected by `analyze-audio-waveform`.                                                  |

## Rendering

| Tool                  | Purpose                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| `add-to-render-queue` | Add a composition to the render queue and configure its output.                                    |
| `render-queue`        | List, clear, or remove items from the render queue.                                                |
| `start-render`        | Render all queued items. Blocks After Effects until finished.                                      |
| `render-aerender`     | Render a comp to a file in the background via `aerender` (no UI freeze). Requires a saved project. |
| `render-status`       | Check background `aerender` renders: which are running/finished, plus each log tail.               |

## Power

| Tool             | Purpose                                                                                                                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `execute-script` | Run arbitrary ExtendScript inside After Effects and return the result. The most powerful tool: reaches anything the dedicated tools do not cover. Runs in one undo group; return JSON-serializable values. |
| `run-script`     | Run a read-only script in After Effects.                                                                                                                                                                   |
| `test-animation` | Test animation functionality in After Effects.                                                                                                                                                             |

For a project/comp overview you can also use `run-script` with `getProjectInfo`
or `listCompositions`.
