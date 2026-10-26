/**
 * Flat config. The same boundary is enforced by
 * packages/engine/test/boundaries.test.ts, so tests do not need to duplicate it.
 * One boundary rule, plus a minimal TypeScript set.
 *
 * no-floating-promises is type-aware. It applies to package src, and to
 * Playwright specs under packages/app/e2e (those sit outside the composite
 * src program, so they use packages/app/tsconfig.e2e.json).
 * Patterns are listed twice so they match both a repo-root eslint run and
 * `eslint src test e2e` from a package directory.
 * Starter trees under packages/templates/ are ignored.
 */
import tseslint from "typescript-eslint";

const boundaryPatterns = [
  {
    group: [
      "@hitchhiker/*/*",
      "@hitchhiker/*/*/**",
      "**/vendor/gsd-core",
      "**/vendor/gsd-core/**",
    ],
    message:
      "Import a package only through its index. vendor/gsd-core is not a dependency.",
  },
];

const unusedVars = {
  argsIgnorePattern: "^_",
  varsIgnorePattern: "^_",
  caughtErrorsIgnorePattern: "^_",
};

export default [
  {
    ignores: [
      "vendor/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/*.tsbuildinfo",
      "packages/templates/astro-default/**",
      "packages/templates/next-app/**",
      "packages/templates/vite-react-world/**",
      "packages/templates/recipes/**",
      "packages/templates/shared/**",
    ],
  },
  {
    files: [
      "packages/*/src/**/*.ts",
      "packages/*/test/**/*.ts",
      "src/**/*.ts",
      "test/**/*.ts",
    ],
    languageOptions: {
      parser: tseslint.parser,
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: boundaryPatterns,
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "no-debugger": "error",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", unusedVars],
    },
  },
  {
    files: ["packages/*/src/**/*.ts", "src/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
  {
    files: ["packages/app/e2e/**/*.ts", "e2e/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./packages/app/tsconfig.e2e.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
];
