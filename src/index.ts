import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execSync, spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { z } from "zod";
import { fileURLToPath } from 'url';
import {
  bridgeToolResult,
  atomicWriteSync,
  uniqueExistingDirs,
  getDefaultPresetRoots,
  makeCommandIdFactory,
} from "./lib/bridge-core.js";


const server = new McpServer({
  name: "AfterEffectsServer",
  version: "1.0.0"
});


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const SCRIPTS_DIR = path.join(__dirname, "scripts");
const TEMP_DIR = path.join(__dirname, "temp");



// Bridge folder shared between this server (Node) and the AE panel (ExtendScript).
// CRITICAL: both sides must resolve to the SAME folder. On Windows, Documents is
// often redirected to OneDrive (Known Folder Move), and Node's homedir/Documents
// can differ from AE's Folder.myDocuments -> the two never meet -> permanent
// "Timed out". LOCALAPPDATA is never redirected by OneDrive and is identical for
// both processes, so we use it as the deterministic default on Windows. Override
// with the AE_MCP_BRIDGE_DIR env var if you need a custom shared location (it must
// be set for BOTH the MCP server process and After Effects).
function getAETempDir(): string {
  let bridgeDir: string;
  const override = process.env.AE_MCP_BRIDGE_DIR;
  if (override && override.length > 0) {
    bridgeDir = override;
  } else if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    bridgeDir = path.join(localAppData, 'ae-mcp-bridge');
  } else {
    // macOS: Documents is not subject to OneDrive KFM; keep the original location.
    bridgeDir = path.join(os.homedir(), 'Documents', 'ae-mcp-bridge');
  }

  if (!fs.existsSync(bridgeDir)) {
    fs.mkdirSync(bridgeDir, { recursive: true });
  }
  return bridgeDir;
}




function readResultsFromTempFile(): string {
  try {
    const tempFilePath = path.join(getAETempDir(), 'ae_mcp_result.json');
    
    
    console.error(`Checking for results at: ${tempFilePath}`);
    
    if (fs.existsSync(tempFilePath)) {
      
      const stats = fs.statSync(tempFilePath);
      console.error(`Result file exists, last modified: ${stats.mtime.toISOString()}`);
      
      const content = fs.readFileSync(tempFilePath, 'utf8');
      console.error(`Result file content length: ${content.length} bytes`);
      
      
      const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
      if (stats.mtime < thirtySecondsAgo) {
        console.error(`WARNING: Result file is older than 30 seconds. After Effects may not be updating results.`);
        return JSON.stringify({ 
          warning: "Result file appears to be stale (not recently updated).",
          message: "This could indicate After Effects is not properly writing results or the MCP Bridge Auto panel isn't running.",
          lastModified: stats.mtime.toISOString(),
          originalContent: content
        });
      }
      
      return content;
    } else {
      console.error(`Result file not found at: ${tempFilePath}`);
      return JSON.stringify({ error: "No results file found. Please run a script in After Effects first." });
    }
  } catch (error) {
    console.error("Error reading results file:", error);
    return JSON.stringify({ error: `Failed to read results: ${String(error)}` });
  }
}


// Monotonic command-id generator. Each queued command gets a unique id so the
// server can match the *exact* result for that command instead of guessing by
// command name + freshness (which collides when the same command runs twice).
let lastCommandId = "";
const nextCommandId = makeCommandIdFactory();

async function waitForBridgeResult(expectedCommand?: string, timeoutMs: number = 5000, pollMs: number = 250, expectedId?: string): Promise<string> {
  const start = Date.now();
  const resultPath = path.join(getAETempDir(), 'ae_mcp_result.json');
  let lastSize = -1;
  // Auto-migrate EVERY tool to id-based matching: if the caller didn't pass an
  // explicit id, fall back to the id of the most recently queued command. This
  // makes each tool wait for its OWN result instead of guessing by command name
  // (which collides when the same command runs twice in a row). Captured once,
  // up front, so it can't be clobbered by a later command during the await loop.
  const idToMatch = expectedId || lastCommandId || "";

  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(resultPath)) {
      try {
        const content = fs.readFileSync(resultPath, 'utf8');
        if (content && content.length > 0) {
          try {
            const parsed = JSON.parse(content);
            if (idToMatch && parsed._commandId !== undefined) {
              // New bridge: precise match on the exact command id.
              if (parsed._commandId === idToMatch) {
                return content;
              }
            } else if (content.length !== lastSize) {
              // Graceful fallback for an older bridge that doesn't echo _commandId
              // (or when no id is available): accept a fresh, non-"waiting" result
              // matching the command name. clearResultsFile() writes a "waiting"
              // placeholder before each call, so this won't latch onto a stale result.
              lastSize = content.length;
              if (parsed.status !== "waiting" && (!expectedCommand || parsed._commandExecuted === expectedCommand)) {
                return content;
              }
            }
          } catch {

          }
        }
      } catch {

      }
    }
    await new Promise(r => setTimeout(r, pollMs));
  }
  return JSON.stringify({ error: `Timed out waiting for bridge result${expectedCommand ? ` for command '${expectedCommand}'` : ''}.` });
}


function writeCommandFile(command: string, args: Record<string, any> = {}): string {
  try {
    const commandFile = path.join(getAETempDir(), 'ae_command.json');
    const commandId = nextCommandId();
    lastCommandId = commandId;
    const commandData = {
      command,
      args,
      commandId,
      timestamp: new Date().toISOString(),
      status: "pending"
    };
    atomicWriteSync(commandFile, JSON.stringify(commandData, null, 2));
    console.error(`Command "${command}" (${commandId}) written to ${commandFile}`);
    return commandId;
  } catch (error) {
    console.error("Error writing command file:", error);
    return "";
  }
}


function clearResultsFile(): void {
  try {
    const resultFile = path.join(getAETempDir(), 'ae_mcp_result.json');
    
    
    const resetData = {
      status: "waiting",
      message: "Waiting for new result from After Effects...",
      timestamp: new Date().toISOString()
    };
    
    atomicWriteSync(resultFile, JSON.stringify(resetData, null, 2));
    console.error(`Results file cleared at ${resultFile}`);
  } catch (error) {
    console.error("Error clearing results file:", error);
  }
}

// The bridge has exactly ONE command file and ONE result file, so two tool calls
// that run concurrently would clobber each other's command and clear each other's
// result. This mutex serializes the whole clear -> write -> wait cycle so each
// bridge interaction is atomic with respect to the others. Sequential awaits were
// already safe; this protects the concurrent/parallel tool-dispatch case.
let _bridgeTail: Promise<unknown> = Promise.resolve();
function bridgeMutex<T>(fn: () => Promise<T>): Promise<T> {
  const run = _bridgeTail.then(fn, fn);
  _bridgeTail = run.then(() => undefined, () => undefined);
  return run;
}

// One-stop bridge call used by every tool: atomically (under the mutex) clear the
// result file, write the command with a unique id, and wait for the matching
// result. Returns the raw result string, or a synthetic {status:"error"} JSON if
// the command file could not be written (permission / OneDrive), so callers never
// silently fall back to a previous command's id.
async function sendBridgeCommand(
  command: string,
  args: Record<string, any> = {},
  timeoutMs: number = 7000,
  pollMs: number = 250
): Promise<string> {
  return bridgeMutex(async () => {
    clearResultsFile();
    const id = writeCommandFile(command, args);
    if (!id) {
      return JSON.stringify({
        status: "error",
        error: `Failed to write the '${command}' command to the bridge folder. Check folder permissions / that it is not a OneDrive-redirected path.`
      });
    }
    return waitForBridgeResult(command, timeoutMs, pollMs, id);
  });
}

function collectPresetFiles(
  roots: string[],
  recursive: boolean,
  query?: string,
  maxResults: number = 500,
  maxDepth: number = 10,
): Array<{ path: string; name: string; directory: string; size: number; modifiedAt: string }> {
  const results: Array<{ path: string; name: string; directory: string; size: number; modifiedAt: string }> = [];
  const loweredQuery = query ? query.toLowerCase() : "";

  function walk(currentDir: string, depth: number) {
    if (results.length >= maxResults) {
      return;
    }
    if (depth > maxDepth) {
      return;
    }

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= maxResults) {
        return;
      }

      const entryPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (recursive) {
          walk(entryPath, depth + 1);
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (!entry.name.toLowerCase().endsWith(".ffx")) {
        continue;
      }

      if (loweredQuery && !entry.name.toLowerCase().includes(loweredQuery) && !entryPath.toLowerCase().includes(loweredQuery)) {
        continue;
      }

      try {
        const stat = fs.statSync(entryPath);
        results.push({
          path: entryPath,
          name: entry.name,
          directory: currentDir,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        });
      } catch {
        
      }
    }
  }

  for (const root of roots) {
    if (results.length >= maxResults) {
      break;
    }
    walk(root, 0);
  }

  return results;
}


server.resource(
  "compositions",
  "aftereffects://compositions",
  async (uri) => {
    
    const result = await sendBridgeCommand("listCompositions", {}, 8000, 250);

    return {
      contents: [{
        uri: uri.href,
        mimeType: "application/json",
        text: result
      }]
    };
  }
);


