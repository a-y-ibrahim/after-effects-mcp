import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    // Never lint generated output, the ES3 ExtendScript panel (not Node), the
    // legacy live-AE probe scripts, or the plain-JS install helper.
    ignores: [
      "build/**",
      "node_modules/**",
      "coverage/**",
      "src/scripts/**",
      "tests/**/*.cjs",
      "install-bridge.js",
      "eslint.config.js",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // This is a pragmatic bridge codebase: `any` is used deliberately at the
      // JSON boundary (bridge results are untyped). Keep it allowed, and treat
      // unused symbols as warnings (with an underscore escape hatch).
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  prettier,
);
