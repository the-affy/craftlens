import * as fs from 'node:fs';
import * as path from 'node:path';
import { QAAnalyzer, QACategory, QAContext, QARawFinding, QAResult } from '../types.js';

export class CommandRegistryAnalyzer implements QAAnalyzer {
  id = 'qa-command-registry';
  name = 'Command Registry & Handler Analyzer';
  category: QACategory = 'extension';

  async isAvailable(context: QAContext): Promise<boolean> {
    const cmdManagerFile = path.join(
      context.workspaceRoot,
      'apps',
      'vscode-extension',
      'src',
      'commands',
      'command-manager.ts'
    );
    return fs.existsSync(cmdManagerFile);
  }

  async analyze(context: QAContext, signal?: AbortSignal): Promise<QAResult> {
    const start = Date.now();
    const findings: QARawFinding[] = [];
    const root = context.workspaceRoot;

    const extPkgPath = path.join(root, 'apps', 'vscode-extension', 'package.json');
    const cmdManagerPath = path.join(
      root,
      'apps',
      'vscode-extension',
      'src',
      'commands',
      'command-manager.ts'
    );

    if (!fs.existsSync(extPkgPath) || !fs.existsSync(cmdManagerPath)) {
      return {
        analyzerId: this.id,
        analyzerName: this.name,
        category: this.category,
        status: 'skipped',
        durationMs: Date.now() - start,
        findings: [],
        skipReason: 'Extension manifest or command manager file not found.',
      };
    }

    // 1. Read declared commands from package.json
    let declaredCommands: { command: string; title: string }[] = [];
    try {
      const pkg = JSON.parse(fs.readFileSync(extPkgPath, 'utf-8'));
      if (pkg.contributes && Array.isArray(pkg.contributes.commands)) {
        declaredCommands = pkg.contributes.commands;
      }
    } catch {
      // ignore, caught by manifest analyzer
    }

    // 2. Scan code registrations in command-manager.ts (and extension.ts)
    const registeredCommands = new Map<string, { filePath: string; line: number }[]>();
    const filesToScan = [
      cmdManagerPath,
      path.join(root, 'apps', 'vscode-extension', 'src', 'extension.ts'),
    ];

    for (const f of filesToScan) {
      if (!fs.existsSync(f)) continue;
      const content = fs.readFileSync(f, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // Matches registerCmd('commandId') or registerCommand('commandId')
        const match = /(?:registerCmd|registerCommand)\(\s*['"]([^'"]+)['"]/.exec(line);
        if (match) {
          const cmdId = match[1];
          const existing = registeredCommands.get(cmdId) || [];
          existing.push({ filePath: f, line: lineNum });
          registeredCommands.set(cmdId, existing);
        }
      }
    }

    // 3. Detect Declared Commands Missing Code Handlers
    for (const decl of declaredCommands) {
      const regList = registeredCommands.get(decl.command);
      if (!regList || regList.length === 0) {
        findings.push({
          ruleId: 'CMD-BROKEN-MISSING-HANDLER',
          title: `Declared command has no registered handler: ${decl.command}`,
          message: `Command "${decl.command}" ("${decl.title}") is declared in package.json but never registered in code.`,
          category: 'quality',
          severity: 'critical',
          confidence: 1.0,
          filePath: extPkgPath,
          sourceAnalyzer: this.id,
          evidence: [
            {
              type: 'command_gap',
              description: `Command "${decl.command}" appears in package.json contributes.commands but has 0 registerCommand handlers.`,
              source: this.id,
              filePath: extPkgPath,
            },
          ],
          inference: 'Triggering this command from the Command Palette or a menu will result in "command not found" error.',
          recommendation: `Register a handler in CommandManager for "${decl.command}" or remove it from package.json.`,
        });
      }
    }

    // 4. Detect Duplicate Registrations
    for (const [cmdId, locations] of registeredCommands.entries()) {
      if (locations.length > 1) {
        // Double registration can cause duplicate listener execution or command override
        // Unless it's an intentional alias in separate files
        const primary = locations[0];
        findings.push({
          ruleId: 'CMD-DUPLICATE-REGISTRATION',
          title: `Duplicate command registration for: ${cmdId}`,
          message: `Command "${cmdId}" is registered multiple times (${locations.length} registrations).`,
          category: 'quality',
          severity: 'medium',
          confidence: 0.95,
          filePath: primary.filePath,
          startLine: primary.line,
          sourceAnalyzer: this.id,
          evidence: locations.map(loc => ({
            type: 'command_gap',
            description: `Registration at line ${loc.line}`,
            source: this.id,
            filePath: loc.filePath,
            line: loc.line,
          })),
          inference: 'Multiple command registrations overwrite earlier handlers and can cause unpredictable behavior.',
          recommendation: `Consolidate duplicate registrations for "${cmdId}" into a single handler.`,
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
        declaredCommandsCount: declaredCommands.length,
        registeredCommandsCount: registeredCommands.size,
        missingHandlersCount: findings.filter(f => f.ruleId === 'CMD-BROKEN-MISSING-HANDLER').length,
      },
      notes: `Checked ${declaredCommands.length} declared commands and ${registeredCommands.size} registered handlers.`,
    };
  }
}

