import * as fs from 'node:fs';
import * as path from 'node:path';
import { QAAnalyzer, QACategory, QAContext, QARawFinding, QAResult } from '../types.js';

export class DependencyAnalyzer implements QAAnalyzer {
  id = 'qa-dependencies';
  name = 'Dependency & Supply Chain Analyzer';
  category: QACategory = 'dependencies';

  async isAvailable(context: QAContext): Promise<boolean> {
    const rootPkg = path.join(context.workspaceRoot, 'package.json');
    return fs.existsSync(rootPkg);
  }

  async analyze(context: QAContext, signal?: AbortSignal): Promise<QAResult> {
    const start = Date.now();
    const findings: QARawFinding[] = [];
    const root = context.workspaceRoot;

    const pkgFiles = this.collectPackageJsonFiles(root);
    const seenPackageVersions = new Map<string, { pkgPath: string; version: string }[]>();

    const knownVulnerableOrDeprecated = new Set([
      'request',
      'left-pad',
      'colors',
      'faker',
      'node-uuid',
      'event-stream',
    ]);

    for (const pkgPath of pkgFiles) {
      if (signal?.aborted) break;

      try {
        const content = fs.readFileSync(pkgPath, 'utf-8');
        const pkg = JSON.parse(content);
        const allDeps = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
        };

        for (const [depName, versionRange] of Object.entries(allDeps)) {
          const vStr = String(versionRange);

          // 1. Wildcard / loose versioning
          if (vStr === '*' || vStr === 'latest') {
            findings.push({
              ruleId: 'DEP-UNPINNED-WILDCARD',
              title: `Unpinned wildcard dependency: ${depName}@${vStr}`,
              message: `Package "${depName}" uses wildcard version "${vStr}".`,
              category: 'dependency',
              severity: 'medium',
              confidence: 0.95,
              filePath: pkgPath,
              sourceAnalyzer: this.id,
              evidence: [
                {
                  type: 'dependency_vuln',
                  description: `Dependency "${depName}" uses loose version "${vStr}".`,
                  source: this.id,
                  filePath: pkgPath,
                },
              ],
              inference: 'Wildcard versions allow unvetted upstream releases to automatically enter the build.',
              recommendation: `Pin "${depName}" to an explicit caret or exact semver range (e.g. ^1.2.0).`,
            });
          }

          // 2. Known Deprecated / High Risk Packages
          if (knownVulnerableOrDeprecated.has(depName.toLowerCase())) {
            findings.push({
              ruleId: 'DEP-DEPRECATED-PACKAGE',
              title: `Deprecated or compromised package: ${depName}`,
              message: `Dependency "${depName}" is deprecated or has known security compromise history.`,
              category: 'security',
              severity: 'high',
              confidence: 0.98,
              filePath: pkgPath,
              sourceAnalyzer: this.id,
              evidence: [
                {
                  type: 'dependency_vuln',
                  description: `Package "${depName}" matched known deprecated/compromised list.`,
                  source: this.id,
                  filePath: pkgPath,
                },
              ],
              inference: 'Using deprecated packages increases vulnerability attack surface.',
              recommendation: `Replace "${depName}" with a modern maintained alternative.`,
            });
          }

          // 3. Track versions across workspaces for duplicate detection
          const list = seenPackageVersions.get(depName) || [];
          list.push({ pkgPath, version: vStr });
          seenPackageVersions.set(depName, list);
        }
      } catch {
        // ignore
      }
    }

    // 4. Duplicate conflicting package versions across monorepo
    for (const [depName, instances] of seenPackageVersions.entries()) {
      const distinctVersions = new Set(instances.map(i => i.version));
      if (distinctVersions.size > 1 && instances.length > 1) {
        // e.g. one package uses ^1.0.0, another uses ^2.0.0
        findings.push({
          ruleId: 'DEP-MONOREPO-VERSION-CONFLICT',
          title: `Conflicting dependency versions for ${depName}`,
          message: `Package "${depName}" is resolved with multiple versions across monorepo: ${Array.from(distinctVersions).join(', ')}.`,
          category: 'dependency',
          severity: 'low',
          confidence: 0.90,
          filePath: instances[0].pkgPath,
          sourceAnalyzer: this.id,
          evidence: instances.map(inst => ({
            type: 'dependency_vuln',
            description: `Version "${inst.version}" in ${path.relative(root, inst.pkgPath)}`,
            source: this.id,
            filePath: inst.pkgPath,
          })),
          inference: 'Conflicting versions in a monorepo can cause duplicate bundle sizes and subtle type incompatibilities.',
          recommendation: `Align "${depName}" across workspaces to a single shared version.`,
        });
      }
    }

    return {
      analyzerId: this.id,
      analyzerName: this.name,
      category: this.category,
      status: findings.some(f => f.severity === 'critical') ? 'fail' : findings.length > 0 ? 'warn' : 'pass',
      durationMs: Date.now() - start,
      findings,
      metrics: {
        packageFilesInspected: pkgFiles.length,
        distinctDependenciesChecked: seenPackageVersions.size,
      },
      notes: `Inspected ${pkgFiles.length} package.json manifests across workspace.`,
    };
  }

  private collectPackageJsonFiles(root: string): string[] {
    const results: string[] = [];
    const rootPkg = path.join(root, 'package.json');
    if (fs.existsSync(rootPkg)) results.push(rootPkg);

    const packagesDir = path.join(root, 'packages');
    if (fs.existsSync(packagesDir)) {
      try {
        for (const item of fs.readdirSync(packagesDir)) {
          const pkg = path.join(packagesDir, item, 'package.json');
          if (fs.existsSync(pkg)) results.push(pkg);
        }
      } catch {}
    }

    const appsDir = path.join(root, 'apps');
    if (fs.existsSync(appsDir)) {
      try {
        for (const item of fs.readdirSync(appsDir)) {
          const pkg = path.join(appsDir, item, 'package.json');
          if (fs.existsSync(pkg)) results.push(pkg);
        }
      } catch {}
    }

    return results;
  }
}

