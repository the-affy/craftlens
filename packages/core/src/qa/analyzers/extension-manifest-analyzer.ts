import * as fs from 'node:fs';
import * as path from 'node:path';
import { QAAnalyzer, QACategory, QAContext, QARawFinding, QAResult } from '../types.js';

export class ExtensionManifestAnalyzer implements QAAnalyzer {
  id = 'qa-extension-manifest';
  name = 'Extension Manifest Analyzer';
  category: QACategory = 'extension';

  async isAvailable(context: QAContext): Promise<boolean> {
    const extPkg = this.findExtensionPackageJson(context.workspaceRoot);
    return extPkg !== null;
  }

  async analyze(context: QAContext, signal?: AbortSignal): Promise<QAResult> {
    const start = Date.now();
    const findings: QARawFinding[] = [];
    const extPkgPath = this.findExtensionPackageJson(context.workspaceRoot);

    if (!extPkgPath) {
      return {
        analyzerId: this.id,
        analyzerName: this.name,
        category: this.category,
        status: 'skipped',
        durationMs: Date.now() - start,
        findings: [],
        skipReason: 'No VS Code extension package.json found.',
      };
    }

    try {
      const pkgContent = fs.readFileSync(extPkgPath, 'utf-8');
      const pkg = JSON.parse(pkgContent);
      const extDir = path.dirname(extPkgPath);

      // 1. Validate engines.vscode
      if (!pkg.engines || !pkg.engines.vscode) {
        findings.push({
          ruleId: 'EXT-MANIFEST-NO-ENGINE',
          title: 'Missing engines.vscode declaration in package.json',
          message: 'VS Code extensions must declare engines.vscode compatibility range.',
          category: 'quality',
          severity: 'high',
          confidence: 1.0,
          filePath: extPkgPath,
          sourceAnalyzer: this.id,
          evidence: [
            {
              type: 'manifest_mismatch',
              description: 'Field engines.vscode is absent or empty in package.json.',
              source: this.id,
              filePath: extPkgPath,
            },
          ],
          inference: 'The extension may fail to install or activate in VS Code marketplace.',
          recommendation: 'Add `"engines": { "vscode": "^1.85.0" }` to package.json.',
        });
      }

      // 2. Validate entrypoint (main / browser)
      if (pkg.main) {
        const mainPath = path.resolve(extDir, pkg.main);
        if (!fs.existsSync(mainPath)) {
          // Check if dist build output exists or source exists
          const distExists = fs.existsSync(path.resolve(extDir, 'dist', 'extension.js'));
          if (!distExists) {
            findings.push({
              ruleId: 'EXT-MANIFEST-MISSING-ENTRYPOINT',
              title: 'Declared extension entrypoint missing on disk',
              message: `The declared main file "${pkg.main}" does not exist on disk.`,
              category: 'quality',
              severity: 'high',
              confidence: 0.95,
              filePath: extPkgPath,
              sourceAnalyzer: this.id,
              evidence: [
                {
                  type: 'manifest_mismatch',
                  description: `File not found at resolved path: ${mainPath}`,
                  source: this.id,
                  filePath: extPkgPath,
                },
              ],
              inference: 'VS Code will throw an activation error when attempting to load the extension bundle.',
              recommendation: 'Run `npm run build` or fix the "main" field in package.json.',
            });
          }
        }
      }

      // 3. Validate icon path
      if (pkg.icon) {
        const iconPath = path.resolve(extDir, pkg.icon);
        if (!fs.existsSync(iconPath)) {
          findings.push({
            ruleId: 'EXT-MANIFEST-MISSING-ICON',
            title: 'Declared extension icon missing on disk',
            message: `Marketplace icon path "${pkg.icon}" does not exist.`,
            category: 'quality',
            severity: 'medium',
            confidence: 1.0,
            filePath: extPkgPath,
            sourceAnalyzer: this.id,
            evidence: [
              {
                type: 'manifest_mismatch',
                description: `Icon not found at: ${iconPath}`,
                source: this.id,
                filePath: extPkgPath,
              },
            ],
            inference: 'VS Code marketplace packaging or display will fail or show broken placeholder icon.',
            recommendation: 'Ensure icon exists at the declared path.',
          });
        }
      }

      // 4. Validate contributes.commands
      const declaredCommands = new Set<string>();
      if (pkg.contributes && Array.isArray(pkg.contributes.commands)) {
        for (const cmd of pkg.contributes.commands) {
          if (!cmd.command || typeof cmd.command !== 'string') {
            findings.push({
              ruleId: 'EXT-CMD-INVALID',
              title: 'Malformed command contribution in package.json',
              message: 'Command entry lacks a valid "command" identifier string.',
              category: 'quality',
              severity: 'high',
              confidence: 1.0,
              filePath: extPkgPath,
              sourceAnalyzer: this.id,
              evidence: [
                {
                  type: 'command_gap',
                  description: `Command object missing string identifier: ${JSON.stringify(cmd)}`,
                  source: this.id,
                  filePath: extPkgPath,
                },
              ],
              inference: 'VS Code cannot register or execute an unnamed command.',
              recommendation: 'Provide a valid "command" identifier string (e.g. craftlens.<name>).',
            });
          } else {
            declaredCommands.add(cmd.command);
          }
        }
      }

      // 5. Validate contributes.menus point to declared commands
      if (pkg.contributes && pkg.contributes.menus) {
        for (const [menuName, menuItems] of Object.entries(pkg.contributes.menus)) {
          if (Array.isArray(menuItems)) {
            for (const item of menuItems as any[]) {
              if (item.command && !declaredCommands.has(item.command) && !item.command.startsWith('vscode.')) {
                findings.push({
                  ruleId: 'EXT-MENU-UNDEFINED-CMD',
                  title: `Menu item references undeclared command: ${item.command}`,
                  message: `Menu "${menuName}" references command "${item.command}" which is not declared under contributes.commands.`,
                  category: 'quality',
                  severity: 'high',
                  confidence: 0.95,
                  filePath: extPkgPath,
                  sourceAnalyzer: this.id,
                  evidence: [
                    {
                      type: 'command_gap',
                      description: `Menu item references undeclared command "${item.command}".`,
                      source: this.id,
                      filePath: extPkgPath,
                    },
                  ],
                  inference: 'Clicking this menu item in VS Code will display a command not found warning.',
                  recommendation: `Declare command "${item.command}" under contributes.commands or fix menu item.`,
                });
              }
            }
          }
        }
      }

      // 6. Check for stale "antislop" / "Anti-Slop" in user-facing marketplace fields
      const userFacingFields = [pkg.displayName, pkg.description];
      for (const field of userFacingFields) {
        if (typeof field === 'string' && (field.toLowerCase().includes('antislop') || field.includes('Anti-Slop'))) {
          findings.push({
            ruleId: 'EXT-MANIFEST-LEGACY-BRANDING',
            title: 'Stale legacy branding detected in extension manifest',
            message: `User-facing manifest string contains legacy name "Anti-Slop": "${field}"`,
            category: 'quality',
            severity: 'low',
            confidence: 0.95,
            filePath: extPkgPath,
            sourceAnalyzer: this.id,
            evidence: [
              {
                type: 'manifest_mismatch',
                description: `Legacy branding found in manifest string: ${field}`,
                source: this.id,
                filePath: extPkgPath,
              },
            ],
            inference: 'Marketplace branding will be inconsistent with CraftLens identity.',
            recommendation: 'Update manifest fields to use CraftLens branding.',
          });
        }
      }
    } catch (err: any) {
      findings.push({
        ruleId: 'EXT-MANIFEST-PARSE-ERROR',
        title: 'Failed to parse package.json manifest',
        message: err.message,
        category: 'quality',
        severity: 'critical',
        confidence: 1.0,
        filePath: extPkgPath,
        sourceAnalyzer: this.id,
        evidence: [
          {
            type: 'manifest_mismatch',
            description: `JSON parse exception: ${err.message}`,
            source: this.id,
            filePath: extPkgPath,
          },
        ],
        inference: 'Corrupted package.json prevents extension compilation and activation.',
        recommendation: 'Fix JSON syntax in package.json.',
      });
    }

    return {
      analyzerId: this.id,
      analyzerName: this.name,
      category: this.category,
      status: findings.some(f => f.severity === 'critical') ? 'fail' : findings.length > 0 ? 'warn' : 'pass',
      durationMs: Date.now() - start,
      findings,
      notes: `Extension manifest validation finished. Checked commands, menus, entrypoint, and metadata.`,
    };
  }

  private findExtensionPackageJson(workspaceRoot: string): string | null {
    const extPkgPath = path.join(workspaceRoot, 'apps', 'vscode-extension', 'package.json');
    if (fs.existsSync(extPkgPath)) return extPkgPath;

    const rootPkgPath = path.join(workspaceRoot, 'package.json');
    if (fs.existsSync(rootPkgPath)) {
      try {
        const content = fs.readFileSync(rootPkgPath, 'utf-8');
        const parsed = JSON.parse(content);
        if (parsed.engines && parsed.engines.vscode) return rootPkgPath;
      } catch {
        // ignore
      }
    }
    return null;
  }
}

