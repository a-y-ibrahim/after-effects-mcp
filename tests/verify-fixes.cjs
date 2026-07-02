/*
 * Isolated verification of the bridge fixes. Runs the built server against a
 * PRIVATE temp bridge folder (via AE_MCP_BRIDGE_DIR) so the live (stale) AE panel
 * cannot interfere, and drives a generic fake-AE that echoes _commandId like the
 * FIXED jsx. Covers:
 *   A) check-bridge happy path (mutex + helpers don't break it)
 *   B) AE {status:"error"} -> matched (not timed out) AND surfaced as isError  (#1/#5 + #10/#11)
 *   C) two CONCURRENT execute-script calls both return their OWN result          (#4/#8 mutex)
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EXPECTED_VERSION = '1.5.0-mcp-enhanced';
const DIR = path.join(os.tmpdir(), 'ae-mcp-verify-' + process.pid);
fs.mkdirSync(DIR, { recursive: true });
const CMD_FILE = path.join(DIR, 'ae_command.json');
const RES_FILE = path.join(DIR, 'ae_mcp_result.json');
const log = (...a) => console.log(...a);

// --- generic fake AE: answers any pending command, echoing tracking fields ----
let responder = () => ({ status: 'success' });
let echoTracking = true; // set false to simulate a STALE panel (no _commandId echo)
function startFakeAE() {
  const answered = new Set();
  const timer = setInterval(() => {
    try {
      if (!fs.existsSync(CMD_FILE)) return;
      const raw = fs.readFileSync(CMD_FILE, 'utf8');
      if (!raw) return;
      const cmd = JSON.parse(raw);
      if (!cmd.commandId || answered.has(cmd.commandId)) return;
      answered.add(cmd.commandId);
      const body = responder(cmd) || {};
      if (echoTracking) {
        body._responseTimestamp = new Date().toISOString();
        body._commandExecuted = cmd.command;
        body._commandId = cmd.commandId;
      }
      fs.writeFileSync(RES_FILE, JSON.stringify(body, null, 2), 'utf8');
    } catch { /* mid-write, retry */ }
  }, 25);
  return () => clearInterval(timer);
}

// --- minimal MCP stdio client ---------------------------------------------
function makeClient(child) {
  let buf = '';
  const waiters = new Map();
  child.stdout.on('data', d => {
    buf += d.toString('utf8');
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line) continue;
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.id !== undefined && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); }
    }
  });
  let id = 0;
  function send(method, params, notify) {
    const msg = { jsonrpc: '2.0', method };
    if (params !== undefined) msg.params = params;
    if (!notify) msg.id = ++id;
    child.stdin.write(JSON.stringify(msg) + '\n');
    if (notify) return Promise.resolve();
    const myId = id;
    return new Promise((res, rej) => {
      const to = setTimeout(() => { waiters.delete(myId); rej(new Error('RPC timeout ' + method)); }, 30000);
      waiters.set(myId, r => { clearTimeout(to); res(r); });
    });
  }
  const callTool = async (name, args) => {
    const r = await send('tools/call', { name, arguments: args });
    const text = r.result?.content?.[0]?.text ?? '';
    let parsed = null; try { parsed = JSON.parse(text); } catch {}
    return { isError: r.result?.isError === true, text, parsed };
  };
  return { send, callTool };
}

const checks = [];
const expect = (name, cond) => { checks.push([name, !!cond]); log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); };

