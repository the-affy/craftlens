#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const extDir = path.resolve(rootDir, 'apps', 'vscode-extension');
const extPkgPath = path.resolve(extDir, 'package.json');
const rootPkgPath = path.resolve(rootDir, 'package.json');

// 1. Read extension package.json
const extPkg = JSON.parse(fs.readFileSync(extPkgPath, 'utf-8'));
const currentVersion = extPkg.version || '0.1.0';

// 2. Determine target version (support --no-bump, --patch, --minor, --major)
const semverParts = currentVersion.split('.').map(n => parseInt(n, 10));
if (semverParts.length !== 3 || semverParts.some(isNaN)) {
  semverParts[0] = 0;
  semverParts[1] = 1;
  semverParts[2] = 0;
}

const args = process.argv.slice(2);
let newVersion = currentVersion;

if (args.includes('--major')) {
  semverParts[0] += 1;
  semverParts[1] = 0;
  semverParts[2] = 0;
  newVersion = semverParts.join('.');
} else if (args.includes('--minor')) {
  semverParts[1] += 1;
  semverParts[2] = 0;
  newVersion = semverParts.join('.');
} else if (args.includes('--patch')) {
  semverParts[2] += 1;
  newVersion = semverParts.join('.');
} else if (args.includes('--no-bump') || args.includes('--release')) {
  newVersion = currentVersion;
} else {
  // If no explicit arg provided, preserve currentVersion unless specified
  newVersion = currentVersion;
}

console.log(`\n======================================================`);
console.log(`🚀 CraftLens Extension Packaging: v${newVersion}`);
console.log(`======================================================\n`);

// 3. Update extension package.json
extPkg.version = newVersion;
fs.writeFileSync(extPkgPath, JSON.stringify(extPkg, null, 2) + '\n', 'utf-8');

// Also sync root package.json version
try {
  const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'));
  rootPkg.version = newVersion;
  fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + '\n', 'utf-8');
} catch (e) {
  // Optional root sync
}

// 4. Ensure output directories exist and clean stale dist files
const extDistDir = path.resolve(extDir, 'dist');
if (fs.existsSync(extDistDir)) {
  fs.rmSync(extDistDir, { recursive: true, force: true });
}
fs.mkdirSync(extDistDir, { recursive: true });

const releaseDir = path.resolve(rootDir, 'release');
if (!fs.existsSync(releaseDir)) {
  fs.mkdirSync(releaseDir, { recursive: true });
}

// 5. Build Extension
console.log(`🔨 Compiling extension bundle via esbuild...`);
execSync('npm run build', {
  cwd: extDir,
  stdio: 'inherit',
});

// 6. Generate VSIX via vsce
const vsixName = `craftlens-${newVersion}.vsix`;
const extVsixPath = path.resolve(extDistDir, vsixName);
const rootVsixPath = path.resolve(rootDir, vsixName);
const releaseVsixPath = path.resolve(releaseDir, vsixName);
const rootLatestVsixPath = path.resolve(rootDir, 'craftlens.vsix');

console.log(`📦 Packaging VSIX: ${vsixName}...`);
execSync(`npx @vscode/vsce package --no-dependencies -o "${extVsixPath}"`, {
  cwd: extDir,
  stdio: 'inherit',
});

// 7. Copy to release directory and root directory for easy access
fs.copyFileSync(extVsixPath, rootVsixPath);
fs.copyFileSync(extVsixPath, rootLatestVsixPath);
fs.copyFileSync(extVsixPath, releaseVsixPath);

const stats = fs.statSync(extVsixPath);
const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

console.log(`\n✅ CraftLens Extension packaged successfully!`);
console.log(`------------------------------------------------------`);
console.log(`📌 Version:       v${newVersion}`);
console.log(`📦 VSIX File:     ${vsixName} (${sizeMb} MB)`);
console.log(`📁 Release Dir:   ${path.relative(rootDir, releaseVsixPath)}`);
console.log(`📁 Workspace Dir: ${path.relative(rootDir, rootVsixPath)}`);
console.log(`🔗 Latest Alias:  craftlens.vsix`);
console.log(`------------------------------------------------------\n`);
