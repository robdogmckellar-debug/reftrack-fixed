const js = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const globals = require('globals');
const tseslint = require('typescript-eslint');

module.exports = defineConfig(
  {
    ignores: ['node_modules/**', 'dist/**', 'out/**', 'coverage/**', 'artifacts/**'],
  },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    files: ['scripts/**/*.cjs', 'tests/**/*.cjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['tests/**/*.test.js', 'vitest.config.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
);