async function main() {
  log('Isolated bridge folder:', DIR);
  for (const f of [CMD_FILE, RES_FILE]) { try { fs.unlinkSync(f); } catch {} }
  const serverPath = path.join(__dirname, '..', 'build', 'index.js');
  const child = spawn(process.execPath, [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, AE_MCP_BRIDGE_DIR: DIR },
  });
  child.stderr.on('data', () => {});
  const client = makeClient(child);
  const stopAE = startFakeAE();

  try {
    await client.send('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '1.0' } });
    await client.send('notifications/initialized', {}, true);

    // ---- A: check-bridge happy path ----
    log('\n=== A: check-bridge (mutex + helpers intact) ===');
    responder = () => ({ status: 'success', pong: true, bridgeVersion: EXPECTED_VERSION, aeVersion: 'FAKE-26', bridgeFolder: DIR, project: 'P.aep', activeComp: null });
    const a = await client.callTool('check-bridge', {});
    log('  ', a.text.replace(/\s+/g, ' ').slice(0, 160));
    expect('A: check-bridge ok:true & versionMatch', a.parsed && a.parsed.ok === true && a.parsed.versionMatch === true);

    // ---- B: AE error is matched AND surfaced as isError ----
    log('\n=== B: execute-script returns AE error (#1/#5 matched + #10/#11 isError) ===');
    responder = () => ({ status: 'error', message: 'AE_BOOM', line: 42 });
    const b = await client.callTool('execute-script', { script: 'throw new Error("x")', timeoutMs: 6000 });
    log('   isError=', b.isError, ' text=', b.text.replace(/\s+/g, ' ').slice(0, 120));
    expect('B: AE error matched within timeout (not "Timed out")', b.parsed && !/Timed out/.test(b.text));
    expect('B: AE error surfaced as isError:true', b.isError === true);
    expect('B: error message preserved', /AE_BOOM/.test(b.text));

    // ---- C: two concurrent execute-script calls each get their OWN result ----
    log('\n=== C: concurrent execute-script (mutex serializes single slot) (#4/#8) ===');
    responder = (cmd) => ({ status: 'success', echo: (cmd.args && cmd.args.script) || null });
    const [c1, c2] = await Promise.all([
      client.callTool('execute-script', { script: 'MARKER_ONE', timeoutMs: 6000 }),
      client.callTool('execute-script', { script: 'MARKER_TWO', timeoutMs: 6000 }),
    ]);
    log('   c1.echo=', c1.parsed && c1.parsed.echo, ' c2.echo=', c2.parsed && c2.parsed.echo);
    const oneOk = (c1.parsed && c1.parsed.echo === 'MARKER_ONE') || (c2.parsed && c2.parsed.echo === 'MARKER_ONE');
    const twoOk = (c1.parsed && c1.parsed.echo === 'MARKER_TWO') || (c2.parsed && c2.parsed.echo === 'MARKER_TWO');
    const noTimeout = !/Timed out/.test(c1.text) && !/Timed out/.test(c2.text);
    const distinct = c1.parsed && c2.parsed && c1.parsed.echo !== c2.parsed.echo;
    expect('C: both concurrent calls returned their OWN result (no clobber)', oneOk && twoOk && distinct);
    expect('C: neither concurrent call timed out', noTimeout);

    // ---- D: stale-panel capability probe (pong but no _commandId) ----
    log('\n=== D: check-bridge detects a STALE panel (answers ping, no _commandId) ===');
    echoTracking = false; // simulate the old panel build
    responder = () => ({ status: 'success', pong: true, bridgeVersion: EXPECTED_VERSION, aeVersion: 'OLD-26', bridgeFolder: DIR, project: 'P', activeComp: null });
    const d = await client.callTool('check-bridge', {});
    echoTracking = true;
    log('   ', d.text.replace(/\s+/g, ' ').slice(0, 200));
    expect('D: ok:false (cannot match stale result)', d.parsed && d.parsed.ok === false);
    expect('D: stalePanelDetected:true (not just "no response")', d.parsed && d.parsed.stalePanelDetected === true);
    expect('D: reports the version the stale panel claimed', d.parsed && d.parsed.panelReportedVersion === EXPECTED_VERSION);
  } finally {
    stopAE();
    try { child.kill(); } catch {}
    try { fs.rmSync(DIR, { recursive: true, force: true }); } catch {}
  }

  const passed = checks.filter(c => c[1]).length;
  log(`\n${passed}/${checks.length} checks passed`);
  process.exit(passed === checks.length ? 0 : 1);
}
main().catch(e => { console.error('VERIFY ERROR:', e); process.exit(2); });
