#!/usr/bin/env node

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanWorkspaceArtifacts } from './utils/workspace-graph.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

try {
  cleanWorkspaceArtifacts(rootDir);
} catch (error) {
  console.error('\n❌ Clean failed:');
  console.error(error.message || error);
  process.exit(1);
}

