/*
 * Live bridge round-trip test for the After Effects MCP server.
 * Drives the REAL built server (build/index.js) over MCP stdio JSON-RPC and
 * SIMULATES the After Effects side by reading/writing the shared bridge folder,
 * so the whole server half of the file-polling bridge is exercised without AE.
 *
 * Phases:
 *   A) No AE        -> check-bridge must report ok:false "No response..."
 *   B) Matching AE  -> simulated AE replies pong + correct version -> ok:true, versionMatch:true
 *   C) Mismatch AE  -> simulated AE replies an OLD version        -> ok:true, versionMatch:false + warning
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Single source of truth: read the version the SERVER expects straight out of the
// built server, so this test can never drift from EXPECTED_BRIDGE_VERSION again.
// (Assigned in main() once build/index.js is confirmed to exist.)
let EXPECTED_VERSION = null;
function readExpectedVersionFromServer(serverPath) {
  const src = fs.readFileSync(serverPath, 'utf8');
  const m = src.match(/EXPECTED_BRIDGE_VERSION\s*=\s*["']([^"']+)["']/);
  if (!m) throw new Error('Could not find EXPECTED_BRIDGE_VERSION in ' + serverPath);
  return m[1];
}

function bridgeDir() {
  if (process.env.AE_MCP_BRIDGE_DIR) return process.env.AE_MCP_BRIDGE_DIR;
  if (process.platform === 'win32') {
    const lad = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(lad, 'ae-mcp-bridge');
  }
  return path.join(os.homedir(), 'Documents', 'ae-mcp-bridge');
}

const DIR = bridgeDir();
const CMD_FILE = path.join(DIR, 'ae_command.json');
const RES_FILE = path.join(DIR, 'ae_mcp_result.json');

function log(...a) { console.log(...a); }

// --- Simulated AE: watch for a ping command, answer with a chosen version ----
function startFakeAE(versionToReturn, label) {
  let answered = new Set();
  let seen = new Set();
  const timer = setInterval(() => {
    try {
      if (!fs.existsSync(CMD_FILE)) return;
      const raw = fs.readFileSync(CMD_FILE, 'utf8');
      if (!raw) return;
      const cmd = JSON.parse(raw);
      if (cmd.command !== 'ping') return;
      if (cmd.commandId && !seen.has(cmd.commandId)) { seen.add(cmd.commandId); log(`   [fakeAE:${label}] SAW cmd ${JSON.stringify(cmd.commandId)}`); }
      if (!cmd.commandId || answered.has(cmd.commandId)) return;
      answered.add(cmd.commandId);
      // Mimic exactly what mcp-bridge-auto.jsx writes for a ping.
      const result = {
        status: 'success',
        pong: true,
        bridgeVersion: versionToReturn,
        aeVersion: '24.6x999 (SIMULATED)',
        bridgeFolder: DIR,
        project: 'SIMULATED Project.aep',
        activeComp: 'SIM Comp 1',
        _responseTimestamp: new Date().toISOString(),
        _commandExecuted: 'ping',
        _commandId: cmd.commandId,
      };
      fs.writeFileSync(RES_FILE, JSON.stringify(result, null, 2), 'utf8');
      log(`   [fakeAE:${label}] answered ping commandId=${JSON.stringify(cmd.commandId)} -> wrote _commandId=${JSON.stringify(result._commandId)} to ${RES_FILE}`);
    } catch { /* mid-write race, retry next tick */ }
  }, 40);
  return () => clearInterval(timer);
}

// --- Minimal MCP stdio JSON-RPC client -------------------------------------
function makeClient(child) {
  let buf = '';
  const waiters = new Map();
  child.stdout.on('data', (d) => {
    buf += d.toString('utf8');
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id !== undefined && waiters.has(msg.id)) {
        waiters.get(msg.id)(msg);
        waiters.delete(msg.id);
      }
    }
  });
  let id = 0;
  function send(method, params, isNotification) {
    const m = { jsonrpc: '2.0', method };
    if (params !== undefined) m.params = params;
    if (!isNotification) m.id = ++id;
    child.stdin.write(JSON.stringify(m) + '\n');
    if (isNotification) return Promise.resolve();
    const myId = id;
    return new Promise((resolve, reject) => {
      const to = setTimeout(() => { waiters.delete(myId); reject(new Error('RPC timeout: ' + method)); }, 20000);
      waiters.set(myId, (r) => { clearTimeout(to); resolve(r); });
    });
  }
  return { send };
}

