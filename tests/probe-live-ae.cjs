/*
 * Direct probe of the LIVE After Effects bridge panel via the file protocol.
 * No MCP server, no simulator. Writes a real ping command and reports exactly
 * what the panel loaded in AE writes back, so we can see its true version and
 * whether it echoes _commandId / _commandExecuted (the fields check-bridge needs).
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

function bridgeDir() {
  if (process.env.AE_MCP_BRIDGE_DIR) return process.env.AE_MCP_BRIDGE_DIR;
  if (process.platform === "win32") {
    const lad = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    return path.join(lad, "ae-mcp-bridge");
  }
  return path.join(os.homedir(), "Documents", "ae-mcp-bridge");
}

const DIR = bridgeDir();
const CMD_FILE = path.join(DIR, "ae_command.json");
const RES_FILE = path.join(DIR, "ae_mcp_result.json");

// Read the expected bridge version straight out of the built server so this probe
// can never drift from EXPECTED_BRIDGE_VERSION again (single source of truth).
// Falls back gracefully if build/index.js is missing (probe can run without a build).
function readExpectedVersion() {
  const serverPath = path.join(__dirname, "..", "build", "index.js");
  try {
    const src = fs.readFileSync(serverPath, "utf8");
    const m = src.match(/EXPECTED_BRIDGE_VERSION\s*=\s*["']([^"']+)["']/);
    if (m) return m[1];
    console.warn(
      "WARN: EXPECTED_BRIDGE_VERSION not found in",
      serverPath,
      "- version match label may be wrong",
    );
  } catch {
    console.warn(
      "WARN: could not read",
      serverPath,
      "(run npm run build) - version match label may be wrong",
    );
  }
  return null;
}
const EXPECTED_VERSION = readExpectedVersion();

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("Bridge folder:", DIR);
  fs.mkdirSync(DIR, { recursive: true });

  // unique probe id
  const id = `PROBE-${process.pid}-${process.hrtime.bigint()}`;

  // clear the result file to a waiting placeholder so we only accept a fresh reply
  fs.writeFileSync(
    RES_FILE,
    JSON.stringify(
      { status: "waiting", message: "probe waiting", timestamp: new Date().toISOString() },
      null,
      2,
    ),
    "utf8",
  );

  // write the ping command exactly as the server does
  const cmd = {
    command: "ping",
    args: {},
    commandId: id,
    timestamp: new Date().toISOString(),
    status: "pending",
  };
  fs.writeFileSync(CMD_FILE, JSON.stringify(cmd, null, 2), "utf8");
  console.log("Wrote ping command with commandId =", id);
  console.log("Waiting up to 10s for the LIVE AE panel to respond...\n");

  const start = Date.now();
  let lastShown = "";
  while (Date.now() - start < 10000) {
    try {
      if (fs.existsSync(RES_FILE)) {
        const raw = fs.readFileSync(RES_FILE, "utf8");
        if (raw && raw.trim()) {
          let parsed = null;
          try {
            parsed = JSON.parse(raw);
          } catch {
            /* mid-write */
          }
          if (parsed && parsed.status !== "waiting") {
            if (raw !== lastShown) {
              lastShown = raw;
            }
            // got a real (non-waiting) response from the panel
            const elapsed = Date.now() - start;
            console.log(`AE panel responded after ${elapsed}ms. Raw result file:`);
            console.log(raw);
            console.log("\n--- analysis ---");
            console.log("pong:               ", parsed.pong === true);
            console.log(
              "bridgeVersion:      ",
              JSON.stringify(parsed.bridgeVersion),
              EXPECTED_VERSION == null
                ? "(server EXPECTED version unknown - no build)"
                : parsed.bridgeVersion === EXPECTED_VERSION
                  ? "(matches server EXPECTED)"
                  : `(server EXPECTS ${EXPECTED_VERSION})`,
            );
            console.log("aeVersion:          ", JSON.stringify(parsed.aeVersion));
            console.log("project:            ", JSON.stringify(parsed.project));
            console.log("activeComp:         ", JSON.stringify(parsed.activeComp));
            console.log(
              "echoes _commandId:  ",
              parsed._commandId !== undefined,
              parsed._commandId !== undefined
                ? `(=${JSON.stringify(parsed._commandId)}, ${parsed._commandId === id ? "MATCHES our id" : "does NOT match"})`
                : "<-- MISSING: check-bridge id-match will FAIL",
            );
            console.log(
              "echoes _commandExecuted:",
              parsed._commandExecuted !== undefined,
              parsed._commandExecuted !== undefined
                ? `(=${JSON.stringify(parsed._commandExecuted)})`
                : "<-- MISSING: check-bridge fallback-match will FAIL too",
            );
            console.log("echoes _responseTimestamp:", parsed._responseTimestamp !== undefined);

            // also show whether the command file was acknowledged
            try {
              const cnow = JSON.parse(fs.readFileSync(CMD_FILE, "utf8"));
              console.log("command file status now:", JSON.stringify(cnow.status));
            } catch {}

            const idMatch = parsed._commandId === id;
            const fallbackMatch =
              parsed._commandId === undefined &&
              parsed.status !== "waiting" &&
              parsed._commandExecuted === "ping";
            console.log(
              "\nVERDICT: live AE panel is",
              parsed.pong ? "RESPONDING" : "present but no pong",
              "|",
              idMatch || fallbackMatch
                ? "check-bridge WOULD MATCH this result -> bridge healthy"
                : "check-bridge would NOT match -> stale panel, needs reinstall/reopen",
            );
            process.exit(0);
          }
        }
      }
    } catch {
      /* retry */
    }
    await sleep(150);
  }
  console.log("No non-waiting response within 10s.");
  console.log(
    '=> Either AE is not running, the panel is closed, or "Allow Scripts to Write Files" is off.',
  );
  console.log(
    "Final result file:",
    fs.existsSync(RES_FILE) ? fs.readFileSync(RES_FILE, "utf8") : "(none)",
  );
  console.log(
    "Final command file status:",
    fs.existsSync(CMD_FILE) ? JSON.parse(fs.readFileSync(CMD_FILE, "utf8")).status : "(none)",
  );
  process.exit(1);
}

main().catch((e) => {
  console.error("PROBE ERROR:", e);
  process.exit(2);
});
