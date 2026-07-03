# Architecture

This document explains how the server talks to After Effects and how the code is
organized.

## The file bridge

After Effects scripting (ExtendScript) cannot open a socket or be driven directly
by an external process. So the MCP server (Node) and the panel that runs inside
After Effects (ExtendScript) never call each other. They communicate through two
JSON files in a shared folder.

```
MCP client  ──stdio──▶  MCP server (Node, src/index.ts)
                              │
                              │  writes ae_command.json  (command + unique id)
                              ▼
                     shared bridge folder
                              ▲
                              │  writes ae_mcp_result.json (result + same id)
                              │
              AE panel (ExtendScript, src/scripts/mcp-bridge-auto.jsx)
              polls the folder from inside After Effects
```

One round trip:

1. The server clears the result file, then writes `ae_command.json` containing the
   command name, its arguments, and a unique `commandId`.
2. The panel, polling on a timer inside After Effects, sees a new command, runs it
   against the AE scripting DOM inside a single undo group, and writes
   `ae_mcp_result.json` with the result and the same `commandId`.
3. The server polls the result file and returns the payload whose `commandId`
   matches the command it sent, so results never cross wires when several commands
   run in a row.

The whole clear-write-wait cycle is serialized by a small promise-queue mutex so
two concurrent tool calls cannot clobber each other's files.

## The shared folder

Both sides must resolve to the **same** folder. On Windows, `Documents` is often
redirected to OneDrive (Known Folder Move), which would make Node and After
Effects compute different paths that never meet, producing a permanent timeout.
To avoid that:

- **Windows:** `%LOCALAPPDATA%\ae-mcp-bridge` (never redirected by OneDrive).
- **macOS:** `~/Documents/ae-mcp-bridge`.
- **Override:** set the `AE_MCP_BRIDGE_DIR` environment variable for **both** the
  MCP server process and After Effects.

## Versioning and health

The panel reports a `BRIDGE_VERSION`; the server knows the `EXPECTED_BRIDGE_VERSION`
it was built against. The `check-bridge` tool compares them and flags a stale panel,
which catches the common "edited the server but forgot to re-run `install-bridge`"
case (old panel + new server = unknown command).

## Code layout

| Path                              | Role                                                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/index.ts`                    | The MCP server: tool registrations and the file-bridge dispatch.                                           |
| `src/lib/bridge-core.ts`          | Pure helpers: result parsing, atomic writes, path/platform resolution, command-id generation. Unit tested. |
| `src/lib/preset-scan.ts`          | Recursive `.ffx` preset scanner. Unit tested.                                                              |
| `src/lib/wav.ts`                  | Pure WAV amplitude analysis and peak detection. Unit tested.                                               |
| `src/scripts/mcp-bridge-auto.jsx` | The ExtendScript panel that runs inside After Effects and executes queued commands. ES3-era; not Node.     |
| `tests/*.test.ts`                 | Vitest unit tests for the pure core.                                                                       |
| `tests/*.cjs`                     | Manual probes against a live After Effects (not part of the automated suite).                              |

The rule of thumb: logic that can run without a live After Effects lives in
`src/lib/` and is unit tested; everything that needs the running app goes through
the bridge.

## Reliability properties

- **Per-command ids:** every command is matched by id, so a tool waits for its own
  result instead of guessing by command name.
- **Atomic writes:** command and result files are written to a temporary sibling
  and renamed into place, so a reader never sees a half-written file.
- **One undo group per command:** a single Ctrl/Cmd+Z cleanly reverses any command.
- **Errors surface as errors:** AE-side failures are flagged so the client treats
  them as errors, not silently successful output.