async function main() {
  log('Bridge folder:', DIR);
  fs.mkdirSync(DIR, { recursive: true });
  // Clean slate
  for (const f of [CMD_FILE, RES_FILE]) { try { fs.unlinkSync(f); } catch {} }

  const serverPath = path.join(__dirname, '..', 'build', 'index.js');
  if (!fs.existsSync(serverPath)) { console.error('MISSING build/index.js - run npm run build'); process.exit(2); }
  EXPECTED_VERSION = readExpectedVersionFromServer(serverPath);
  log('Expected bridge version (from server):', EXPECTED_VERSION);

  const child = spawn(process.execPath, [serverPath], { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stderr.on('data', () => { /* server logs to stderr; swallow for clean output */ });
  const client = makeClient(child);

  const results = { A: null, B: null, C: null };
  try {
    const init = await client.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'bridge-roundtrip-test', version: '1.0.0' },
    });
    log('\n[init] server:', JSON.stringify(init.result?.serverInfo || {}));
    await client.send('notifications/initialized', {}, true);

    // confirm check-bridge is registered
    const tools = await client.send('tools/list', {});
    const names = (tools.result?.tools || []).map(t => t.name);
    log(`[tools] ${names.length} tools registered; check-bridge present: ${names.includes('check-bridge')}`);

    async function callCheckBridge() {
      const r = await client.send('tools/call', { name: 'check-bridge', arguments: {} });
      const text = r.result?.content?.[0]?.text ?? '';
      try { return JSON.parse(text); } catch { return { _raw: text }; }
    }

    // ---- Phase A: no AE listening ----
    log('\n=== Phase A: no AE (expect ok:false, graceful timeout) ===');
    results.A = await callCheckBridge();
    log(JSON.stringify(results.A, null, 2));
    const pingSeen = fs.existsSync(CMD_FILE) && JSON.parse(fs.readFileSync(CMD_FILE,'utf8')).command === 'ping';
    log('   server wrote a ping command file:', pingSeen);

    // ---- Phase B: matching-version AE ----
    log('\n=== Phase B: simulated AE, MATCHING version (expect ok:true, versionMatch:true) ===');
    let stop = startFakeAE(EXPECTED_VERSION, 'match');
    results.B = await callCheckBridge();
    stop();
    log(JSON.stringify(results.B, null, 2));
    log('   [debug] final RES_FILE after B:', fs.existsSync(RES_FILE) ? fs.readFileSync(RES_FILE, 'utf8') : '(none)');
    log('   [debug] final CMD_FILE after B:', fs.existsSync(CMD_FILE) ? fs.readFileSync(CMD_FILE, 'utf8') : '(none)');

    // ---- Phase C: mismatched-version AE ----
    log('\n=== Phase C: simulated AE, OLD version (expect ok:true, versionMatch:false + warning) ===');
    stop = startFakeAE('1.1.0-mcp-enhanced', 'mismatch');
    results.C = await callCheckBridge();
    stop();
    log(JSON.stringify(results.C, null, 2));
    log('   [debug] final RES_FILE after C:', fs.existsSync(RES_FILE) ? fs.readFileSync(RES_FILE, 'utf8') : '(none)');
    log('   [debug] final CMD_FILE after C:', fs.existsSync(CMD_FILE) ? fs.readFileSync(CMD_FILE, 'utf8') : '(none)');
  } finally {
    try { child.kill(); } catch {}
  }

  // ---- Verdicts ----
  log('\n================ VERDICT ================');
  const checks = [];
  checks.push(['A: no-AE reports not-responding', results.A && results.A.ok === false && /No response/i.test(results.A.problem || '')]);
  checks.push(['A: exposes expectedBridgeVersion', results.A && results.A.expectedBridgeVersion === EXPECTED_VERSION]);
  checks.push(['B: bridge responding ok',           results.B && results.B.ok === true && results.B.bridgeResponding === true]);
  checks.push(['B: version match true',             results.B && results.B.versionMatch === true]);
  checks.push(['B: reports AE version & project',   results.B && /SIMULATED/.test(results.B.aeVersion || '') && /SIMULATED/.test(results.B.project || '')]);
  checks.push(['C: responding but versionMatch false', results.C && results.C.ok === true && results.C.versionMatch === false]);
  checks.push(['C: emits version warning',          results.C && !!results.C.versionWarning]);
  let pass = 0;
  for (const [name, ok] of checks) { log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (ok) pass++; }
  log(`\n${pass}/${checks.length} checks passed`);
  process.exit(pass === checks.length ? 0 : 1);
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(3); });
