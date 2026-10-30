import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

describe('Packaged VSIX Verification', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const vsixPath = path.resolve(rootDir, 'craftlens.vsix');

  beforeAll(() => {
    // Start from clean build state: ensure test does not depend on an old VSIX left over from a previous run
    if (fs.existsSync(vsixPath)) {
      fs.rmSync(vsixPath, { force: true });
    }

    // Invoke the real packaging process
    execSync('node scripts/package-extension.js --no-bump', {
      cwd: rootDir,
      stdio: 'inherit',
      timeout: 60000,
    });
  }, 60000);

  it('verifies that the packaged craftlens.vsix exists and is non-empty', () => {
    expect(fs.existsSync(vsixPath)).toBe(true);
    const stats = fs.statSync(vsixPath);
    expect(stats.size).toBeGreaterThan(100 * 1024); // Greater than 100KB
  });

  it('verifies the internal archive structure and required resources of the packaged VSIX', () => {
    const fileList = execSync(`tar -tf "${vsixPath}"`, { encoding: 'utf-8' });

    // Core extension manifests and bundle
    expect(fileList).toContain('extension/package.json');
    expect(fileList).toContain('extension/dist/extension.js');
    expect(fileList).toContain('extension.vsixmanifest');
    expect(fileList).toContain('[Content_Types].xml');

    // Required assets and resources
    expect(fileList).toContain('extension/resources/icon.png');
    expect(fileList).toContain('extension/media/icons/craftlens-sidebar.svg');
    expect(fileList).toContain('extension/readme.md');
    expect(fileList).toContain('extension/LICENSE.txt');
    expect(fileList).toContain('extension/changelog.md');
  });

  it('extracts and verifies the bundled extension bundle and internal package integration', () => {
    // Use process-isolated temp directory to prevent parallel test conflicts
    const tempExtractDir = path.resolve(__dirname, `../fixtures/vsix-temp-${process.pid}`);
    if (fs.existsSync(tempExtractDir)) {
      fs.rmSync(tempExtractDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempExtractDir, { recursive: true });

    try {
      execSync(`tar -xf "${vsixPath}" -C "${tempExtractDir}"`);

      const bundledExtJsPath = path.join(tempExtractDir, 'extension', 'dist', 'extension.js');
      expect(fs.existsSync(bundledExtJsPath)).toBe(true);

      const bundledCode = fs.readFileSync(bundledExtJsPath, 'utf-8');

      // 1. Verify Checklist features are compiled into the packaged bundle
      expect(bundledCode).toContain('checklist-container');
      expect(bundledCode).toContain('checklist-heading');
      expect(bundledCode).toContain('checklist-checkbox');
      expect(bundledCode).toContain('toggle-criterion');
      expect(bundledCode).toContain('openChecklistFile');
      expect(bundledCode).toContain('View checklist.md');

      // 2. Verify duplicate preview is eliminated from openMasterChecklist
      expect(bundledCode).not.toContain('markdown.showPreviewToSide');

      // 3. Verify control height consistency
      expect(bundledCode).toContain('--control-height: 24px;');

      // 4. Verify extension exports activate and deactivate
      expect(bundledCode).toContain('activate');
      expect(bundledCode).toContain('deactivate');

      // 5. Verify internal CraftLens workspace packages are bundled in and NOT external
      expect(bundledCode).not.toContain('require("@craftlens/core")');
      expect(bundledCode).not.toContain('require("@craftlens/rule-engine")');
      expect(bundledCode).not.toContain('require("@craftlens/parser")');
      expect(bundledCode).not.toContain('require("@craftlens/config")');
      expect(bundledCode).not.toContain('require("@craftlens/design-intelligence")');

      // 6. Verify symbols from internal CraftLens packages exist in bundle
      expect(bundledCode).toContain('CraftLensRulesEngine');
      expect(bundledCode).toContain('AuditStorageManager');
      expect(bundledCode).toContain('DEFAULT_CONFIG');
      expect(bundledCode).toContain('UIAnalyzer');
    } finally {
      if (fs.existsSync(tempExtractDir)) {
        fs.rmSync(tempExtractDir, { recursive: true, force: true });
      }
    }
  });
});
