// @ts-check
import js from '@eslint/js';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';
import pluginVue from 'eslint-plugin-vue';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Scope a shareable flat config array to a set of files. */
const scoped = (configs, files) => configs.map((config) => ({ ...config, files }));

const STOREFRONT = ['apps/storefront/**/*.{ts,tsx,js,jsx,mjs}'];
const ADMIN_VUE = ['apps/admin/**/*.vue'];

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/.next/**',
    '**/coverage/**',
    '**/next-env.d.ts',
    'packages/database/src/generated/**',
    'pnpm-lock.yaml',
  ]),

  // Baseline for every TypeScript file in the repo.
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports', disallowTypeAnnotations: false },
      ],
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // NestJS: decorators need runtime (non-type) imports for dependency injection metadata.
  {
    files: ['apps/api/**/*.ts'],
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },
  {
    files: ['apps/api/**/*.{spec,e2e-spec}.ts'],
    languageOptions: { globals: { ...globals.vitest } },
  },

  // Storefront: Next.js + React rules.
  ...scoped(nextVitals, STOREFRONT),
  ...scoped(nextTs, STOREFRONT),
  {
    files: STOREFRONT,
    settings: { next: { rootDir: 'apps/storefront' } },
    languageOptions: { globals: { ...globals.browser } },
  },

  // Admin: Vue 3 rules (plain .ts files use the TypeScript baseline above).
  {
    files: ['apps/admin/**/*.ts'],
    languageOptions: { globals: { ...globals.browser } },
  },
  ...scoped(pluginVue.configs['flat/recommended'], ADMIN_VUE),
  {
    files: ADMIN_VUE,
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
        sourceType: 'module',
      },
      globals: { ...globals.browser },
    },
  },

  // Command-line report scripts (load test, Lighthouse) print their results.
  {
    files: ['tests/e2e/scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },

  // Formatting is Prettier's job; disable stylistic rules that conflict with it.
  prettier,
]);
