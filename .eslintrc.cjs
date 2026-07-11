/* eslint-env node */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', 'coverage', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['react-refresh', '@typescript-eslint'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
  },
  overrides: [
    {
      // Engine must never import React or call Math.random() directly.
      // Locked architectural rules.
      files: ['src/engine/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
                message:
                  'Engine code must not import React. The engine is pure TypeScript.',
              },
              {
                group: ['@/*/ui/**', '@/ui/**'],
                message: 'Engine must not depend on UI modules.',
              },
            ],
          },
        ],
        'no-restricted-properties': [
          'error',
          {
            object: 'Math',
            property: 'random',
            message:
              'Engine must not call Math.random() directly. ' +
              'Use RngService from @/engine/core/RngService for all randomness. ' +
              'This guarantees determinism and replay compatibility.',
          },
        ],
      },
    },
    {
      // Test files use explicit imports from 'vitest' — no globals config needed.
      files: ['src/**/*.{test,spec}.{ts,tsx}', 'src/test/**/*.{ts,tsx}'],
    },
  ],
};
