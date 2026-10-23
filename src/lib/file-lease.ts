import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

/** Cross-process ownership of the legacy single-slot mailbox. Unknown outcomes
 * retain ownership until explicitly recovered after inspection; never silently replay. */
export async function acquireFileLease(folder: string, commandId: string, timeoutMs: number) {
  const file = path.join(folder, "file-lease.json"),
    owner = randomUUID(),
    start = Date.now();
  const lease = { owner, pid: process.pid, commandId, uncertain: false };
  for (;;) {
    try {
      const fd = fs.openSync(file, "wx");
      try {
        fs.writeFileSync(fd, JSON.stringify(lease));
      } finally {
        fs.closeSync(fd);
      }
      break;
    } catch (error: any) {
      if (error.code !== "EEXIST") throw error;
      try {
        const existing = JSON.parse(fs.readFileSync(file, "utf8"));
        let alive = true;
        try {
          process.kill(existing.pid, 0);
        } catch (e: any) {
          alive = e.code === "EPERM";
        }
        if (existing.uncertain || !alive) {
          throw new Error(
            "Previous file command has unknown outcome. Inspect AE before recovering the file bridge.",
            { cause: error },
          );
        }
      } catch (readError: any) {
        if (String(readError.message).includes("unknown outcome")) throw readError;
      }
      if (Date.now() - start >= timeoutMs)
        throw new Error("File bridge owned by another client; command not sent.", { cause: error });
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  return (knownOutcome: boolean) => {
    if (JSON.parse(fs.readFileSync(file, "utf8")).owner !== owner)
      throw new Error("File bridge ownership changed");
    if (knownOutcome) fs.unlinkSync(file);
    else fs.writeFileSync(file, JSON.stringify({ ...lease, uncertain: true }));
  };
}
