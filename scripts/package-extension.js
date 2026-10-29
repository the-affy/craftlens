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
const currentVersion = extPkg.version || '1.0.0';

// 2. Determine target version (support --no-bump, --patch, --minor, --major)
const semverParts = currentVersion.split('.').map(n => parseInt(n, 10));
if (semverParts.length !== 3 || semverParts.some(isNaN)) {
  semverParts[0] = 1;
  semverParts[1] = 0;
  semverParts[2] = 0;
}

const args = process.argv.slice(2);
let newVersion = currentVersion;

const versionArgIdx = args.findIndex(a => a === '--version' || a === '-v');
if (versionArgIdx !== -1 && args[versionArgIdx + 1]) {
  newVersion = args[versionArgIdx + 1];
} else if (args[0] && !args[0].startsWith('-') && /^\d+(\.\d+)*(-[\w.]+)?$/.test(args[0])) {
  newVersion = args[0];
} else if (args.includes('--major')) {
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
  // If no explicit bump arg provided, preserve currentVersion
  newVersion = currentVersion;
}

if (/^\d+\.\d+$/.test(newVersion)) {
  newVersion = `${newVersion}.0`;
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

// 4. Synchronize documentation & legal assets to extension folder
const rootReadme = path.resolve(rootDir, 'README.md');
const extReadme = path.resolve(extDir, 'README.md');
if (fs.existsSync(rootReadme)) {
  fs.copyFileSync(rootReadme, extReadme);
}

const rootLicense = path.resolve(rootDir, 'LICENSE');
const extLicense = path.resolve(extDir, 'LICENSE');
if (fs.existsSync(rootLicense)) {
  fs.copyFileSync(rootLicense, extLicense);
}

const rootChangelog = path.resolve(rootDir, 'CHANGELOG.md');
const extChangelog = path.resolve(extDir, 'CHANGELOG.md');
if (fs.existsSync(rootChangelog)) {
  fs.copyFileSync(rootChangelog, extChangelog);
}

// 5. Ensure output directory exists and clean stale dist files
const extDistDir = path.resolve(extDir, 'dist');
if (fs.existsSync(extDistDir)) {
  fs.rmSync(extDistDir, { recursive: true, force: true });
}
fs.mkdirSync(extDistDir, { recursive: true });

// 6. Build Extension and Monorepo Workspaces
console.log(`🔨 Compiling extension bundle via esbuild...`);
execSync('npm run build', {
  cwd: extDir,
  stdio: 'inherit',
});

// 7. Generate VSIX via vsce
const vsixName = `craftlens-${newVersion}.vsix`;
const extVsixPath = path.resolve(extDistDir, vsixName);
const rootVsixPath = path.resolve(rootDir, vsixName);
const rootLatestVsixPath = path.resolve(rootDir, 'craftlens.vsix');

console.log(`📦 Packaging VSIX: ${vsixName}...`);
execSync(`npx @vscode/vsce package --no-dependencies -o "${extVsixPath}"`, {
  cwd: extDir,
  stdio: 'inherit',
});

// 8. Place packaged VSIX and latest alias in workspace root for direct access
fs.copyFileSync(extVsixPath, rootVsixPath);
fs.copyFileSync(extVsixPath, rootLatestVsixPath);

const stats = fs.statSync(extVsixPath);
const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

console.log(`\n✅ CraftLens Extension packaged successfully!`);
console.log(`------------------------------------------------------`);
console.log(`📌 Version:       v${newVersion}`);
console.log(`📦 VSIX File:     ${vsixName} (${sizeMb} MB)`);
console.log(`📁 Package Path:  ${path.relative(rootDir, extVsixPath)}`);
console.log(`🔗 Workspace Link:${path.relative(rootDir, rootLatestVsixPath)}`);
console.log(`------------------------------------------------------\n`);