server.tool(
  "run-script",
  "Run a read-only script in After Effects",
  {
    script: z.string().describe("Name of the predefined script to run"),
    parameters: z.record(z.any()).optional().describe("Optional parameters for the script")
  },
  async ({ script, parameters = {} }) => {
    
    const allowedScripts = [
      "listCompositions", 
      "getProjectInfo", 
      "getLayerInfo", 
      "createComposition",
      "createTextLayer",
      "createShapeLayer",
      "createSolidLayer",
      "createAdjustmentLayer",
      "centerLayers",
      "getLayerClipFrames",
      "setLayerProperties",
      "setLayerKeyframe",
      "setLayerExpression",
      "applyEffect",
      "applyEffectTemplate",
      "listLayerEffects",
      "listAvailableEffects",
      "setEffectProperty",
      "setEffectKeyframe",
      "applyLayerPreset",
      "removeLayerEffect",
      "addMarker",
      "setLayerAudioLevels",
      "getLayerAudioInfo",
      "addMarkersFromArray",
      "createCamera",
      "duplicateLayer",
      "deleteLayer",
      "setLayerMask",
      "batchSetLayerProperties",
      "setCompositionProperties",
      "getLayerFull",
      "getCompFull",
      "bridgeTestEffects"
    ];
    
    if (!allowedScripts.includes(script)) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Script "${script}" is not allowed. Allowed scripts are: ${allowedScripts.join(", ")}`
          }
        ],
        isError: true
      };
    }

    try {
      
      const result = await sendBridgeCommand(script, parameters, 15000, 250);

      return bridgeToolResult(result);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);


server.tool(
  "get-results",
  "Get results from the last script executed in After Effects",
  {},
  async () => {
    try {
      const result = readResultsFromTempFile();
      return bridgeToolResult(result);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting results: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);


server.prompt(
  "list-compositions",
  "List compositions in the current After Effects project",
  () => {
    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: "Please list all compositions in the current After Effects project."
        }
      }]
    };
  }
);

server.prompt(
  "analyze-composition",
  {
    compositionName: z.string().describe("Name of the composition to analyze")
  },
  (args) => {
    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Please analyze the composition named "${args.compositionName}" in the current After Effects project. Provide details about its duration, frame rate, resolution, and layers.`
        }
      }]
    };
  }
);


server.prompt(
  "create-composition",
  "Create a new composition with specified settings",
  () => {
    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Please create a new composition with custom settings. You can specify parameters like name, width, height, frame rate, etc.`
        }
      }]
    };
  }
);


server.tool(
  "get-help",
  "Get help on using the After Effects MCP integration",
  {},
  async () => {
    return {
      content: [
        {
          type: "text",
          text: `# After Effects MCP Integration Help

To use this integration with After Effects, follow these steps:

 1. **Install the scripts in After Effects**
   - Run \`node install-bridge.js\` with administrator privileges
   - This copies the necessary scripts to your After Effects installation

2. **Open After Effects**
   - Launch Adobe After Effects 
   - Open a project that you want to work with

3. **Open the MCP Bridge Auto panel**
   - In After Effects, go to Window > mcp-bridge-auto.jsx
   - The panel will automatically check for commands every few seconds

4. **Run scripts through MCP**
   - Use the \`run-script\` tool to queue a command
   - The Auto panel will detect and run the command automatically
   - Results will be saved to a temp file

5. **Get results through MCP**
   - After a command is executed, use the \`get-results\` tool
   - This will retrieve the results from After Effects

Available scripts:
- getProjectInfo: Information about the current project
- listCompositions: List all compositions in the project
- getLayerInfo: Information about layers in the active composition
- createComposition: Create a new composition
- createTextLayer: Create a new text layer
- createShapeLayer: Create a new shape layer
- createSolidLayer: Create a new solid layer
- createAdjustmentLayer: Create a new adjustment layer
- centerLayers: Center one, selected, or all layers in a composition
- getLayerClipFrames: Get clip start/end frames and source frame range for a layer
- setLayerProperties: Set properties for a layer
- setLayerKeyframe: Set a keyframe for a layer property
- setLayerExpression: Set an expression for a layer property
- applyEffect: Apply an effect to a layer
- applyEffectTemplate: Apply a predefined effect template to a layer
- listLayerEffects: List effects on a layer (optionally with all properties)
- listAvailableEffects: List all effects available in this After Effects installation
- setEffectProperty: Edit any property on an effect by name/index/path
- setEffectKeyframe: Add/edit keyframes for effect properties with graph/easing controls
- applyLayerPreset: Apply an .ffx preset file to a layer
- removeLayerEffect: Remove one effect (or all effects) from a layer
- addMarker: Add a layer or composition marker at a specified time
- setLayerAudioLevels: Set audio levels (dB) on an audio/AV layer, optionally with keyframes
- getLayerAudioInfo: Get audio metadata, source file path, existing markers, and audio level keyframes for a layer
- addMarkersFromArray: Add multiple markers at once from an array of {timeInSeconds, comment, duration, label} objects

Effect Templates:
- gaussian-blur: Simple Gaussian blur effect
- directional-blur: Motion blur in a specific direction
- color-balance: Adjust hue, lightness, and saturation
- brightness-contrast: Basic brightness and contrast adjustment
- curves: Advanced color adjustment using curves
- glow: Add a glow effect to elements
- drop-shadow: Add a customizable drop shadow
- cinematic-look: Combination of effects for a cinematic appearance
- text-pop: Effects to make text stand out (glow and shadow)

Note: The auto-running panel can be left open in After Effects to continuously listen for commands from external applications.`
        }
      ]
    };
  }
);


