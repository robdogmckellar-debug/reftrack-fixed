const js = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const globals = require('globals');
const tseslint = require('typescript-eslint');

module.exports = defineConfig(
  {
    ignores: ['node_modules/**', 'dist/**', 'out/**', 'coverage/**', 'artifacts/**'],
  },
  {
    files: ['src/main/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // This temporary compatibility module is replaced incrementally by the
      // typed domain, persistence, IPC, cleaner, and importer chunks.
      'no-unused-vars': 'off',
      'no-empty': 'off',
      'no-useless-escape': 'off',
    },
  },
  {
    files: ['src/renderer/legacy/legacy-app.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      // The current renderer remains a single legacy module until the Preact
      // replacement begins. These exceptions are removed screen by screen.
      'no-unused-vars': 'off',
      'no-empty': 'off',
      'no-misleading-character-class': 'off',
    },
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
