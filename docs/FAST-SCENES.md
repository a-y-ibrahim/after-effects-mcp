# Fast scene inspection and verified master export

Version: 1.14.0-local.2-fast-scenes. Build with `npm run build`; this also regenerates the CEP host.

## Transport and timing

Keep the CEP panel open. Each MCP process advertises a loopback WebSocket endpoint in the bridge directory. The panel connects to it and serializes requests across clients. Session tokens, request IDs and panel instance IDs prevent accidental cross-routing. `bridge-metrics` lists connected instances and the latest 200 timing samples, grouped by transport and command. Times distinguish queue wait, round trip, AE execution and rendering; preview responses additionally report image preparation time.

The default transport is automatic: select a connected WebSocket before dispatch, otherwise use the legacy file bridge. Set `AE_MCP_TRANSPORT=websocket` to require WebSocket, or `file` to test the fallback. Set `AE_MCP_INSTANCE_ID` to an instance reported by `bridge-metrics` when several AE panels are connected. Explicit instance targeting requires WebSocket; the legacy shared mailbox cannot address instances.

Once dispatched, a timed-out command is never replayed on either transport. A late matching WebSocket result can resolve uncertainty. After a disconnected operation, inspect AE before restarting the MCP server or repeating an edit. A file timeout retains `file-lease.json`: stop all clients, inspect AE and the matching result, then remove that lease only when the prior operation is known to have finished. Old server versions do not implement leases; do not run old and new clients concurrently against the file mailbox. Close duplicate panels when using file transport.

## Scene tools

`inspect-scene` reads structure immediately, without rendering. Default scope is the active composition and recursively referenced compositions. Use `scope: project` for the whole project and `compId` to disambiguate identical names. Dependencies are emitted once, with layer sources, parents, mattes, text, effects and animation hints. Property scans have explicit budgets; an incomplete hint must not be interpreted as no animation.

`inspect-layers` batches up to 50 layer indices, with individual results. Keyframes are optional and capped. Both tools paginate responses; follow `nextCursor` until null. An oversized node or a host scan limit is explicitly marked incomplete. Raise `maxNodes` for a truncated graph or inspect a layer individually for oversized details.

Snapshots have unique IDs and capture times. `sinceSnapshotId` triggers a fresh scan, so manual edits are included. Pagination reads the original immutable snapshot. Each tool retains up to five snapshots for 15 minutes. Deltas cannot be calculated from a truncated snapshot or across different project/selection scopes.

## Preview

`see-frame` defaults to `quality: accurate`, preserving existing calls. `quality: draft` uses quarter resolution, a limited output size and no motion blur. Accurate previews use full rendering resolution before output sizing; request `motionBlur` explicitly for the intended inspection. Both return PNG at 8 bpc, while AE computes at the unchanged project depth. The render-queue path retains the existing correction for dark previews in 32-bpc projects.

`contact-sheet` accepts `workArea: true` to sample the current work area. Existing calls still sample the full composition. Structure inspection never waits for an image, and all image calls render fresh output.

## Master export

`add-to-render-queue` and `render-aerender` read the current project depth. Calculation uses **Current Settings**. Default output is PNG sequence at 8 or 16 bpc, and OpenEXR sequence with Float32 channels at 32 bpc. Frame-number placeholders are added to sequence paths. No format or depth is silently substituted.

Preparation renders a small isolated sample and reads its actual PNG/EXR header. This catches EXR Half files even when AE reports the output module as Floating Point. Existing queue items are paused and restored during the probe. EXR compression must be lossless (None, RLE, ZIPS, ZIP or PIZ); ZIP is recommended for Float32. DWA and PXR24 are rejected. Output metadata reports project depth, format, sample-verified export depth, compression, channels and AE's reported alpha mode separately.

### One-time EXR template setup

The AE scripting API cannot set the output format or the OpenEXR Float32 checkbox. Create an Output Module template named **MCP EXR Float32** in AE:

1. Select **OpenEXR Sequence**, **RGB + Alpha**, and Floating Point depth.
2. In Format Options choose **ZIP**, and enable **32-bit float**.
3. Leave the format's native alpha behavior. The Straight control may be unavailable for EXR; do not force it.
4. Save the template with the exact name above.

The plugin rejects a missing template with setup instructions. The checkbox's “not recommended” label reflects the usual preference for smaller Half files; the strict 32-bpc master policy deliberately requires Float32. ZIP preserves the stored channel values; DWAB does not. See the [OpenEXR technical introduction](https://openexr.com/en/latest/TechnicalIntroduction.html).

Custom templates must exist and pass the same validation. Currently only PNG and OpenEXR can be verified; video codecs and other formats return an explicit unsupported-verification error. Use a separate delivery conversion when needed. The plugin does not silently treat an 8-bit delivery codec as a high-depth master.

`start-render` requires items prepared during the current bridge session and rejects visible setting or project-depth changes since verification. Reprepare items after a panel reload. Settings hidden by AE's scripting API cannot be fingerprinted; avoid editing codec options between preparation and rendering. Each render-queue item gets a separate completion result, including interrupted or failed items.

Background rendering requires the specified project to be open and saved. With `saveFirst: false`, a dirty project is rejected. The validated saved project is copied for the render so subsequent user saves do not alter that job. The output depth is verified using a sample during preparation; this is not a claim that every rendered frame has been independently decoded.

## Workflows

The `aftereffects://workflows` resource and `understand-project`, `edit-and-verify`, `create-variants` prompts share the accompanying `skills/after-effects-workflows/SKILL.md`. They guide structure-first inspection, a small representative test before batch edits, fresh visual verification and item-by-item failure reporting.

## Deployment

Back up the installed extension before replacing files. Deploy the build, CEP page and host, workflow skill, and the `ws` runtime dependency together. Close and reopen the CEP panel to load its new JavaScript, and restart the MCP connection to discover the new tools and prompts. Existing processes retain their loaded code until restarted.
