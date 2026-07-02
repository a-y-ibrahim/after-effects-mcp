# Credits & Lineage

This project is licensed under the **MIT License** (see [LICENSE](LICENSE)).

## Original work

- **[Dakkshin/after-effects-mcp](https://github.com/Dakkshin/after-effects-mcp)** - the original
  After Effects MCP server (created 2025). The file‑bridge architecture, the ScriptUI panel,
  and the core layer‑management handlers (camera, mask, duplicate, delete, batch properties,
  composition properties) originate here. © 2025 Dakkshin.

## Intermediate fork

- **[TheLlamainator/after-effects-mcp](https://github.com/TheLlamainator/after-effects-mcp)** -
  a later fork of Dakkshin's original (2026) that added effect‑depth, presets, audio/waveform,
  and marker tools. This edition's working copy was built directly on top of that fork; many of
  its tools are present here.

## This edition - Enhanced Multilingual / Arabic edition

© 2026 Abdelrahman Youssef. Built on the above. Adds, among other things:

- **Locale independence** - all standard property lookups use `matchName`s, so the tools work on
  After Effects in any UI language (Arabic, French, German, Japanese, …), not only English.
- **Arabic / RTL text** - automatic right‑to‑left detection and alignment in `create-text-layer`
  and `setLayerProperties`.
- **`execute-script`** - arbitrary ExtendScript execution.
- **Inspectors** - `inspect-comp`, `inspect-layer`.
- **Rendering** - render‑queue tools and background `aerender` (`render-aerender`, `render-status`).
- **Reliability** - per‑command IDs, atomic command/result writes, a concurrency-safe
  dispatch mutex, single undo group per command, faster polling, an OneDrive‑proof shared
  folder, and the `check-bridge` health/version handshake (with stale-panel detection).
- **Panel fix** - the bridge now opens as a single dockable panel (the original always
  left an empty tab behind when launched from the Window menu).

Current bridge protocol: `1.6.4-mcp-enhanced`. See [ENHANCEMENTS.md](ENHANCEMENTS.md) for
the full list.

---

If you build on this edition, please keep the attribution to Dakkshin (original) and to this
edition, as required by the MIT License.
