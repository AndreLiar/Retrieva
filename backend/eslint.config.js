// =============================================================================
// ESLint Configuration (Flat Config - ESLint 9+)
// =============================================================================

import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        // Node.js globals
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        global: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        Headers: 'readonly',
        // Test globals
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        vi: 'readonly',
        test: 'readonly',
      },
    },
    rules: {
      // Error prevention
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off', // Allow console for server logging
      'no-debugger': 'error',

      // Best practices
      eqeqeq: ['error', 'always'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-return-await': 'warn',
      'prefer-const': 'warn',
      'no-var': 'error',

      // Style (handled by Prettier - disable in ESLint)
      semi: 'off',
      quotes: 'off',
      'no-case-declarations': 'warn',

      // Security
      'no-new-wrappers': 'error',

      // Allow intentional patterns
      'no-empty': 'warn',
      'no-control-regex': 'off', // Intentional for security validation
      'no-useless-escape': 'warn',
    },
  },
  {
    // Ignore patterns
    ignores: ['node_modules/**', 'coverage/**', 'dist/**', 'build/**', '*.min.js'],
  },
];
