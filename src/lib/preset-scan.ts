// Recursive scanner for Adobe After Effects preset files (.ffx). Pure with
// respect to its `roots` argument (the caller resolves which roots exist), so
// it can be unit tested against a throwaway fixture tree. Walks each root up to
// `maxDepth`, optionally recursing, collecting up to `maxResults` matches that
// pass an optional case-insensitive substring `query` on the file name or path.

import * as fs from "fs";
import * as path from "path";

export interface PresetFile {
  path: string;
  name: string;
  directory: string;
  size: number;
  modifiedAt: string;
}

export function collectPresetFiles(
  roots: string[],
  recursive: boolean,
  query?: string,
  maxResults: number = 500,
  maxDepth: number = 10
): PresetFile[] {
  const results: PresetFile[] = [];
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

      if (
        loweredQuery &&
        !entry.name.toLowerCase().includes(loweredQuery) &&
        !entryPath.toLowerCase().includes(loweredQuery)
      ) {
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
        /* not readable: skip */
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
