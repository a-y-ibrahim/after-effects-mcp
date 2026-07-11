# After Effects MCP - Enhanced Multilingual Edition

[![CI](https://github.com/a-y-ibrahim/after-effects-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/a-y-ibrahim/after-effects-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-compatible-6366f1)](https://modelcontextprotocol.io)
[![العربية](badge-ar.svg)](README.ar.md)

Control Adobe After Effects from any MCP client (Claude Code / Claude Desktop) using natural
language: create and inspect comps and layers, animate, apply effects and presets, manage
masks/cameras, **render in the background**, and run arbitrary ExtendScript - with **first‑class
Arabic / RTL support** and tools that work on After Effects in **any UI language**.

This is an enhanced edition built on the original work of
[**Dakkshin/after-effects-mcp**](https://github.com/Dakkshin/after-effects-mcp). See [CREDITS.md](CREDITS.md).

---

## ✨ Why this edition

| Area                         | This edition                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Works in any AE language** | All standard property lookups use locale‑independent `matchName`s → no breakage on Arabic/French/German/Japanese AE                               |
| **Arabic / RTL text**        | `create-text-layer` auto‑detects Arabic, sets right‑to‑left direction and right alignment                                                         |
| **Arbitrary scripting**      | `execute-script` runs any ExtendScript → reach every AE feature                                                                                   |
| **Visual feedback**          | `see-frame` renders a frame back as an image so the AI can SEE its work and self-correct (no other AE MCP does this)                              |
| **Deep inspection**          | `inspect-comp` / `inspect-layer` - see exact state before editing                                                                                 |
| **Rendering**                | In‑app render queue **and** background `aerender` (no UI freeze)                                                                                  |
| **Reliability**              | Per‑command IDs (no stale results), one undo group per command, faster polling, OneDrive‑proof shared folder, `check-bridge` health/version check |
| **Layer management**         | Cameras, duplicate, delete, masks, batch transform, comp settings - as dedicated tools                                                            |

**47 tools total.** Full details in [ENHANCEMENTS.md](ENHANCEMENTS.md).

---

## 📋 Prerequisites

- **Adobe After Effects** 2022 or later
- **Windows or macOS.** After Effects itself only runs on these two platforms, so
  the server is meant to run on the same machine as After Effects. The Node
  process starts on Linux and the CI builds and tests there, but there is no After
  Effects for it to drive.
- **Node.js 18+** - <https://nodejs.org>
- An MCP client (e.g. **Claude Code**: `npm install -g @anthropic-ai/claude-code`)

## 🚀 Setup

```bash
git clone https://github.com/a-y-ibrahim/after-effects-mcp.git
cd after-effects-mcp
npm install              # installs + builds
npm run install-bridge   # copies the panel into AE's ScriptUI Panels
```

Then in After Effects:

1. Enable scripting - **Windows**: Edit > Preferences > Scripting & Expressions; **macOS**: After Effects > Settings > Scripting & Expressions → enable **“Allow Scripts to Write Files and Access Network”**.
2. Restart After Effects.
3. **Window > mcp-bridge-auto.jsx** - keep this panel open.

Register the server with your MCP client:

```bash
claude mcp add AfterEffectsMCP node /absolute/path/to/after-effects-mcp/build/index.js
```

**First test:** ask your client to _“check the After Effects bridge”_. It should report
`bridgeVersion: 1.7.2-mcp-enhanced` and `versionMatch: true`.

> 💡 If you edit the server, re‑run `npm run build`, then restart the MCP client.
> If you edit the bridge, also re‑run `npm run install-bridge` and restart After Effects.

---

## 🧰 Tools at a glance

**Inspection & diagnostics** - `see-frame`, `contact-sheet`, `match-reference`, `inspect-comp`, `inspect-layer`, `get-results`, `check-bridge`, `run-bridge-test`, `get-help`
**Composition & layers** - `create-composition`, `set-composition-properties`, `create-text-layer`, `create-camera`, `create-adjustment-layer`, `duplicate-layer`, `delete-layer`, `center-layers`, `set-layer-mask`, `batch-set-layer-properties`
**Animation** - `setLayerKeyframe`, `setLayerExpression`, `get-layer-clip-frames`
**Effects** - `apply-effect`, `add-any-effect`, `apply-effect-template`, `list-layer-effects`, `list-available-effects`, `set-effect-property`, `set-effect-keyframe`, `remove-effect`, `mcp_aftereffects_get_effects_help`
**Presets** - `list-presets`, `search-presets`, `apply-preset`
**Audio & markers** - `get-audio-info`, `set-audio-levels`, `analyze-audio-waveform`, `add-marker`, `add-markers-bulk`
**Rendering** - `add-to-render-queue`, `render-queue`, `start-render`, `render-aerender`, `render-status`
**Power** - `execute-script` (arbitrary ExtendScript), `run-script`, `test-animation`

For project/comp overview you can also use `run-script` with `getProjectInfo` / `listCompositions`.

📖 Full reference: [docs/TOOLS.md](docs/TOOLS.md) (all 47 tools) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (how the bridge works).

---

## 🌙 Arabic / RTL example

> “Create a text layer that says ‘مرحبا بالعالم’”

`create-text-layer` detects the Arabic text and automatically sets right‑to‑left direction and
right alignment. Use a font that supports Arabic (e.g. `Tahoma`, `Cairo`). For full Arabic shaping,
enable the Middle‑Eastern text engine in After Effects (**Windows**: Preferences > Type;
**macOS**: Settings > Type).

---

## 🩺 Troubleshooting

- **Anything times out / odd behavior** → ask _“check the After Effects bridge”_ first.
- **Version mismatch warning** → re‑run `npm run install-bridge`, restart After Effects.
- **“Result file appears stale”** → the panel isn’t running or can’t write files; reopen it and confirm scripting permission.
- **Windows + OneDrive** → the shared folder is `%LOCALAPPDATA%\ae-mcp-bridge` (OneDrive‑proof). Override both sides with the `AE_MCP_BRIDGE_DIR` env var if needed.

---

## 🧪 Development

```bash
npm run build       # compile + copy the bridge script
npm run typecheck   # tsc --noEmit
npm test            # Vitest unit suite
```

Pure logic lives in [src/lib/bridge-core.ts](src/lib/bridge-core.ts) and is unit
tested in [tests/bridge-core.test.ts](tests/bridge-core.test.ts). CI type-checks and
builds on Linux, macOS, and Windows across Node 18, 20, and 22, and runs the test
suite on Node 20 and 22 (Vitest 4 requires Node 20+). See [CONTRIBUTING.md](CONTRIBUTING.md)
for the architecture and how to add a tool.

---

## 📄 Credits & License

Licensed under the **MIT License**. Original work © 2025 Dakkshin; enhanced multilingual edition
© 2026 Abdelrahman Youssef. See [LICENSE](LICENSE) and [CREDITS.md](CREDITS.md).
