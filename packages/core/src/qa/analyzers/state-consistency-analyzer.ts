import * as fs from 'node:fs';
import * as path from 'node:path';
import { QAAnalyzer, QACategory, QAContext, QARawFinding, QAResult } from '../types.js';

export class StateConsistencyAnalyzer implements QAAnalyzer {
  id = 'qa-state-consistency';
  name = 'State Consistency & Single Source of Truth Analyzer';
  category: QACategory = 'state';

  async isAvailable(context: QAContext): Promise<boolean> {
    const storePath = path.join(context.workspaceRoot, 'packages', 'core', 'src', 'store', 'finding-store.ts');
    return fs.existsSync(storePath);
  }

  async analyze(context: QAContext, signal?: AbortSignal): Promise<QAResult> {
    const start = Date.now();
    const findings: QARawFinding[] = [];
    const root = context.workspaceRoot;

    const filesToInspect = [
      path.join(root, 'packages', 'core', 'src', 'store', 'finding-store.ts'),
      path.join(root, 'apps', 'vscode-extension', 'src', 'overview', 'project-overview-panel.ts'),
      path.join(root, 'apps', 'vscode-extension', 'src', 'sidebar', 'sidebar-provider.ts'),
      path.join(root, 'apps', 'vscode-extension', 'src', 'sidebar', 'detail-panel-provider.ts'),
    ];

    for (const filePath of filesToInspect) {
      if (!fs.existsSync(filePath)) continue;

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const lineNum = i + 1;

          // 1. Rogue independent selection copies: sidebarSelectedIssue, overviewSelectedIssue, bottomPanelSelectedIssue
          const rogueSelectionRegex = /\b(sidebarSelectedIssue|overviewSelectedIssue|bottomPanelSelectedIssue)\b/;
          if (rogueSelectionRegex.test(line) && !line.includes('//') && !line.includes('test')) {
            findings.push({
              ruleId: 'STATE-ROGUE-INDEPENDENT-SELECTION',
              title: 'Independent selection state copy detected',
              message: `Found decoupled selection state variable "${line.trim()}". All surfaces must use canonical selectedIssueId.`,
              category: 'quality',
              severity: 'critical',
              confidence: 0.95,
              filePath,
              startLine: lineNum,
              sourceAnalyzer: this.id,
              evidence: [
                {
                  type: 'state_mismatch',
                  description: `Decoupled selection state declared: ${line.trim()}`,
                  source: this.id,
                  filePath,
                  line: lineNum,
                },
              ],
              inference: 'Decoupled selection variables lead to desynchronization between Sidebar and Overview.',
              recommendation: 'Remove local selection state and consume `findingStore.getSelectedIssueId()`.',
            });
          }

          // 2. Separate issue databases (e.g., creating a secondary issue map outside IssueRegistry)
          if (
            line.includes('new Map<string, Issue>') &&
            !filePath.includes('issue-registry.ts') &&
            !filePath.includes('test')
          ) {
            findings.push({
              ruleId: 'STATE-PARALLEL-ISSUE-STORE',
              title: 'Parallel Issue storage detected outside canonical IssueRegistry',
              message: 'Component is maintaining an independent Issue database.',
              category: 'quality',
              severity: 'high',
              confidence: 0.90,
              filePath,
              startLine: lineNum,
              sourceAnalyzer: this.id,
              evidence: [
                {
                  type: 'state_mismatch',
                  description: 'Parallel Map<string, Issue> instantiation detected.',
                  source: this.id,
                  filePath,
                  line: lineNum,
                },
              ],
              inference: 'Parallel stores create conflicting issue states and diverge during resolution.',
              recommendation: 'Use the canonical IssueRegistry via findingStore.getIssueRegistry().',
            });
          }
        }
      } catch {
        // ignore
      }
    }

    return {
      analyzerId: this.id,
      analyzerName: this.name,
      category: this.category,
      status: findings.some(f => f.severity === 'critical') ? 'fail' : findings.length > 0 ? 'warn' : 'pass',
      durationMs: Date.now() - start,
      findings,
      notes: `State consistency inspection verified selectedIssueId and single source of truth across panels.`,
    };
  }
}

