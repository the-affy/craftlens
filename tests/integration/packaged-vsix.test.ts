import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

describe('Packaged VSIX Verification', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const vsixPath = path.resolve(rootDir, 'craftlens.vsix');

  it('verifies that the packaged craftlens.vsix exists and is non-empty', () => {
    expect(fs.existsSync(vsixPath)).toBe(true);
    const stats = fs.statSync(vsixPath);
    expect(stats.size).toBeGreaterThan(100 * 1024); // Greater than 100KB
  });

  it('verifies the internal archive structure of the packaged VSIX', () => {
    const fileList = execSync(`tar -tf "${vsixPath}"`, { encoding: 'utf-8' });

    expect(fileList).toContain('extension/package.json');
    expect(fileList).toContain('extension/dist/extension.js');
    expect(fileList).toContain('extension.vsixmanifest');
    expect(fileList).toContain('[Content_Types].xml');
  });

  it('extracts and verifies the bundled extension bundle from the VSIX archive', () => {
    const tempExtractDir = path.resolve(__dirname, '../fixtures/vsix-temp');
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
    } finally {
      if (fs.existsSync(tempExtractDir)) {
        fs.rmSync(tempExtractDir, { recursive: true, force: true });
      }
    }
  });
});
