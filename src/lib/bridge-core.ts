// Pure, side-effect-light helpers extracted from index.ts so they can be unit
// tested in isolation (index.ts starts an MCP server on import, which makes it
// awkward to test directly). Everything here is deterministic given its inputs
// (or the current platform / filesystem) and has no dependency on the running
// bridge, the MCP server object, or global bridge state.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/**
 * Build an MCP tool response from a raw bridge result string, flagging AE-side
 * failures as `isError` so the client treats them as errors instead of silently
 * successful output. A result counts as an error when the parsed JSON has
 * `status === "error"`, `success === false`, or any `error` field. Non-JSON
 * output is passed through untouched (never flagged), since we cannot inspect it.
 */
export function bridgeToolResult(
  raw: string
): { content: { type: "text"; text: string }[]; isError?: boolean } {
  let parsed: any = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* non-JSON: pass through as opaque text */
  }
  const isError =
    !!parsed &&
    (parsed.status === "error" ||
      parsed.success === false ||
      parsed.error !== undefined);

  const response: {
    content: { type: "text"; text: string }[];
    isError?: boolean;
  } = {
    content: [{ type: "text", text: raw }],
  };
  if (isError) response.isError = true;
  return response;
}

/**
 * Write a file atomically: write to a `.tmp` sibling, then rename it over the
 * target so a concurrent reader (the AE panel) never observes a half-written
 * file. `renameSync` is atomic on the same volume; if it ever fails (e.g. the
 * other process briefly holds the target open on Windows) fall back to a direct
 * write, which the reader still guards against with JSON.parse + id-matching.
 */
export function atomicWriteSync(target: string, data: string): void {
  const tmp = target + ".tmp";
  try {
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, target);
  } catch {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    fs.writeFileSync(target, data);
  }
}

/**
 * Normalize a list of candidate paths and return only the ones that exist and
 * are directories, de-duplicated and order-preserving. Used to resolve the set
 * of Adobe preset roots that actually exist on this machine.
 */
export function uniqueExistingDirs(pathsToCheck: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const p of pathsToCheck) {
    if (!p) {
      continue;
    }
    const normalized = path.normalize(p);
    if (seen.has(normalized)) {
      continue;
    }
    if (fs.existsSync(normalized)) {
      try {
        if (fs.statSync(normalized).isDirectory()) {
          seen.add(normalized);
          result.push(normalized);
        }
      } catch {
        /* not readable: skip */
      }
    }
  }

  return result;
}

/**
 * The candidate Adobe / After Effects preset roots for the current platform,
 * BEFORE filtering to the ones that exist. Split out from getDefaultPresetRoots
 * so the platform branching can be unit tested without touching the filesystem.
 * `platform` and `env` are injectable for testing; they default to the live
 * process values.
 */
export function candidatePresetRoots(
  home: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const years = ["2026", "2025", "2024"];

  const roots = [
    path.join(home, "Documents", "Adobe"),
    path.join(home, "Documents", "Adobe", "After Effects"),
    path.join(home, "Documents", "Adobe", "After Effects User Presets"),
  ];

  if (platform === "win32") {
    const appData = env.APPDATA || "";
    const programFiles = env.ProgramFiles || "C:\\Program Files";
    if (appData) roots.push(path.join(appData, "Adobe", "After Effects"));
    for (const y of years)
      roots.push(
        path.join(programFiles, "Adobe", `Adobe After Effects ${y}`, "Support Files", "Presets")
      );
  } else {
    for (const y of years)
      roots.push(path.join("/Applications", `Adobe After Effects ${y}`, "Presets"));
  }

  return roots;
}

/**
 * Resolve the Adobe preset roots that actually exist on this machine. Combines
 * candidatePresetRoots (platform-aware candidates) with uniqueExistingDirs
 * (existence filter).
 */
export function getDefaultPresetRoots(): string[] {
  return uniqueExistingDirs(candidatePresetRoots(os.homedir()));
}

/**
 * Create a monotonic command-id generator. Each call to the returned function
 * yields a unique, strictly increasing id of the form `${now}-${seq}` so the
 * server can match the exact result for a command instead of guessing by
 * command name + freshness (which collides when the same command runs twice in
 * a row). `now` is injectable so tests can assert uniqueness without depending
 * on wall-clock timing.
 */
export function makeCommandIdFactory(
  now: () => number = () => Date.now()
): () => string {
  let seq = 0;
  return () => {
    seq += 1;
    return `${now()}-${seq}`;
  };
}
