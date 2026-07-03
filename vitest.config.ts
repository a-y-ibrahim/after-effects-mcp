import { defineConfig } from "vitest/config";

// Only pick up the real unit tests (tests/**/*.test.ts). The legacy manual
// bridge probes in tests/ (*.cjs) are hands-on scripts that talk to a live
// After Effects instance, not automated tests, so they are excluded here.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      // Scope coverage to the pure, unit-tested core. The large index.ts is the
      // MCP wiring and the .jsx runs inside After Effects, so neither is unit
      // tested here; including them would report a misleadingly low number.
      include: ["src/lib/**"],
    },
  },
});
