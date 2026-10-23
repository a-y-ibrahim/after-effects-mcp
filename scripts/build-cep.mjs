import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
let source = read('src/scripts/mcp-bridge-auto.jsx');
function replaceOnce(before, after) {
  if (source.split(before).length !== 2) throw new Error('Upstream changed: ' + before.slice(0, 100));
  source = source.replace(before, after);
}
// Keep upstream command handlers; replace only its ScriptUI transport/lifecycle.
const uiStart = source.indexOf('var aeVersion = parseFloat(app.version);');
const sharedStart = source.indexOf('var currentCommandId = "";', uiStart);
const tailStart = source.indexOf('function logToPanel(message) {', sharedStart);
if (uiStart < 0 || sharedStart < 0 || tailStart < 0) throw new Error('Upstream bridge markers missing');
source = source.slice(0, uiStart) + source.slice(sharedStart, tailStart);
source = source.replace(/statusText\.text/g, 'cepState.status');
replaceOnce('if (panel instanceof Window) { panel.update(); }', '// CEP paints independently of the host engine.');
// Correct upstream's reversed precompose validation for multi-layer selections.
replaceOnce('var moveAllAttributes = !!args.moveAllAttributes;', 'var moveAllAttributes = args.moveAllAttributes !== false;');
replaceOnce('if (moveAllAttributes && indices.length > 1)', 'if (!moveAllAttributes && indices.length > 1)');
replaceOnce('moveAllAttributes only works when precomposing a single layer', 'Leaving attributes only works when precomposing a single layer');
// Report handler failures accurately in the CEP status, while preserving the protocol.
replaceOnce('resultObj._responseTimestamp = new Date().toISOString();', 'cepState.commandFailed = resultObj.status === "error" || !!resultObj.error;\n            resultObj._responseTimestamp = new Date().toISOString();');
replaceOnce('cepState.status = "Command completed: " + command;', 'cepState.status = (cepState.commandFailed ? "Command failed: " : "Command completed: ") + command;');
replaceOnce('var errorMsg = "ERROR in executeCommand', 'cepState.commandFailed = true;\n        var errorMsg = "ERROR in executeCommand');
replaceOnce('logToPanel("ERROR: Failed to write to result file (write returned false): " + resultFile.fsName);', 'throw new Error("Failed to write result file: " + resultFile.fsName);');
const handlers = [...source.matchAll(/case\s+"([^"]+)"\s*:/g)].map(m => m[1]);
const tools = [...(read('src/index.ts') + read('src/scene-tools.ts')).matchAll(/server\.tool\(\s*"([^"]+)"/g)].map(m => m[1]);
const prefix = `// Generated from upstream handlers by scripts/build-cep.mjs.\n(function () {\nvar JSON = {}; // Private codec: never borrow a mutable JSON object from another panel.\nvar cepState = { active: true, busy: false, status: "Ready", processed: 0, errors: 0, lastCommand: "", lastAt: "", commandFailed: false, logs: [], sequence: 0 };\n`;
const host = prefix + source + '\n' + read('cep/host-runtime.jsx') + '\n})();\n';
fs.mkdirSync(path.join(root, 'cep/jsx'), { recursive: true });
fs.writeFileSync(path.join(root, 'cep/jsx/bridge.jsx'), host, 'utf8');
fs.writeFileSync(path.join(root, 'cep/js/build-info.js'), 'window.MCP_BUILD = ' + JSON.stringify({version:'1.1.0', upstreamVersion:JSON.parse(read('package.json')).version, commit:'e9ffbed9f675a3ac31a4295c83abfd1fb4a7b3f5', toolCount:tools.length, handlerCount:handlers.length, tools}, null, 2) + ';\n');
console.log(`CEP host generated: ${tools.length} MCP tools, ${handlers.length} bridge commands.`);
