import { defineConfig } from "vitest/config";

// Only pick up the real unit tests (tests/**/*.test.ts). The legacy manual
// bridge probes in tests/ (*.cjs) are hands-on scripts that talk to a live
// After Effects instance, not automated tests, so they are excluded here.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
