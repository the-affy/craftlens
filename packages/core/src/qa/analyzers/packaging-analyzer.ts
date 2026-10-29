import * as fs from 'node:fs';
import * as path from 'node:path';
import { QAAnalyzer, QACategory, QAContext, QARawFinding, QAResult } from '../types.js';

export class PackagingAnalyzer implements QAAnalyzer {
  id = 'qa-packaging';
  name = 'VSIX Packaging & Artifact Quality Analyzer';
  category: QACategory = 'packaging';

  async isAvailable(context: QAContext): Promise<boolean> {
    const extDir = path.join(context.workspaceRoot, 'apps', 'vscode-extension');
    return fs.existsSync(extDir);
  }

  async analyze(context: QAContext, signal?: AbortSignal): Promise<QAResult> {
    const start = Date.now();
    const findings: QARawFinding[] = [];
    const root = context.workspaceRoot;

    const extDir = path.join(root, 'apps', 'vscode-extension');
    const vscodeIgnorePath = path.join(extDir, '.vscodeignore');

    // 1. Validate .vscodeignore configuration
    if (!fs.existsSync(vscodeIgnorePath)) {
      findings.push({
        ruleId: 'PKG-MISSING-VSCODEIGNORE',
        title: 'Missing .vscodeignore file in extension workspace',
        message: 'Without .vscodeignore, development files and tests will be packaged into the VSIX.',
        category: 'quality',
        severity: 'high',
        confidence: 1.0,
        filePath: vscodeIgnorePath,
        sourceAnalyzer: this.id,
        evidence: [
          {
            type: 'manifest_mismatch',
            description: '.vscodeignore does not exist at extension root.',
            source: this.id,
            filePath: vscodeIgnorePath,
          },
        ],
        inference: 'Development files (e.g. tests, node_modules) will bloat the distribution package and expose source tests.',
        recommendation: 'Create .vscodeignore and exclude tests, src, and development configurations.',
      });
    } else {
      const ignoreContent = fs.readFileSync(vscodeIgnorePath, 'utf-8');
      const requiredExclusions = ['tests/**', 'src/**'];
      for (const req of requiredExclusions) {
        if (!ignoreContent.includes(req) && !ignoreContent.includes(req.replace('/**', ''))) {
          findings.push({
            ruleId: 'PKG-VSCODEIGNORE-LEAK',
            title: `Potential development asset leakage: "${req}" not excluded in .vscodeignore`,
            message: `The pattern "${req}" is not explicitly excluded in .vscodeignore.`,
            category: 'quality',
            severity: 'medium',
            confidence: 0.90,
            filePath: vscodeIgnorePath,
            sourceAnalyzer: this.id,
            evidence: [
              {
                type: 'manifest_mismatch',
                description: `Exclusion "${req}" missing from .vscodeignore`,
                source: this.id,
                filePath: vscodeIgnorePath,
              },
            ],
            inference: 'Uncompiled source files or unit tests may be included in the release VSIX package.',
            recommendation: `Add "${req}" to .vscodeignore.`,
          });
        }
      }
    }

    // 2. Validate VSIX file presence if in release or self-QA mode
    const releaseDir = path.join(root, 'release');
    let vsixFound = false;
    let vsixSizeMb = 0;

    if (fs.existsSync(releaseDir)) {
      try {
        const files = fs.readdirSync(releaseDir);
        const vsixFiles = files.filter(f => f.endsWith('.vsix'));
        if (vsixFiles.length > 0) {
          vsixFound = true;
          const stat = fs.statSync(path.join(releaseDir, vsixFiles[0]));
          vsixSizeMb = stat.size / (1024 * 1024);

          // Check if VSIX is suspiciously small (< 100KB) or large (> 50MB)
          if (stat.size < 100 * 1024) {
            findings.push({
              ruleId: 'PKG-VSIX-CORRUPT-EMPTY',
              title: 'VSIX package size is suspiciously small',
              message: `Packaged VSIX file size is only ${(stat.size / 1024).toFixed(1)} KB.`,
              category: 'quality',
              severity: 'critical',
              confidence: 0.95,
              filePath: path.join(releaseDir, vsixFiles[0]),
              sourceAnalyzer: this.id,
              evidence: [
                {
                  type: 'manifest_mismatch',
                  description: `File size is ${stat.size} bytes.`,
                  source: this.id,
                  filePath: path.join(releaseDir, vsixFiles[0]),
                },
              ],
              inference: 'Extension bundle was likely omitted or corrupted during packaging.',
              recommendation: 'Re-run `npm run build` and `npm run package` to inspect bundle generation.',
            });
          }
        }
      } catch {}
    }

    return {
      analyzerId: this.id,
      analyzerName: this.name,
      category: this.category,
      status: findings.some(f => f.severity === 'critical') ? 'fail' : findings.length > 0 ? 'warn' : 'pass',
      durationMs: Date.now() - start,
      findings,
      metrics: {
        vsixFound,
        vsixSizeMb: Number(vsixSizeMb.toFixed(2)),
      },
      notes: `Packaging verification completed. VSIX found: ${vsixFound} (${vsixSizeMb.toFixed(2)} MB).`,
    };
  }
}

