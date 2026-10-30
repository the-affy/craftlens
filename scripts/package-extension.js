#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildWorkspacePackages } from './utils/workspace-graph.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const extDir = path.resolve(rootDir, 'apps', 'vscode-extension');
const extPkgPath = path.resolve(extDir, 'package.json');
const rootPkgPath = path.resolve(rootDir, 'package.json');

// 1. Read extension package.json
const extPkg = JSON.parse(fs.readFileSync(extPkgPath, 'utf-8'));
const currentVersion = extPkg.version || '1.1.1';

// 2. Determine target version (support --no-bump, --release, --patch, --minor, --major, --version)
const semverParts = currentVersion.split('.').map(n => parseInt(n, 10));
if (semverParts.length !== 3 || semverParts.some(isNaN)) {
  semverParts[0] = 1;
  semverParts[1] = 1;
  semverParts[2] = 1;
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

// 3. Update extension package.json if version changed
if (extPkg.version !== newVersion) {
  extPkg.version = newVersion;
  fs.writeFileSync(extPkgPath, JSON.stringify(extPkg, null, 2) + '\n', 'utf-8');
}

// Also sync root package.json version if version changed
try {
  const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'));
  if (rootPkg.version !== newVersion) {
    rootPkg.version = newVersion;
    fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + '\n', 'utf-8');
  }
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

// 5. Clean previous generated build artifacts safely
const extDistDir = path.resolve(extDir, 'dist');
if (fs.existsSync(extDistDir)) {
  fs.rmSync(extDistDir, { recursive: true, force: true });
}
fs.mkdirSync(extDistDir, { recursive: true });

const vsixName = `craftlens-${newVersion}.vsix`;
const rootVsixPath = path.resolve(rootDir, vsixName);
const rootLatestVsixPath = path.resolve(rootDir, 'craftlens.vsix');

// Safely remove existing VSIX files to ensure we don't verify stale outputs
if (fs.existsSync(rootVsixPath)) {
  fs.rmSync(rootVsixPath, { force: true });
}
if (fs.existsSync(rootLatestVsixPath)) {
  fs.rmSync(rootLatestVsixPath, { force: true });
}

// 6. Build internal packages in dependency order
console.log(`📦 Building workspace packages in dependency order...`);
buildWorkspacePackages(rootDir, { packagesOnly: true });

// 7. Build Extension bundle via esbuild
console.log(`🔨 Compiling extension bundle via esbuild...`);
execSync('npm run build', {
  cwd: extDir,
  stdio: 'inherit',
});

// 8. Verify that the expected extension bundle exists
const extBundlePath = path.resolve(extDistDir, 'extension.js');
if (!fs.existsSync(extBundlePath)) {
  throw new Error(`Extension bundle was not generated: ${extBundlePath} does not exist.`);
}
const bundleStat = fs.statSync(extBundlePath);
if (bundleStat.size === 0) {
  throw new Error(`Extension bundle is empty: ${extBundlePath}`);
}
console.log(`✅ Extension bundle verified: ${(bundleStat.size / (1024 * 1024)).toFixed(2)} MB`);

// 9. Package VSIX via vsce
console.log(`\n📦 Packaging VSIX: ${vsixName}...`);
execSync(`npx @vscode/vsce package --no-dependencies -o "${rootVsixPath}"`, {
  cwd: extDir,
  stdio: 'inherit',
});

// 10. Verify that the VSIX was generated successfully
if (!fs.existsSync(rootVsixPath)) {
  throw new Error(`VSIX package generation failed: ${rootVsixPath} not found.`);
}
const vsixStats = fs.statSync(rootVsixPath);
if (vsixStats.size < 100 * 1024) {
  throw new Error(`VSIX package is suspiciously small (${vsixStats.size} bytes): ${rootVsixPath}`);
}

// 11. Copy final VSIX to root alias craftlens.vsix
fs.copyFileSync(rootVsixPath, rootLatestVsixPath);

const sizeMb = (vsixStats.size / (1024 * 1024)).toFixed(2);

console.log(`\n✅ CraftLens Extension packaged successfully!`);
console.log(`------------------------------------------------------`);
console.log(`📌 Version:       v${newVersion}`);
console.log(`📦 VSIX File:     ${vsixName} (${sizeMb} MB)`);
console.log(`📁 Package Path:  ${path.relative(rootDir, rootVsixPath)}`);
console.log(`🔗 Workspace Link:${path.relative(rootDir, rootLatestVsixPath)}`);
console.log(`------------------------------------------------------\n`);
