import { defineConfig } from 'vitest/config';
import * as path from 'node:path';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@craftlens/core': path.resolve(__dirname, './packages/core/src/index.ts'),
      '@craftlens/parser': path.resolve(__dirname, './packages/parser/src/index.ts'),
      '@craftlens/config': path.resolve(__dirname, './packages/config/src/index.ts'),
      '@craftlens/rule-engine': path.resolve(__dirname, './packages/rule-engine/src/index.ts'),
      '@craftlens/design-intelligence': path.resolve(__dirname, './packages/design-intelligence/src/index.ts'),
    },
  },
});
