# Local CEP integration, 2026-10-19

Bridge protocol: `1.14.0-local.1-mcp-enhanced`.

- Integrated rahnchristian's upstream PR #30 approach: contact sheets and reference comparisons use time-offset nested compositions instead of intermediate PNG exports.
- Integrated PR #31: downscaled previews leave collapse transformations disabled.
- Preserved the local synchronous PNG renderer for the final export, including the 32-bpc brightness fix and render-queue restoration.
- Applied the nested-composition approach to the local preview-footage tool.
- Integrated PR #32 render assessment, with additional checks for unknown exit codes and missing/incomplete image sequences. Process exit events determine launcher completion.
- Included PR #29's dependency lockfile and PR #33's GitHub Actions pins. The lockfile updates development tooling for the next npm ci; existing installed dependencies are retained.

Sources: https://github.com/a-y-ibrahim/after-effects-mcp/pull/30, /31, /32, /29, /33. Original attribution and MIT license remain in place.

Validation: TypeScript compilation and 156 unit tests passed. The CEP bridge was regenerated. Live After Effects validation is pending because the panel was not responding during installation.

Activation: close and reopen the CEP panel, then restart the MCP client so it loads the updated build/index.js.
