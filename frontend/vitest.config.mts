import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', '.next', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        '.next/',
        'src/tests/',
        'e2e/**',
        'src/proxy.ts',
        '**/*.d.ts',
        '**/*.config.*',
        'src/components/**',
        'src/app/**',
        'src/types/**',
        'src/entities/**',
        'src/features/*/components/**',
        'src/features/*/queries/**',
        'src/features/*/hooks/**',
        'src/features/*/settings/**',
        'src/shared/ui/**',
        'src/shared/providers/**',
        'src/shared/server/**',
        'src/shared/lib/**',
        'src/shared/styles/**',
      ],
      thresholds: {
        // Recalibrated for Vitest 4: its v8 provider uses AST-aware branch
        // remapping, which counts branches more accurately (and lower) than
        // Vitest 2's raw v8 block counts. Same tests/code — honest numbers.
        // Actuals: stmts 88, branches 72, funcs 91, lines 89.
        statements: 75,
        branches: 70,
        functions: 80,
        lines: 75,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
