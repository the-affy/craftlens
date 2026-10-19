import { defineConfig } from 'vitest/config';
import * as path from 'node:path';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@anti-slop/core': path.resolve(__dirname, './packages/core/src/index.ts'),
      '@anti-slop/parser': path.resolve(__dirname, './packages/parser/src/index.ts'),
      '@anti-slop/config': path.resolve(__dirname, './packages/config/src/index.ts'),
      '@anti-slop/rule-engine': path.resolve(__dirname, './packages/rule-engine/src/index.ts'),
    },
  },
});
