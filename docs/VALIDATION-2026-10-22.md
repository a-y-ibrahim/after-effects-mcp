# Local verification — 22 October 2026

Version: `1.14.0-local.2-fast-scenes`. Host: After Effects 26.2.1 on Windows. All files and measurements below were produced locally; nothing was published to GitHub.

## Automated checks

- TypeScript build and CEP generation pass: 61 MCP tools, 56 host commands.
- 178 tests pass across 11 files. Coverage includes WebSocket authentication, request/instance correlation, disconnects, timeouts without replay, late results, legacy mailbox ownership, scene pagination/deltas, nested dependencies, explicit truncation, PNG/EXR depth parsing and preview queue restoration.
- ESLint passes for the changed TypeScript modules and new tests.
- The workflow resource and all three new MCP prompts are readable through a real MCP client. Skill frontmatter was inspected; the bundled Python validator could not run because PyYAML is absent.

## Real AE checks

A temporary project contained 9 nested compositions and 528 layers. `inspect-scene` returned 537 nodes over 7 pages with no incomplete tail, emitted repeated composition dependencies once, and a fresh delta identified exactly one intervening layer rename. Both WebSocket and file transports passed. Batch layer inspection reported a missing layer separately from the successful item.

Twelve sequential `inspect-comp` calls read the same 64-layer composition for each transport:

| Version / transport | Median end-to-end call |
| --- | ---: |
| Previous installed version, file bridge | 353.94 ms |
| Updated version, WebSocket | 75.29 ms |
| Updated version, file fallback | 358.67 ms |

The WebSocket result is about 4.7 times faster for this operation. This is a transport/inspection measurement, not a claim that rendering itself is 4.7 times faster. Full graph scans on this synthetic project took roughly 1.9–2.4 seconds and remain dominated by AE property inspection. More complex real projects may behave differently.

## Color, alpha and actual file depth

Foreground master renders and separate background aerender processes produced files whose headers were checked:

| Project | Actual master file | Preview file |
| --- | --- | --- |
| 8 bpc | PNG, 8-bit integer | PNG, 8-bit RGBA |
| 16 bpc | PNG, 16-bit integer | PNG, 8-bit RGBA |
| 32 bpc | OpenEXR, Float32 channels, lossless ZIPS | PNG, 8-bit RGBA |

The `MCP EXR Float32` template was saved in this AE installation. Its alpha mode is AE's native Premultiplied setting. The unavailable Straight selector was not forced. The same template must be created separately on another AE installation; see FAST-SCENES.md.

A half-transparent colored rectangle on a transparent background retained alpha. Accurate PNG previews across project depths differed by at most one 8-bit level per channel. Reimporting the Float32 EXR into AE and rendering an 8-bit preview also agreed within one level; transparent corners remained zero-alpha. This verifies the tested color fixture, not every color-management/profile combination.

Draft preview dimensions were 64 × 32 for a 256 × 128 test composition; motion blur was disabled even when requested. Accurate output was 256 × 128. The small fixture was too cheap to establish a reliable render-speed gain; some draft samples were slower due to overhead.

Project depth, existing render-queue settings/flags, and project-item counts were preserved after preview and foreground verification. Temporary rendering jobs and compositions were removed. Existing queue items were not rendered by the probes. Foreground results identify completion separately for each item. Background 16/32-bpc runs reached `finished`; the initial 8-bpc test harness misread a status field, so its already-started process was checked independently to completion before the other runs. Its log and actual 8-bit output confirm successful completion.

## Deployment and limits

The installed extension is under `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\MCP-bridge-AE`. Original changed files and their checksums are backed up in `E:\Documents\ChatGPT\home\ae-bridge-backup-20261022-fast-scenes`.

Detailed local evidence and test images are retained in `temp/live-check` in the separate working copy. The test project's pre-test snapshot is `temp/ae-session-before-test.aep`.

Master verification currently supports PNG and EXR only; other codecs fail explicitly. Output-format options hidden from AE's scripting API cannot be fingerprinted after preparation. Timeout/disconnect semantics were tested with controlled WebSocket peers; no claim is made that every OS/process failure can establish whether an edit completed. Unknown outcomes remain explicit and are never automatically retried.
