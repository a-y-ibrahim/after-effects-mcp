---
name: after-effects-workflows
description: Understand existing After Effects projects, make verified edits, and create template variants through MCP-bridge-AE. Use for scene analysis and AE automation with this bridge.
---

# After Effects workflows

Use `check-bridge` when disconnected, and `bridge-metrics` to distinguish transport wait from AE execution/render time. If a command has an unknown outcome, inspect the affected scene before deciding how to recover. Never automatically repeat an edit after a timeout. Choose the intended AE instance when more than one panel is connected.

## Understand an existing project

Start with `inspect-scene`. It defaults to the active composition and its dependencies; `scope: project` indexes every composition. Follow `nextCursor` until null. A truncated graph is not a complete project review. Use composition IDs for duplicate names.

Read the current composition time from the overview and request `see-frame` with `quality: draft` at that time. Use `contact-sheet` with `workArea: true` for a first view of motion. Request full-duration sampling only when the task needs it.

Use `inspect-layers` for the few layers relevant to the task. Keyframes are omitted by default; enable them only for animation analysis. The graph's animation scan has a per-layer budget: `animation.incomplete` means unvisited properties, not absence of animation. Explain the composition hierarchy, footage sources, text, effects and dependencies supported by those observations.

For follow-up analysis, `sinceSnapshotId` performs a fresh scan and reports changes; continuation cursors refer to the original immutable snapshot. Snapshots expire after 15 minutes. Previews are always freshly rendered by the tools.

## Edit and verify

Read the target state first and use existing dedicated or batch tools when they cover the change. Verify target indices against the latest snapshot if the user has reordered layers. Honor the user's edit scope.

Inspect the resulting structure and request `see-frame` with `quality: accurate`. Specify `motionBlur: true` when judging motion-blurred output. A preview is 8-bpc imagery for visual inspection; it does not prove that a final file retains HDR or the project's bit depth.

Report each failed item in a batch. A successful tool transport is not proof every item succeeded. Do not claim rollback unless the operation actually restored the previous state.

## Create variants

Read the template and bindings, then make one representative sample with `populate-template` or `localize-comp`. Verify text shaping, footage replacement, framing and duration before creating the remaining requested variants. Reuse the original template for each variant rather than modifying one variant into the next.

Prepare final output at the project's bit depth. Defaults are PNG sequence for 8/16 bpc and verified Float32 OpenEXR sequence for 32 bpc. An incompatible or unverifiable output template is an error; do not silently substitute lower-depth output. Background rendering must use a saved, validated project snapshot. Report actual output format and depth separately from project processing depth.
