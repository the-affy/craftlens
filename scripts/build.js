#!/usr/bin/env node

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWorkspacePackages } from './utils/workspace-graph.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const packagesOnly = args.includes('--packages-only');

try {
  buildWorkspacePackages(rootDir, { packagesOnly });
} catch (error) {
  console.error('\n❌ Monorepo build failed:');
  console.error(error.message || error);
  process.exit(1);
}

