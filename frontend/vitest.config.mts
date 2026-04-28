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
        statements: 75,
        branches: 80,
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
