/**
 * Flat config. The same boundary is enforced by
 * packages/engine/test/boundaries.test.ts, so tests do not need ESLint installed.
 * One rule: block deep package imports and vendor/gsd-core.
 */
export default [
  {
    files: ["packages/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
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
          ],
        },
      ],
    },
  },
];
