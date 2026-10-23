import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";

export function registerWorkflows(server: McpServer) {
  const read = () =>
    fs.readFileSync(
      fileURLToPath(new URL("../skills/after-effects-workflows/SKILL.md", import.meta.url)),
      "utf8",
    );
  server.resource("ae-workflows", "aftereffects://workflows", async (uri) => ({
    contents: [{ uri: uri.href, mimeType: "text/markdown", text: read() }],
  }));
  for (const [name, description, instruction] of [
    [
      "understand-project",
      "Understand an existing AE scene and its motion",
      "Follow Understand an existing project. Inspect structure before rendering; explain the dependency graph and observed design.",
    ],
    [
      "edit-and-verify",
      "Apply a requested AE edit and verify it",
      "Follow Edit and verify for the user's requested changes. Report the actual affected layers and any partial failures.",
    ],
    [
      "create-variants",
      "Generate verified variants from an AE template",
      "Follow Create variants for the user's requested dataset. Verify one representative result before batching the remaining variants.",
    ],
  ])
    server.prompt(name, description, () => ({
      messages: [{ role: "user", content: { type: "text", text: `${read()}\n\n${instruction}` } }],
    }));
}
