import * as vscode from 'vscode';
import { formatConfidencePercent } from '@anti-slop/core';
import { DiagnosticsCollectionAdapter, mapLocationToVsCodeRange } from '../diagnostics/collection-adapter.js';

export class AntiSlopHoverProvider implements vscode.HoverProvider {
  constructor(private diagnosticsAdapter: DiagnosticsCollectionAdapter) {}

  public provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.Hover> {
    const fileFindings = this.diagnosticsAdapter.getFindingsForFile(document.uri.fsPath);
    if (fileFindings.length === 0) return null;

    // Find any finding whose location contains the hovered position
    const matching = fileFindings.filter(f => {
      const range = mapLocationToVsCodeRange(f.location);
      return range.contains(position);
    });

    if (matching.length === 0) return null;

    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;

    for (const f of matching) {
      const typeBadge = f.findingType === 'pattern_observation'
        ? '`PATTERN OBSERVATION`'
        : f.findingType === 'suggestion'
        ? '`SUGGESTION`'
        : '`PROBLEM`';

      const icon = f.severity === 'error' || f.severity === 'blocker' ? '🔴' : f.severity === 'warning' ? '🟠' : '💡';

      markdown.appendMarkdown(`${icon} **[${f.ruleId}] ${f.message}** ${typeBadge}\n\n`);
      markdown.appendMarkdown(`*Confidence:* ${formatConfidencePercent(f.confidence)} | *Severity:* \`${f.severity.toUpperCase()}\`\n\n`);
      markdown.appendMarkdown(`**Why this matters:**\n${f.description}\n\n`);

      if (f.evidence && f.evidence.length > 0) {
        markdown.appendMarkdown(`**Evidence:**\n`);
        for (const ev of f.evidence) {
          markdown.appendMarkdown(`- *[${ev.type.toUpperCase()}]* ${ev.explanation}\n`);
          if (ev.snippet) {
            markdown.appendMarkdown(`  \`\`\`typescript\n  ${ev.snippet}\n  \`\`\`\n`);
          }
        }
        markdown.appendMarkdown('\n');
      }

      if (f.recommendation) {
        markdown.appendMarkdown(`**Recommendation:**\n${f.recommendation}\n\n`);
      }

      if (f.fix) {
        markdown.appendMarkdown(`*Quick Fix available:* **${f.fix.title}** (${f.fix.kind})\n\n`);
      }

      markdown.appendMarkdown('---\n');
    }

    return new vscode.Hover(markdown);
  }
}
