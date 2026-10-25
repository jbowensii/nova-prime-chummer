// ESLint flat config: TypeScript + React hooks for the app, Node for the server and tools.
// Formatting is Prettier's job (eslint-config-prettier turns off the rules that clash).
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'public', 'library', 'custom', '.extract', 'playwright-report', 'test-results', 'importer', 'release', '_to_delete', '.claude'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}', 'e2e/**/*.ts'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    files: ['server/**/*.mjs', 'electron/**/*.{mjs,cjs}', 'tools/**/*.{js,mjs}', 'tests/**/*.mjs', 'e2e/**/*.mjs', '*.config.{js,ts,mjs}'],
    languageOptions: { globals: globals.node },
  },
  // Playwright fixtures are `async ({}, use) => �`: an empty first argument by design, and `use` isn't a React hook.
  { files: ['e2e/**/*.ts'], rules: { 'no-empty-pattern': 'off', 'react-hooks/rules-of-hooks': 'off' } },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  prettier,
)
