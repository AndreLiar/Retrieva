import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    testTimeout: 15000,
    reporters: ['verbose'],
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { isolate: true } },
  },
});