server.tool(
  "create-composition",
  "Create a new composition in After Effects with specified parameters",
  {
    name: z.string().describe("Name of the composition"),
    width: z.number().int().positive().describe("Width of the composition in pixels"),
    height: z.number().int().positive().describe("Height of the composition in pixels"),
    pixelAspect: z.number().positive().optional().describe("Pixel aspect ratio (default: 1.0)"),
    duration: z.number().positive().optional().describe("Duration in seconds (default: 10.0)"),
    frameRate: z.number().positive().optional().describe("Frame rate in frames per second (default: 30.0)"),
    backgroundColor: z.object({
      r: z.number().int().min(0).max(255),
      g: z.number().int().min(0).max(255),
      b: z.number().int().min(0).max(255)
    }).optional().describe("Background color of the composition (RGB values 0-255)")
  },
  async (params) => {
    try {
      
      const result = await sendBridgeCommand("createComposition", params, 8000, 250);

      return bridgeToolResult(result);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing composition creation: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "create-adjustment-layer",
  "Create an adjustment layer in the specified composition (or active comp).",
  {
    compName: z.string().optional().describe("Composition name. If omitted, active composition is used."),
    name: z.string().optional().describe("Layer name (default: Adjustment Layer)."),
    position: z.array(z.number()).optional().describe("Layer position [x,y] or [x,y,z]."),
    size: z.array(z.number()).optional().describe("Layer size [width,height]. Defaults to comp dimensions."),
    startTime: z.number().optional().describe("Layer start time in seconds."),
    duration: z.number().positive().optional().describe("Layer duration in seconds."),
  },
  async (parameters) => {
    try {
      const result = await sendBridgeCommand("createAdjustmentLayer", parameters, 7000, 250);

      return bridgeToolResult(result);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error creating adjustment layer: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "center-layers",
  "Center one layer, selected layers, or all layers in a composition.",
  {
    compIndex: z.number().int().positive().describe("1-based composition index."),
    layerIndex: z.number().int().positive().optional().describe("Target layer index when centering a single layer."),
    layerName: z.string().optional().describe("Target layer name when centering a single layer."),
    selectedOnly: z.boolean().optional().describe("Center only selected layers in the composition."),
    allLayers: z.boolean().optional().describe("Center all layers in the composition."),
  },
  async (parameters) => {
    try {
      const result = await sendBridgeCommand("centerLayers", parameters, 7000, 250);

      return bridgeToolResult(result);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error centering layers: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "get-layer-clip-frames",
  "Get a layer's clip start/end frames, source frame range, and duration in frames.",
  {
    compIndex: z.number().int().positive().describe("1-based composition index."),
    layerIndex: z.number().int().positive().optional().describe("Target layer index."),
    layerName: z.string().optional().describe("Target layer name if not using layerIndex."),
  },
  async (parameters) => {
    try {
      const result = await sendBridgeCommand("getLayerClipFrames", parameters, 7000, 250);

      return bridgeToolResult(result);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting layer clip frames: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);




const LayerIdentifierSchema = {
  compIndex: z.number().int().positive().describe("1-based index of the target composition in the project panel."),
  layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition.")
};



const KeyframeValueSchema = z.any().describe("The value for the keyframe (e.g., [x,y] for Position, [w,h] for Scale, angle for Rotation, percentage for Opacity)");


server.tool(
  "setLayerKeyframe", 
  "Set a keyframe for a specific layer property at a given time.",
  {
    ...LayerIdentifierSchema, 
    propertyName: z.string().describe("Name of the property to keyframe (e.g., 'Position', 'Scale', 'Rotation', 'Opacity')."),
    timeInSeconds: z.number().describe("The time (in seconds) for the keyframe."),
    value: KeyframeValueSchema
  },
  async (parameters) => {
    try {
      
      const result = await sendBridgeCommand("setLayerKeyframe", parameters, 8000, 250);

      return bridgeToolResult(result);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing setLayerKeyframe command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);


server.tool(
  "setLayerExpression", 
  "Set or remove an expression for a specific layer property.",
  {
    ...LayerIdentifierSchema, 
    propertyName: z.string().describe("Name of the property to apply the expression to (e.g., 'Position', 'Scale', 'Rotation', 'Opacity')."),
    expressionString: z.string().describe("The JavaScript expression string. Provide an empty string (\"\") to remove the expression.")
  },
  async (parameters) => {
    try {
      
      const result = await sendBridgeCommand("setLayerExpression", parameters, 8000, 250);

      return bridgeToolResult(result);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing setLayerExpression command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);





server.tool(
  "test-animation",
  "Test animation functionality in After Effects",
  {
    operation: z.enum(["keyframe", "expression"]).describe("The animation operation to test"),
    compIndex: z.number().int().positive().describe("Composition index (usually 1)"),
    layerIndex: z.number().int().positive().describe("Layer index (usually 1)")
  },
  async (params) => {
    try {
      
      const timestamp = new Date().getTime();
      const tempFile = path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), `ae_test_${timestamp}.jsx`);
      
      
      let scriptContent = "";
      if (params.operation === "keyframe") {
        scriptContent = `
          try {
            var comp = app.project.items[${params.compIndex}];
            var layer = comp.layers[${params.layerIndex}];
            var prop = layer.property("Transform").property("Opacity");
            var time = 1; // 1 second
            var value = 25; // 25% opacity
            prop.setValueAtTime(time, value);
            var resultFile = new File("${path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'ae_test_result.txt').replace(/\\/g, '\\\\')}");
            resultFile.open("w");
            resultFile.write("SUCCESS: Added keyframe at time " + time + " with value " + value);
            resultFile.close();
            alert("Test successful: Added opacity keyframe at " + time + "s with value " + value + "%");
          } catch (e) {
            var errorFile = new File("${path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'ae_test_error.txt').replace(/\\/g, '\\\\')}");
            errorFile.open("w");
            errorFile.write("ERROR: " + e.toString());
            errorFile.close();
            
            alert("Test failed: " + e.toString());
          }
        `;
      } else if (params.operation === "expression") {
        scriptContent = `
          try {
            var comp = app.project.items[${params.compIndex}];
            var layer = comp.layers[${params.layerIndex}];
            var prop = layer.property("Transform").property("Position");
            var expression = "wiggle(3, 30)";
            prop.expression = expression;
            var resultFile = new File("${path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'ae_test_result.txt').replace(/\\/g, '\\\\')}");
            resultFile.open("w");
            resultFile.write("SUCCESS: Added expression: " + expression);
            resultFile.close();
            alert("Test successful: Added position expression: " + expression);
          } catch (e) {
            var errorFile = new File("${path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'ae_test_error.txt').replace(/\\/g, '\\\\')}");
            errorFile.open("w");
            errorFile.write("ERROR: " + e.toString());
            errorFile.close();
            
            alert("Test failed: " + e.toString());
          }
        `;
      }
      
      
      fs.writeFileSync(tempFile, scriptContent);
      console.error(`Written test script to: ${tempFile}`);
      
      
      return {
        content: [
          {
            type: "text",
            text: `I've created a direct test script for the ${params.operation} operation.

Please run this script manually in After Effects:
1. In After Effects, go to File > Scripts > Run Script File...
2. Navigate to: ${tempFile}
3. You should see an alert confirming the result.

This bypasses the MCP Bridge Auto panel and will directly modify the specified layer.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error creating test script: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);





server.tool(
  "apply-effect",
  "Apply an effect to a layer in After Effects",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition in the project panel."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    effect: z.string().optional().describe("Generic effect identifier. Can be either exact display name or matchName."),
    effectIdentifier: z.string().optional().describe("Alias for effect. Can be either exact display name or matchName."),
    effectName: z.string().optional().describe("Display name of the effect to apply (e.g., 'Gaussian Blur')."),
    effectMatchName: z.string().optional().describe("After Effects internal name for the effect (more reliable, e.g., 'ADBE Gaussian Blur 2')."),
    effectCategory: z.string().optional().describe("Optional category for filtering effects."),
    presetPath: z.string().optional().describe("Optional path to an effect preset file (.ffx)."),
    effectSettings: z.record(z.any()).optional().describe("Optional parameters for the effect (e.g., { 'Blurriness': 25 }).")
  },
  async (parameters) => {
    try {
      
      const result = await sendBridgeCommand("applyEffect", parameters, 8000, 250);

      return bridgeToolResult(result);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing apply-effect command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "add-any-effect",
  "Add any After Effects effect to a layer by matchName or display name.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition in the project panel."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    effect: z.string().describe("Effect identifier. Prefer matchName for reliability (e.g., 'ADBE Gaussian Blur 2')."),
    effectSettings: z.record(z.any()).optional().describe("Optional parameters to set immediately after adding the effect.")
  },
  async (parameters) => {
    try {
      const result = await sendBridgeCommand("applyEffect", {
        compIndex: parameters.compIndex,
        layerIndex: parameters.layerIndex,
        effect: parameters.effect,
        effectSettings: parameters.effectSettings || {}
      }, 7000, 250);

      return bridgeToolResult(result);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error adding effect: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);


server.tool(
  "apply-effect-template",
  "Apply a predefined effect template to a layer in After Effects",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition in the project panel."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    templateName: z.enum([
      "gaussian-blur", 
      "directional-blur", 
      "color-balance", 
      "brightness-contrast",
      "curves",
      "glow",
      "drop-shadow",
      "cinematic-look",
      "text-pop"
    ]).describe("Name of the effect template to apply."),
    customSettings: z.record(z.any()).optional().describe("Optional custom settings to override defaults.")
  },
  async (parameters) => {
    try {
      
      const result = await sendBridgeCommand("applyEffectTemplate", parameters, 8000, 250);

      return bridgeToolResult(result);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing apply-effect-template command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "list-layer-effects",
  "List effects on a layer, with optional recursive property details.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition in the project panel."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    includeProperties: z.boolean().optional().describe("Include effect property trees (default: false)."),
    includeValues: z.boolean().optional().describe("Include current values for non-group properties (default: false)."),
    maxDepth: z.number().int().positive().max(8).optional().describe("Maximum property recursion depth when includeProperties is true (default: 2).")
  },
  async (parameters) => {
    try {
      const result = await sendBridgeCommand("listLayerEffects", parameters, 7000, 250);

      return bridgeToolResult(result);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error listing layer effects: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "list-available-effects",
  "List all effects available in this After Effects installation, with optional text filter.",
  {
    query: z.string().optional().describe("Optional text filter. Matches effect name, matchName, and category."),
    includeObsolete: z.boolean().optional().describe("Include obsolete effects (default: false)."),
    maxResults: z.number().int().positive().max(20000).optional().describe("Maximum results to return (default: 5000).")
  },
  async (parameters) => {
    try {
      const result = await sendBridgeCommand("listAvailableEffects", parameters, 10000, 250);

      return bridgeToolResult(result);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error listing available effects: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "set-effect-property",
  "Set or keyframe any property on an existing layer effect using name/index/path.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition in the project panel."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    effectIndex: z.number().int().positive().optional().describe("1-based index of the effect in the layer's Effects group."),
    effectName: z.string().optional().describe("Display name of the effect to target."),
    effectMatchName: z.string().optional().describe("Internal matchName of the effect to target."),
    propertyPath: z.array(z.union([z.string(), z.number().int().positive()])).optional().describe("Path from effect root to target property, e.g. ['Compositing Options', 'Effect Opacity'] or [3, 1]."),
    propertyName: z.string().optional().describe("Fallback target property name or matchName."),
    propertyIndex: z.number().int().positive().optional().describe("Fallback target property index under the effect root."),
    keyframeIndex: z.number().int().positive().optional().describe("Optional keyframe index to edit graph/value directly without resolving by time."),
    value: z.any().optional().describe("Value to assign to the target property."),
    timeInSeconds: z.number().optional().describe("If provided, sets a keyframe at this time using value."),
    expressionString: z.string().optional().describe("Optional expression string to set on the target property."),
    keyframeOptions: z.object({
      easyEase: z.boolean().optional().describe("Apply Easy Ease to the keyframe."),
      easyEaseInfluence: z.number().min(0.1).max(100).optional().describe("Influence used when easyEase is true (default: 33.333)."),
      interpolationIn: z.enum(["linear", "bezier", "hold"]).optional().describe("Incoming interpolation type."),
      interpolationOut: z.enum(["linear", "bezier", "hold"]).optional().describe("Outgoing interpolation type."),
      temporalContinuous: z.boolean().optional().describe("Enable or disable temporal continuity."),
      temporalAutoBezier: z.boolean().optional().describe("Enable or disable temporal auto-bezier."),
      roving: z.boolean().optional().describe("Set roving keyframe when supported by the property."),
      easeIn: z.union([
        z.object({
          speed: z.number().optional().describe("Incoming temporal speed."),
          influence: z.number().min(0.1).max(100).optional().describe("Incoming temporal influence (0.1-100).")
        }),
        z.array(z.object({
          speed: z.number().optional().describe("Per-dimension incoming speed."),
          influence: z.number().min(0.1).max(100).optional().describe("Per-dimension incoming influence (0.1-100).")
        })).min(1)
      ]).optional(),
      easeOut: z.union([
        z.object({
          speed: z.number().optional().describe("Outgoing temporal speed."),
          influence: z.number().min(0.1).max(100).optional().describe("Outgoing temporal influence (0.1-100).")
        }),
        z.array(z.object({
          speed: z.number().optional().describe("Per-dimension outgoing speed."),
          influence: z.number().min(0.1).max(100).optional().describe("Per-dimension outgoing influence (0.1-100).")
        })).min(1)
      ]).optional(),
      spatialTangentsIn: z.array(z.number()).optional().describe("Incoming spatial tangent array for spatial properties (e.g., [x,y] or [x,y,z])."),
      spatialTangentsOut: z.array(z.number()).optional().describe("Outgoing spatial tangent array for spatial properties (e.g., [x,y] or [x,y,z])."),
      spatialContinuous: z.boolean().optional().describe("Enable or disable spatial continuity on spatial properties."),
      spatialAutoBezier: z.boolean().optional().describe("Enable or disable spatial auto-bezier on spatial properties.")
    }).optional().describe("Optional graph/easing controls applied to the keyframe at timeInSeconds.")
  },
  async (parameters) => {
    try {
      const result = await sendBridgeCommand("setEffectProperty", parameters, 7000, 250);

      return bridgeToolResult(result);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error setting effect property: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "set-effect-keyframe",
  "Set an effect property keyframe with optional graph interpolation and easy-ease controls.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition in the project panel."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    effectIndex: z.number().int().positive().optional().describe("1-based index of the effect in the layer's Effects group."),
    effectName: z.string().optional().describe("Display name of the effect to target."),
    effectMatchName: z.string().optional().describe("Internal matchName of the effect to target."),
    propertyPath: z.array(z.union([z.string(), z.number().int().positive()])).optional().describe("Path from effect root to target property, e.g. ['Compositing Options', 'Effect Opacity'] or [3, 1]."),
    propertyName: z.string().optional().describe("Fallback target property name or matchName."),
    propertyIndex: z.number().int().positive().optional().describe("Fallback target property index under the effect root."),
    keyframeIndex: z.number().int().positive().optional().describe("Optional keyframe index to edit graph/value directly without resolving by time."),
    value: z.any().describe("Value to set at the keyframe time."),
    timeInSeconds: z.number().optional().describe("Time of the keyframe in seconds."),
    keyframeOptions: z.object({
      easyEase: z.boolean().optional().describe("Apply Easy Ease to the keyframe."),
      easyEaseInfluence: z.number().min(0.1).max(100).optional().describe("Influence used when easyEase is true (default: 33.333)."),
      interpolationIn: z.enum(["linear", "bezier", "hold"]).optional().describe("Incoming interpolation type."),
      interpolationOut: z.enum(["linear", "bezier", "hold"]).optional().describe("Outgoing interpolation type."),
      temporalContinuous: z.boolean().optional().describe("Enable or disable temporal continuity."),
      temporalAutoBezier: z.boolean().optional().describe("Enable or disable temporal auto-bezier."),
      roving: z.boolean().optional().describe("Set roving keyframe when supported by the property."),
      easeIn: z.union([
        z.object({
          speed: z.number().optional().describe("Incoming temporal speed."),
          influence: z.number().min(0.1).max(100).optional().describe("Incoming temporal influence (0.1-100).")
        }),
        z.array(z.object({
          speed: z.number().optional().describe("Per-dimension incoming speed."),
          influence: z.number().min(0.1).max(100).optional().describe("Per-dimension incoming influence (0.1-100).")
        })).min(1)
      ]).optional(),
      easeOut: z.union([
        z.object({
          speed: z.number().optional().describe("Outgoing temporal speed."),
          influence: z.number().min(0.1).max(100).optional().describe("Outgoing temporal influence (0.1-100).")
        }),
        z.array(z.object({
          speed: z.number().optional().describe("Per-dimension outgoing speed."),
          influence: z.number().min(0.1).max(100).optional().describe("Per-dimension outgoing influence (0.1-100).")
        })).min(1)
      ]).optional(),
      spatialTangentsIn: z.array(z.number()).optional().describe("Incoming spatial tangent array for spatial properties (e.g., [x,y] or [x,y,z])."),
      spatialTangentsOut: z.array(z.number()).optional().describe("Outgoing spatial tangent array for spatial properties (e.g., [x,y] or [x,y,z])."),
      spatialContinuous: z.boolean().optional().describe("Enable or disable spatial continuity on spatial properties."),
      spatialAutoBezier: z.boolean().optional().describe("Enable or disable spatial auto-bezier on spatial properties.")
    }).optional().describe("Optional graph/easing controls for the created keyframe.")
  },
  async (parameters) => {
    try {
      const result = await sendBridgeCommand("setEffectKeyframe", parameters, 7000, 250);

      return bridgeToolResult(result);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error setting effect keyframe: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "list-presets",
  "List available After Effects .ffx presets from common or provided folders.",
  {
    presetRoots: z.array(z.string()).optional().describe("Optional absolute directories to search for presets. Defaults to common Adobe preset locations."),
    recursive: z.boolean().optional().describe("Recursively search subdirectories (default: true)."),
    maxResults: z.number().int().positive().max(2000).optional().describe("Maximum number of preset files to return (default: 500)."),
    maxDepth: z.number().int().positive().max(25).optional().describe("Maximum directory depth when recursive is true (default: 10).")
  },
  async (parameters) => {
    try {
      const roots = uniqueExistingDirs(parameters.presetRoots && parameters.presetRoots.length > 0
        ? parameters.presetRoots
        : getDefaultPresetRoots());
      const recursive = parameters.recursive !== undefined ? parameters.recursive : true;
      const maxResults = parameters.maxResults || 500;
      const maxDepth = parameters.maxDepth || 10;

      const presets = collectPresetFiles(roots, recursive, undefined, maxResults, maxDepth);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              searchedRoots: roots,
              recursive,
              maxResults,
              resultCount: presets.length,
              presets
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error listing presets: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "search-presets",
  "Search After Effects .ffx presets by name or path.",
  {
    query: z.string().describe("Search text to match in preset filename or full path."),
    presetRoots: z.array(z.string()).optional().describe("Optional absolute directories to search. Defaults to common Adobe preset locations."),
    recursive: z.boolean().optional().describe("Recursively search subdirectories (default: true)."),
    maxResults: z.number().int().positive().max(2000).optional().describe("Maximum number of preset files to return (default: 200)."),
    maxDepth: z.number().int().positive().max(25).optional().describe("Maximum directory depth when recursive is true (default: 10).")
  },
  async (parameters) => {
    try {
      const roots = uniqueExistingDirs(parameters.presetRoots && parameters.presetRoots.length > 0
        ? parameters.presetRoots
        : getDefaultPresetRoots());
      const recursive = parameters.recursive !== undefined ? parameters.recursive : true;
      const maxResults = parameters.maxResults || 200;
      const maxDepth = parameters.maxDepth || 10;

      const presets = collectPresetFiles(roots, recursive, parameters.query, maxResults, maxDepth);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              query: parameters.query,
              searchedRoots: roots,
              recursive,
              maxResults,
              resultCount: presets.length,
              presets
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching presets: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "apply-preset",
  "Apply an After Effects .ffx preset file to a layer.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition in the project panel."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    presetPath: z.string().describe("Absolute path to the .ffx preset file."),
  },
  async (parameters) => {
    try {
      const result = await sendBridgeCommand("applyLayerPreset", parameters, 7000, 250);

      return bridgeToolResult(result);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error applying preset: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);




// Removed redundant duplicates `mcp_aftereffects_applyEffect` and
// `mcp_aftereffects_applyEffectTemplate` (they used a fixed 1s sleep + file read).
// Use `apply-effect` and `apply-effect-template` instead - both now wait inline
// and return the real result via the command-id matching path.

server.tool(
  "mcp_aftereffects_get_effects_help",
  "Get help on using After Effects effects",
  {},
  async () => {
    return {
      content: [
        {
          type: "text",
          text: `# After Effects Effects Help

## Common Effect Match Names
These are internal names used by After Effects that can be used with the \`effectMatchName\` parameter:

### Blur & Sharpen
- Gaussian Blur: "ADBE Gaussian Blur 2"
- Camera Lens Blur: "ADBE Camera Lens Blur"
- Directional Blur: "ADBE Directional Blur"
- Radial Blur: "ADBE Radial Blur"
- Smart Blur: "ADBE Smart Blur"
- Unsharp Mask: "ADBE Unsharp Mask"

### Color Correction
- Brightness & Contrast: "ADBE Brightness & Contrast 2"
- Color Balance: "ADBE Color Balance (HLS)"
- Color Balance (RGB): "ADBE Pro Levels2"
- Curves: "ADBE CurvesCustom"
- Exposure: "ADBE Exposure2"
- Hue/Saturation: "ADBE HUE SATURATION"
- Levels: "ADBE Pro Levels2"
- Vibrance: "ADBE Vibrance"

### Stylistic
- Glow: "ADBE Glow"
- Drop Shadow: "ADBE Drop Shadow"
- Bevel Alpha: "ADBE Bevel Alpha"
- Noise: "ADBE Noise"
- Fractal Noise: "ADBE Fractal Noise"
- CC Particle World: "CC Particle World"
- CC Light Sweep: "CC Light Sweep"

## Effect Templates
The following predefined effect templates are available:

- \`gaussian-blur\`: Simple Gaussian blur effect
- \`directional-blur\`: Motion blur in a specific direction
- \`color-balance\`: Adjust hue, lightness, and saturation
- \`brightness-contrast\`: Basic brightness and contrast adjustment
- \`curves\`: Advanced color adjustment using curves
- \`glow\`: Add a glow effect to elements
- \`drop-shadow\`: Add a customizable drop shadow
- \`cinematic-look\`: Combination of effects for a cinematic appearance
- \`text-pop\`: Effects to make text stand out (glow and shadow)

## Example Usage
To apply a Gaussian blur effect:

\`\`\`json
{
  "compIndex": 1,
  "layerIndex": 1,
  "effectMatchName": "ADBE Gaussian Blur 2",
  "effectSettings": {
    "Blurriness": 25
  }
}
\`\`\`

To apply the "cinematic-look" template:

\`\`\`json
{
  "compIndex": 1,
  "layerIndex": 1,
  "templateName": "cinematic-look"
}
\`\`\`
`
        }
      ]
    };
  }
);


server.tool(
  "run-bridge-test",
  "Run the bridge test effects script to verify communication and apply test effects",
  {},
  async () => {
    try {
      
      // Fire-and-forget queue (results fetched later via get-results); still run
      // it through the mutex so it can't clobber a concurrent command's slot.
      await bridgeMutex(async () => {
        clearResultsFile();
        writeCommandFile("bridgeTestEffects", {});
      });

      return {
        content: [
          {
            type: "text",
            text: `Bridge test effects command has been queued.\n` +
                  `Please ensure the "MCP Bridge Auto" panel is open in After Effects.\n` +
                  `Use the "get-results" tool after a few seconds to check for the test results.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing bridge test command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "remove-effect",
  "Remove one specific effect (or all effects) from a layer.",
  {
    compIndex: z.number().int().positive().describe("1-based composition index."),
    layerIndex: z.number().int().positive().describe("1-based layer index."),
    effectIndex: z.number().int().positive().optional().describe("1-based effect index within the layer's Effects group."),
    effectName: z.string().optional().describe("Display name of the effect to remove."),
    effectMatchName: z.string().optional().describe("Internal match name of the effect to remove."),
    removeAll: z.boolean().optional().describe("If true, remove all effects from the layer."),
  },
  async (parameters) => {
    try {
      const result = await sendBridgeCommand("removeLayerEffect", parameters, 7000, 250);
      return bridgeToolResult(result);
    } catch (error) {
      return { content: [{ type: "text", text: `Error removing effect: ${String(error)}` }], isError: true };
    }
  }
);

server.tool(
  "add-marker",
  "Add a marker to a layer or composition at a specified time. Markers can include a comment, label color, chapter name, URL and duration.",
  {
    compIndex: z.number().int().positive().describe("1-based composition index."),
    markerType: z.enum(["layer", "comp"]).optional().describe("'layer' (default) or 'comp' for a composition marker."),
    layerIndex: z.number().int().positive().optional().describe("Target layer index (required for layer markers)."),
    layerName: z.string().optional().describe("Target layer name (alternative to layerIndex)."),
    timeInSeconds: z.number().optional().describe("Time in seconds where the marker is placed. Defaults to current time."),
    comment: z.string().optional().describe("Marker comment / label text."),
    duration: z.number().optional().describe("Marker duration in seconds (0 = point marker)."),
    chapter: z.string().optional().describe("Chapter name associated with the marker."),
    url: z.string().optional().describe("URL to open when the marker is reached (for web export)."),
    label: z.number().int().min(0).max(16).optional().describe("Label color index (0 = none, 1-16 map to AE label colors)."),
  },
  async (parameters) => {
    try {
      const result = await sendBridgeCommand("addMarker", parameters, 7000, 250);
      return bridgeToolResult(result);
    } catch (error) {
      return { content: [{ type: "text", text: `Error adding marker: ${String(error)}` }], isError: true };
    }
  }
);

server.tool(
  "set-audio-levels",
  "Set the audio levels (in dB) for an audio or AV layer. Supports per-channel control and optional keyframing.",
  {
    compIndex: z.number().int().positive().describe("1-based composition index."),
    layerIndex: z.number().int().positive().describe("1-based layer index."),
    level: z.number().optional().describe("Level in dB applied to both left and right channels (e.g. 0 = unity, -6 = half volume, -96 = silence)."),
    leftLevel: z.number().optional().describe("Left channel level in dB (overrides level for left channel)."),
    rightLevel: z.number().optional().describe("Right channel level in dB (overrides level for right channel)."),
    timeInSeconds: z.number().optional().describe("If provided, sets a keyframe at this time instead of a static value."),
  },
  async (parameters) => {
    try {
      const result = await sendBridgeCommand("setLayerAudioLevels", parameters, 7000, 250);
      return bridgeToolResult(result);
    } catch (error) {
      return { content: [{ type: "text", text: `Error setting audio levels: ${String(error)}` }], isError: true };
    }
  }
);

function analyzeWavAmplitudes(filePath: string, numPoints: number = 200): {
  duration: number;
  sampleRate: number;
  channels: number;
  amplitudes: number[];
  peakTimes: number[];
  waveformPoints: Array<{ time: number; amplitude: number }>;
} | null {
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.slice(0, 4).toString("ascii") !== "RIFF") return null;
    if (buf.slice(8, 12).toString("ascii") !== "WAVE") return null;

    let offset = 12;
    let fmtChannels = 0, fmtSampleRate = 0, fmtBitsPerSample = 0, fmtAudioFormat = 0;
    let dataOffset = -1, dataSize = 0;

    while (offset < buf.length - 8) {
      const chunkId = buf.slice(offset, offset + 4).toString("ascii");
      const chunkSize = buf.readUInt32LE(offset + 4);
      if (chunkId === "fmt ") {
        fmtAudioFormat  = buf.readUInt16LE(offset + 8);
        fmtChannels     = buf.readUInt16LE(offset + 10);
        fmtSampleRate   = buf.readUInt32LE(offset + 12);
        fmtBitsPerSample = buf.readUInt16LE(offset + 22);
      } else if (chunkId === "data") {
        dataOffset = offset + 8;
        dataSize   = chunkSize;
      }
      offset += 8 + chunkSize + (chunkSize % 2 !== 0 ? 1 : 0);
    }

    if (dataOffset < 0 || fmtAudioFormat !== 1 || fmtChannels === 0) return null;

    const bytesPerSample = fmtBitsPerSample / 8;
    const totalSamples   = Math.floor(dataSize / (bytesPerSample * fmtChannels));
    const duration       = totalSamples / fmtSampleRate;
    const samplesPerPoint = Math.max(1, Math.floor(totalSamples / numPoints));
    const maxVal = fmtBitsPerSample === 8 ? 128 : Math.pow(2, fmtBitsPerSample - 1);

    const amplitudes: number[] = [];
    const waveformPoints: Array<{ time: number; amplitude: number }> = [];

    for (let i = 0; i < numPoints; i++) {
      let maxAmp = 0;
      const startSample = i * samplesPerPoint;
      const endSample   = Math.min(startSample + samplesPerPoint, totalSamples);
      for (let s = startSample; s < endSample; s++) {
        for (let c = 0; c < fmtChannels; c++) {
          const bytePos = dataOffset + (s * fmtChannels + c) * bytesPerSample;
          if (bytePos + bytesPerSample > buf.length) continue;
          let sample = 0;
          if (fmtBitsPerSample === 16)       sample = Math.abs(buf.readInt16LE(bytePos));
          else if (fmtBitsPerSample === 8)   sample = Math.abs(buf.readUInt8(bytePos) - 128);
          else if (fmtBitsPerSample === 24) {
            const lo = buf.readUInt16LE(bytePos);
            const hi = buf.readInt8(bytePos + 2);
            sample = Math.abs((hi << 16) | lo);
          }
          else if (fmtBitsPerSample === 32)  sample = Math.abs(buf.readInt32LE(bytePos));
          if (sample > maxAmp) maxAmp = sample;
        }
      }
      const norm = maxAmp / maxVal;
      const t    = (i / numPoints) * duration;
      amplitudes.push(norm);
      waveformPoints.push({ time: parseFloat(t.toFixed(4)), amplitude: parseFloat(norm.toFixed(4)) });
    }

    const maxAmplitude = Math.max(...amplitudes);
    const threshold = maxAmplitude * 0.6;
    const minGapSamples = Math.floor(numPoints * 0.03);
    const peakTimes: number[] = [];
    let lastPeakIdx = -minGapSamples;

    for (let i = 1; i < amplitudes.length - 1; i++) {
      if (
        amplitudes[i] > threshold &&
        amplitudes[i] >= amplitudes[i - 1] &&
        amplitudes[i] >= amplitudes[i + 1] &&
        i - lastPeakIdx >= minGapSamples
      ) {
        peakTimes.push(parseFloat(waveformPoints[i].time.toFixed(3)));
        lastPeakIdx = i;
      }
    }

    return { duration, sampleRate: fmtSampleRate, channels: fmtChannels, amplitudes, peakTimes, waveformPoints };
  } catch {
    return null;
  }
}

server.tool(
  "get-audio-info",
  "Get audio metadata, source file path, existing markers, and audio level keyframes for a layer in After Effects.",
  {
    compIndex: z.number().int().positive().describe("1-based composition index."),
    layerIndex: z.number().int().positive().optional().describe("Target layer index."),
    layerName: z.string().optional().describe("Target layer name (alternative to layerIndex)."),
  },
  async (parameters) => {
    try {
      const result = await sendBridgeCommand("getLayerAudioInfo", parameters, 7000, 250);
      return bridgeToolResult(result);
    } catch (error) {
      return { content: [{ type: "text", text: `Error getting audio info: ${String(error)}` }], isError: true };
    }
  }
);

server.tool(
  "analyze-audio-waveform",
  "Analyze a WAV audio file to extract waveform amplitude data and detect peaks/transients. First call get-audio-info to retrieve the sourceFilePath, then pass it here. Returns normalized amplitude values (0-1) at evenly spaced time intervals plus an array of peak times where transients are detected.",
  {
    filePath: z.string().describe("Absolute path to the WAV audio file (obtained from get-audio-info sourceFilePath)."),
    numPoints: z.number().int().positive().optional().describe("Number of amplitude samples to return (default: 200). Higher = more detail."),
  },
  async ({ filePath, numPoints = 200 }) => {
    try {
      if (!fs.existsSync(filePath)) {
        return { content: [{ type: "text", text: JSON.stringify({ status: "error", message: `File not found: ${filePath}` }) }], isError: true };
      }
      const result = analyzeWavAmplitudes(filePath, numPoints);
      if (!result) {
        return { content: [{ type: "text", text: JSON.stringify({ status: "error", message: "Could not parse audio file. Only uncompressed PCM WAV files are supported. For other formats, convert to WAV first." }) }], isError: true };
      }
      return {
        content: [{ type: "text", text: JSON.stringify({
          status: "success",
          filePath,
          duration: result.duration,
          sampleRate: result.sampleRate,
          channels: result.channels,
          numPoints: numPoints,
          peakCount: result.peakTimes.length,
          peakTimes: result.peakTimes,
          waveformPoints: result.waveformPoints
        }, null, 2) }]
      };
    } catch (error) {
      return { content: [{ type: "text", text: `Error analyzing waveform: ${String(error)}` }], isError: true };
    }
  }
);

server.tool(
  "add-markers-bulk",
  "Add multiple layer or composition markers at once. Use this after analyze-audio-waveform to place markers at detected peaks, or to add any set of markers in a single call.",
  {
    compIndex: z.number().int().positive().describe("1-based composition index."),
    markerType: z.enum(["layer", "comp"]).optional().describe("'layer' (default) or 'comp' for composition-level markers."),
    layerIndex: z.number().int().positive().optional().describe("Target layer index (required for layer markers)."),
    layerName: z.string().optional().describe("Target layer name (alternative to layerIndex)."),
    markers: z.array(z.object({
      timeInSeconds: z.number().describe("Time in seconds for this marker."),
      comment: z.string().optional().describe("Marker comment text."),
      duration: z.number().optional().describe("Marker duration in seconds (0 = point marker)."),
      label: z.number().int().min(0).max(16).optional().describe("Label color index (0-16)."),
      chapter: z.string().optional().describe("Chapter name."),
      url: z.string().optional().describe("URL link."),
    })).describe("Array of markers to add."),
  },
  async (parameters) => {
    try {
      const result = await sendBridgeCommand("addMarkersFromArray", parameters, 10000, 250);
      return bridgeToolResult(result);
    } catch (error) {
      return { content: [{ type: "text", text: `Error adding bulk markers: ${String(error)}` }], isError: true };
    }
  }
);


// ===========================================================================
// Power tools: arbitrary scripting + render queue automation
// ===========================================================================

// Bump this whenever the bridge .jsx protocol changes, and keep it in sync with
// BRIDGE_VERSION in src/scripts/mcp-bridge-auto.jsx. check-bridge warns on mismatch.
const EXPECTED_BRIDGE_VERSION = "1.6.4-mcp-enhanced";

server.tool(
  "check-bridge",
  "Health check: verify the After Effects MCP Bridge panel is open and responding, report its version, the AE version, the shared bridge folder, and the open project/active comp. Run this FIRST when anything times out or behaves oddly. If it reports a version mismatch, re-run `npm run install-bridge` and restart After Effects.",
  {},
  async () => {
    try {
      const raw = await sendBridgeCommand("ping", {}, 5000, 200);
      let parsed: any = null;
      try { parsed = JSON.parse(raw); } catch { /* not JSON */ }

      if (!parsed || parsed.pong !== true) {
        // Capability probe (not just a version-string check): the id-matcher only
        // accepts a result that echoes _commandId, so an OLD panel that DOES answer
        // ping (often even with the correct version string!) but omits _commandId
        // shows up here as a timeout. Read the raw result file directly to tell
        // "stale panel loaded" apart from "panel not open at all" - this is exactly
        // the trap that silently breaks every tool.
        let stalePanelDetected = false;
        let panelReportedVersion: string | null = null;
        try {
          const rf = path.join(getAETempDir(), 'ae_mcp_result.json');
          if (fs.existsSync(rf)) {
            const last = JSON.parse(fs.readFileSync(rf, 'utf8'));
            if (last && last.pong === true && last._commandId === undefined) {
              stalePanelDetected = true;
              panelReportedVersion = last.bridgeVersion ?? null;
            }
          }
        } catch { /* ignore */ }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              ok: false,
              stalePanelDetected,
              panelReportedVersion,
              problem: stalePanelDetected
                ? "Stale bridge panel: it answers ping but does NOT echo _commandId, so the server cannot match its results and every tool will time out. An OLD panel build is still loaded in After Effects."
                : "No response from the bridge panel.",
              hint: stalePanelDetected
                ? "Reload the current panel: run `npm run install-bridge`, then FULLY quit and reopen After Effects, reopen Window > mcp-bridge-auto.jsx, and restart the MCP client. (The version string alone is unreliable - a stale panel can still report the right version.)"
                : "Open After Effects and open the panel via Window > mcp-bridge-auto.jsx (keep it open). Ensure 'Allow Scripts to Write Files and Access Network' is enabled. Also confirm the AE_MCP_BRIDGE_DIR env var (if set) matches on both sides.",
              expectedBridgeVersion: EXPECTED_BRIDGE_VERSION,
              raw
            }, null, 2)
          }]
        };
      }

      const versionMatch = parsed.bridgeVersion === EXPECTED_BRIDGE_VERSION;
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            ok: true,
            bridgeResponding: true,
            bridgeVersion: parsed.bridgeVersion,
            expectedBridgeVersion: EXPECTED_BRIDGE_VERSION,
            versionMatch,
            versionWarning: versionMatch ? null : "Bridge panel is an OLDER/DIFFERENT version than this server. New tools (execute-script, render queue) may return 'Unknown command'. Fix: run `npm run install-bridge`, then restart After Effects and reopen the panel.",
            aeVersion: parsed.aeVersion,
            bridgeFolder: parsed.bridgeFolder,
            project: parsed.project,
            activeComp: parsed.activeComp
          }, null, 2)
        }]
      };
    } catch (error) {
      return { content: [{ type: "text", text: `Error checking bridge: ${String(error)}` }], isError: true };
    }
  }
);

// --- Layer management (dedicated tools; handlers ported from Dakkshin) --------

server.tool(
  "create-text-layer",
  "Create a text layer with full Arabic / RTL support. Direction is auto-detected from the text by default (Arabic -> right-to-left, right-aligned), or force it with `direction`. Works on After Effects in any language.",
  {
    compName: z.string().optional().describe("Composition name (or the active comp if omitted)."),
    text: z.string().describe("The text content. Arabic is fully supported."),
    position: z.array(z.number()).optional().describe("Layer position [x,y] (default centered ~[960,540])."),
    fontSize: z.number().positive().optional().describe("Font size in pixels (default 72)."),
    color: z.array(z.number()).optional().describe("Fill color [r,g,b] with each channel 0-1 (default white)."),
    fontFamily: z.string().optional().describe("Font family (default 'Arial'). For Arabic use a font that supports Arabic, e.g. 'Arial', 'Tahoma', 'Cairo'."),
    alignment: z.enum(["left", "center", "right"]).optional().describe("Paragraph alignment. If omitted and the text is RTL, defaults to 'right'."),
    direction: z.enum(["auto", "rtl", "ltr"]).optional().describe("Text direction. 'auto' (default) = RTL when the text contains Arabic; 'rtl' / 'ltr' to force."),
    startTime: z.number().optional().describe("Layer start time in seconds."),
    duration: z.number().positive().optional().describe("Layer duration in seconds (default 5).")
  },
  async (parameters) => {
    try {
      const result = await sendBridgeCommand("createTextLayer", parameters, 8000, 250);
      return bridgeToolResult(result);
    } catch (error) {
      return { content: [{ type: "text", text: `Error creating text layer: ${String(error)}` }], isError: true };
    }
  }
);

server.tool(
  "create-camera",
  "Create a camera layer in a composition. Select the comp by compName/compIndex (or active comp).",
  {
    compName: z.string().optional().describe("Composition name (recommended)."),
    compIndex: z.number().int().positive().optional().describe("1-based index among compositions, if compName is omitted."),
    name: z.string().optional().describe("Camera layer name (default: 'Camera')."),
    zoom: z.number().optional().describe("Zoom in pixels (default ~1777.78, roughly a 50mm lens for 1080p)."),
    position: z.array(z.number()).optional().describe("Camera position [x,y,z]."),
    pointOfInterest: z.array(z.number()).optional().describe("Point of interest [x,y,z] (ignored for one-node cameras)."),
    oneNode: z.boolean().optional().describe("If true, create a one-node camera (no point of interest).")
  },
  async (parameters) => {
    try {
      const result = await sendBridgeCommand("createCamera", parameters, 8000, 250);
      return bridgeToolResult(result);
    } catch (error) {
      return { content: [{ type: "text", text: `Error creating camera: ${String(error)}` }], isError: true };
    }
  }
);

server.tool(
  "duplicate-layer",
  "Duplicate a layer in a composition, optionally renaming the copy. Target the layer by layerIndex or layerName.",
  {
    compName: z.string().optional().describe("Composition name (or active comp if omitted)."),
    compIndex: z.number().int().positive().optional().describe("1-based comp index, if compName is omitted."),
    layerIndex: z.number().int().positive().optional().describe("1-based layer index to duplicate."),
    layerName: z.string().optional().describe("Layer name to duplicate (alternative to layerIndex)."),
    newName: z.string().optional().describe("Optional new name for the duplicated layer.")
  },
  async (parameters) => {
    try {
      const result = await sendBridgeCommand("duplicateLayer", parameters, 8000, 250);
      return bridgeToolResult(result);
    } catch (error) {
      return { content: [{ type: "text", text: `Error duplicating layer: ${String(error)}` }], isError: true };
    }
  }
);

server.tool(
  "delete-layer",
  "Delete a layer from a composition. Target the layer by layerIndex or layerName.",
  {
    compName: z.string().optional().describe("Composition name (or active comp if omitted)."),
    compIndex: z.number().int().positive().optional().describe("1-based comp index, if compName is omitted."),
    layerIndex: z.number().int().positive().optional().describe("1-based layer index to delete."),
    layerName: z.string().optional().describe("Layer name to delete (alternative to layerIndex).")
  },
  async (parameters) => {
    try {
      const result = await sendBridgeCommand("deleteLayer", parameters, 8000, 250);
      return bridgeToolResult(result);
    } catch (error) {
      return { content: [{ type: "text", text: `Error deleting layer: ${String(error)}` }], isError: true };
    }
  }
);

server.tool(
  "set-layer-mask",
  "Create or modify a mask on a layer. Provide the shape as maskRect (rectangle shorthand) OR maskPath (array of [x,y] vertices, >= 3). Omit maskIndex to add a new mask, or pass it to modify an existing one.",
  {
    compName: z.string().optional().describe("Composition name (or active comp if omitted)."),
    compIndex: z.number().int().positive().optional().describe("1-based comp index, if compName is omitted."),
    layerIndex: z.number().int().positive().optional().describe("1-based layer index."),
    layerName: z.string().optional().describe("Layer name (alternative to layerIndex)."),
    maskIndex: z.number().int().positive().optional().describe("1-based index of an existing mask to modify. Omit to create a new mask."),
    maskRect: z.object({
      top: z.number().optional(), left: z.number().optional(), width: z.number().optional(), height: z.number().optional()
    }).optional().describe("Rectangle shorthand {top,left,width,height} in layer pixels."),
    maskPath: z.array(z.array(z.number())).optional().describe("Array of [x,y] vertices defining the mask shape (>= 3 points)."),
    maskMode: z.enum(["none", "add", "subtract", "intersect", "lighten", "darken", "difference"]).optional().describe("Mask mode (default: 'add')."),
    maskFeather: z.array(z.number()).optional().describe("Feather [x,y] in pixels."),
    maskOpacity: z.number().optional().describe("Mask opacity 0-100."),
    maskExpansion: z.number().optional().describe("Mask expansion in pixels."),
    maskName: z.string().optional().describe("Optional mask name.")
  },
  async (parameters) => {
    try {
      const result = await sendBridgeCommand("setLayerMask", parameters, 8000, 250);
      return bridgeToolResult(result);
    } catch (error) {
      return { content: [{ type: "text", text: `Error setting layer mask: ${String(error)}` }], isError: true };
    }
  }
);

server.tool(
  "batch-set-layer-properties",
  "Set transform/visibility properties on MANY layers in one call. Each operation targets a layer by layerIndex or layerName and may set any of: threeDLayer, position, scale, rotation, opacity, blendMode, startTime, outPoint. Setting position clears its existing keyframes first.",
  {
    compName: z.string().optional().describe("Composition name (or active comp if omitted)."),
    compIndex: z.number().int().positive().optional().describe("1-based comp index, if compName is omitted."),
    operations: z.array(z.object({
      layerIndex: z.number().int().positive().optional().describe("1-based layer index."),
      layerName: z.string().optional().describe("Layer name (alternative to layerIndex)."),
      threeDLayer: z.boolean().optional().describe("Enable/disable 3D for the layer."),
      position: z.array(z.number()).optional().describe("Position [x,y] or [x,y,z]."),
      scale: z.array(z.number()).optional().describe("Scale [w,h] or [w,h,d] in percent."),
      rotation: z.number().optional().describe("Rotation in degrees (Z rotation if 3D)."),
      opacity: z.number().optional().describe("Opacity 0-100."),
      blendMode: z.enum(["normal", "add", "multiply", "screen", "overlay", "softLight", "hardLight", "darken", "lighten", "difference"]).optional().describe("Blending mode."),
      startTime: z.number().optional().describe("Layer start time in seconds."),
      outPoint: z.number().optional().describe("Layer out point in seconds.")
    })).describe("Array of per-layer operations.")
  },
  async (parameters) => {
    try {
      const result = await sendBridgeCommand("batchSetLayerProperties", parameters, 12000, 250);
      return bridgeToolResult(result);
    } catch (error) {
      return { content: [{ type: "text", text: `Error in batch set properties: ${String(error)}` }], isError: true };
    }
  }
);

server.tool(
  "set-composition-properties",
  "Change a composition's settings: duration, frameRate, and/or width+height. Select the comp by compName/compIndex (or active comp).",
  {
    compName: z.string().optional().describe("Composition name (or active comp if omitted)."),
    compIndex: z.number().int().positive().optional().describe("1-based comp index, if compName is omitted."),
    duration: z.number().positive().optional().describe("New duration in seconds."),
    frameRate: z.number().positive().optional().describe("New frame rate (fps)."),
    width: z.number().int().positive().optional().describe("New width in pixels (must be set together with height)."),
    height: z.number().int().positive().optional().describe("New height in pixels (must be set together with width).")
  },
  async (parameters) => {
    try {
      const result = await sendBridgeCommand("setCompositionProperties", parameters, 8000, 250);
      return bridgeToolResult(result);
    } catch (error) {
      return { content: [{ type: "text", text: `Error setting composition properties: ${String(error)}` }], isError: true };
    }
  }
);

server.tool(
  "inspect-comp",
  "Map a whole composition: its settings (size, fps, duration, work area) plus every layer with a useful summary - index, id, name, type, enabled/locked/shy/solo, 3D/adjustment/null flags, in/out/start, parent, blend mode, effect count, mask count, has-audio. Use this to navigate a comp and decide what to edit, then call inspect-layer for one layer's full detail. Select the comp by compName/compIndex, or leave both empty for the active comp.",
  {
    compName: z.string().optional().describe("Composition name (recommended). If omitted with no compIndex, the active comp is used."),
    compIndex: z.number().int().positive().optional().describe("1-based index among compositions. Used if compName is omitted.")
  },
  async (parameters) => {
    try {
      const result = await sendBridgeCommand("getCompFull", parameters, 10000, 250);
      return bridgeToolResult(result);
    } catch (error) {
      return { content: [{ type: "text", text: `Error inspecting composition: ${String(error)}` }], isError: true };
    }
  }
);

server.tool(
  "inspect-layer",
  "Deeply inspect ONE layer so you can SEE its exact state before making precise edits: type, enabled/locked/shy/solo, in/out points, parent, blend mode, 3D flag; the full Transform group (each property's value + expression + keyframes with times/values/interpolation); all effects with their property values; masks (mode/inverted/opacity/feather/expansion); markers; source file/dimensions; and text (font/size/fill) for text layers. Select the comp by compName/compIndex (or active comp) and the layer by layerIndex or layerName.",
  {
    compName: z.string().optional().describe("Composition name (recommended). If omitted with no compIndex, the active comp is used."),
    compIndex: z.number().int().positive().optional().describe("1-based index among compositions. Used if compName is omitted."),
    layerIndex: z.number().int().positive().optional().describe("1-based layer index within the composition."),
    layerName: z.string().optional().describe("Layer name (alternative to layerIndex)."),
    includeKeyframes: z.boolean().optional().describe("Include per-keyframe times/values/interpolation for transform properties (default: true)."),
    maxKeyframes: z.number().int().positive().max(500).optional().describe("Maximum keyframes reported per property (default: 50).")
  },
  async (parameters) => {
    try {
      const result = await sendBridgeCommand("getLayerFull", parameters, 10000, 250);
      return bridgeToolResult(result);
    } catch (error) {
      return { content: [{ type: "text", text: `Error inspecting layer: ${String(error)}` }], isError: true };
    }
  }
);

server.tool(
  "execute-script",
  "Run ARBITRARY ExtendScript (the After Effects scripting DOM) inside After Effects and return the result. This is the most powerful tool: use it for anything the dedicated tools do not cover - masks, track mattes, parenting, 3D layers/cameras/lights, blending modes, precomposing, time remapping, layer styles, text animators, puppet pins, importing/replacing footage, batch edits across many layers, project-wide changes, etc. Your code runs as the body of a function, so use `return <value>;` to send data back, and return only JSON-serializable values (numbers, strings, arrays, plain objects). The whole script already runs inside one undo group, so do NOT call app.beginUndoGroup yourself. Use `app` and `app.project` to reach everything. On error you get back the message and line number. Example script: \"var c = app.project.activeItem; return { name: c.name, layers: c.numLayers };\"",
  {
    script: z.string().describe("ExtendScript code to execute. Runs as a function body; use 'return value;' to return JSON-serializable data. Do not call app.beginUndoGroup (handled automatically)."),
    timeoutMs: z.number().int().positive().max(600000).optional().describe("How long to wait for the result, in milliseconds (default 60000). Increase for long-running scripts.")
  },
  async ({ script, timeoutMs = 60000 }) => {
    try {
      const result = await sendBridgeCommand("executeScript", { script }, timeoutMs, 250);
      return bridgeToolResult(result);
    } catch (error) {
      return { content: [{ type: "text", text: `Error executing script: ${String(error)}` }], isError: true };
    }
  }
);

server.tool(
  "add-to-render-queue",
  "Add a composition to the After Effects render queue and configure its output. Select the comp by compName (most reliable), compIndex (1-based among compositions), or leave both empty to use the active comp. Templates must already exist in this AE installation.",
  {
    compName: z.string().optional().describe("Name of the composition to render (recommended)."),
    compIndex: z.number().int().positive().optional().describe("1-based index among compositions. Used only if compName is omitted."),
    outputPath: z.string().optional().describe("Absolute output file path (e.g. C:\\\\renders\\\\out.mov). The extension should match the output module format."),
    outputModuleTemplate: z.string().optional().describe("Name of an existing Output Module template to apply (e.g. 'Lossless', 'H.264 - Match Render Settings - 15 Mbps')."),
    renderSettingsTemplate: z.string().optional().describe("Name of an existing Render Settings template to apply (e.g. 'Best Settings', 'Draft Settings')."),
    startTime: z.number().optional().describe("Render span start in seconds (optional)."),
    endTime: z.number().optional().describe("Render span end in seconds (optional).")
  },
  async (parameters) => {
    try {
      const result = await sendBridgeCommand("addToRenderQueue", parameters, 8000, 250);
      return bridgeToolResult(result);
    } catch (error) {
      return { content: [{ type: "text", text: `Error adding to render queue: ${String(error)}` }], isError: true };
    }
  }
);

server.tool(
  "render-queue",
  "Inspect or manage the After Effects render queue: list items with their status and output path, clear the whole queue, or remove a single item by index.",
  {
    action: z.enum(["list", "clear", "remove"]).optional().describe("'list' (default), 'clear' (remove all items), or 'remove' a single item by index."),
    index: z.number().int().positive().optional().describe("1-based render queue item index (required when action is 'remove').")
  },
  async (parameters) => {
    try {
      const result = await sendBridgeCommand("manageRenderQueue", parameters, 8000, 250);
      return bridgeToolResult(result);
    } catch (error) {
      return { content: [{ type: "text", text: `Error managing render queue: ${String(error)}` }], isError: true };
    }
  }
);

server.tool(
  "start-render",
  "Render all QUEUED items in the After Effects render queue. IMPORTANT: this BLOCKS After Effects until the render finishes - the AE UI is unresponsive during the render. Add items first with add-to-render-queue. For long renders, raise timeoutMs; if the wait times out the render still continues in AE and you can check status later with render-queue.",
  {
    timeoutMs: z.number().int().positive().max(3600000).optional().describe("Maximum time to wait for the render to finish, in milliseconds (default 300000 = 5 minutes). Set higher for long renders.")
  },
  async ({ timeoutMs = 300000 }) => {
    try {
      const result = await sendBridgeCommand("startRender", {}, timeoutMs, 500);
      return bridgeToolResult(result);
    } catch (error) {
      return { content: [{ type: "text", text: `Error starting render: ${String(error)}` }], isError: true };
    }
  }
);


// --- Background rendering via aerender (a separate headless AE process) -------
// Unlike start-render (which blocks the AE GUI), aerender launches its own
// headless instance, so the user's After Effects stays responsive.

function findAerender(): string | null {
  const override = process.env.AE_AERENDER_PATH;
  if (override && fs.existsSync(override)) return override;
  const years = ["2026", "2025", "2024", "2023", "2022", "2021"];
  const candidates: string[] = [];
  if (process.platform === "win32") {
    const pf = process.env.ProgramFiles || "C:\\Program Files";
    for (const y of years) candidates.push(path.join(pf, "Adobe", `Adobe After Effects ${y}`, "Support Files", "aerender.exe"));
  } else {
    for (const y of years) candidates.push(path.join("/Applications", `Adobe After Effects ${y}`, "aerender"));
  }
  for (const c of candidates) { if (fs.existsSync(c)) return c; }
  return null;
}

function pidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function tailFile(p: string, maxChars: number = 4000): string {
  try {
    const s = fs.readFileSync(p, "utf8");
    return s.length > maxChars ? s.slice(s.length - maxChars) : s;
  } catch { return ""; }
}

interface RenderJob { pid: number; comp: string; output: string; logPath: string; startedAt: string; }
const runningRenders = new Map<number, RenderJob>();

async function getOpenProjectPath(): Promise<string | null> {
  const raw = await sendBridgeCommand("getProjectInfo", {}, 6000, 250);
  try {
    const p = JSON.parse(raw);
    return p && p.path && String(p.path).length > 0 ? String(p.path) : null;
  } catch { return null; }
}

server.tool(
  "render-aerender",
  "Render a composition to a file in the BACKGROUND using aerender (a separate headless After Effects process). Unlike start-render, this does NOT freeze your After Effects UI - you can keep working. REQUIREMENT: the project must be saved to disk (aerender renders the saved .aep). By default it saves the open project first and renders it; pass projectPath to render a specific .aep instead. Returns immediately after starting unless you pass waitMs. Check progress with render-status.",
  {
    compName: z.string().describe("Name of the composition to render."),
    outputPath: z.string().describe("Absolute output file path (extension should match the output module, e.g. .mov / .mp4 / .avi)."),
    projectPath: z.string().optional().describe("Absolute path to the .aep to render. If omitted, the currently open (saved) project is used."),
    saveFirst: z.boolean().optional().describe("Save the open project before rendering so unsaved changes are included (default: true). Ignored if projectPath is given."),
    renderSettingsTemplate: z.string().optional().describe("Existing Render Settings template name (aerender -RStemplate), e.g. 'Best Settings'."),
    outputModuleTemplate: z.string().optional().describe("Existing Output Module template name (aerender -OMtemplate), e.g. 'Lossless', 'H.264 - Match Render Settings - 15 Mbps'."),
    startFrame: z.number().int().optional().describe("First frame to render (aerender -s)."),
    endFrame: z.number().int().optional().describe("Last frame to render (aerender -e)."),
    waitMs: z.number().int().positive().max(3600000).optional().describe("If set, wait up to this many ms for the render to finish before returning; otherwise return immediately after starting.")
  },
  async (p) => {
    try {
      const aerenderPath = findAerender();
      if (!aerenderPath) {
        return { content: [{ type: "text", text: JSON.stringify({ status: "error", error: "aerender not found. Set the AE_AERENDER_PATH env var to the full path of aerender.exe.", searchedPattern: "Program Files\\Adobe\\Adobe After Effects <year>\\Support Files\\aerender.exe" }, null, 2) }], isError: true };
      }

      let projectPath = p.projectPath;
      if (!projectPath) {
        if (p.saveFirst !== false) {
          await sendBridgeCommand("executeScript", { script: "if (app.project.file) { app.project.save(); return app.project.file.fsName; } else { return null; }" }, 20000, 300);
        }
        projectPath = (await getOpenProjectPath()) || undefined;
        if (!projectPath) {
          return { content: [{ type: "text", text: JSON.stringify({ status: "error", error: "No saved project found. Save the project in After Effects first (File > Save), or pass projectPath to an existing .aep." }, null, 2) }], isError: true };
        }
      }
      if (!fs.existsSync(projectPath)) {
        return { content: [{ type: "text", text: JSON.stringify({ status: "error", error: `Project file does not exist: ${projectPath}` }, null, 2) }], isError: true };
      }

      const args = ["-project", projectPath, "-comp", p.compName, "-output", p.outputPath];
      if (p.renderSettingsTemplate) args.push("-RStemplate", p.renderSettingsTemplate);
      if (p.outputModuleTemplate) args.push("-OMtemplate", p.outputModuleTemplate);
      if (p.startFrame !== undefined) args.push("-s", String(p.startFrame));
      if (p.endFrame !== undefined) args.push("-e", String(p.endFrame));

      const logPath = path.join(getAETempDir(), `aerender-${nextCommandId()}.log`);
      const out = fs.openSync(logPath, "a");
      const child = spawn(aerenderPath, args, { detached: true, stdio: ["ignore", out, out] });
      child.unref();
      const pid = child.pid || -1;
      if (pid > 0) runningRenders.set(pid, { pid, comp: p.compName, output: p.outputPath, logPath, startedAt: new Date().toISOString() });

      if (p.waitMs && p.waitMs > 0) {
        const start = Date.now();
        while (Date.now() - start < p.waitMs) {
          if (!pidAlive(pid)) break;
          await new Promise(r => setTimeout(r, 1000));
        }
        const alive = pidAlive(pid);
        if (!alive) runningRenders.delete(pid);
        return { content: [{ type: "text", text: JSON.stringify({ status: alive ? "running" : "finished", pid, comp: p.compName, output: p.outputPath, aerender: aerenderPath, projectPath, logPath, logTail: tailFile(logPath) }, null, 2) }] };
      }

      return { content: [{ type: "text", text: JSON.stringify({ status: "started", pid, comp: p.compName, output: p.outputPath, aerender: aerenderPath, projectPath, logPath, note: "Rendering in the background. Use render-status to check progress." }, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error launching aerender: ${String(error)}` }], isError: true };
    }
  }
);

server.tool(
  "render-status",
  "Check background aerender renders started with render-aerender: which are still running, which finished, and the tail of each render log.",
  {
    pid: z.number().int().optional().describe("Optional specific render PID. If omitted, reports all tracked renders.")
  },
  async ({ pid }) => {
    try {
      const jobs = pid ? (runningRenders.has(pid) ? [runningRenders.get(pid)!] : []) : Array.from(runningRenders.values());
      if (jobs.length === 0) {
        return { content: [{ type: "text", text: JSON.stringify({ status: "success", message: pid ? `No tracked render with pid ${pid}.` : "No tracked renders.", renders: [] }, null, 2) }] };
      }
      const renders = jobs.map(j => {
        const alive = pidAlive(j.pid);
        if (!alive) runningRenders.delete(j.pid);
        return { pid: j.pid, comp: j.comp, output: j.output, startedAt: j.startedAt, state: alive ? "running" : "finished", logTail: tailFile(j.logPath) };
      });
      return { content: [{ type: "text", text: JSON.stringify({ status: "success", renders }, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error checking render status: ${String(error)}` }], isError: true };
    }
  }
);


async function main() {
  console.error("After Effects MCP Server starting...");
  console.error(`Scripts directory: ${SCRIPTS_DIR}`);
  console.error(`Temp directory: ${TEMP_DIR}`);
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("After Effects MCP Server running...");
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});

