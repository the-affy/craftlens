import * as vscode from 'vscode';
import { Finding, formatConfidencePercent, normalizeSeverity } from '@craftlens/core';

export function createCompactFindingHover(finding: Finding, documentUri?: vscode.Uri): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.isTrusted = true;
  md.supportHtml = true;

  const title = finding.title || finding.problemTitle || finding.whatIsWrong || finding.ruleId;
  const count = finding.instances?.length || 1;
  const summary = finding.summary || finding.whatIsWrong || finding.message;

  // Title & primary summary
  md.appendMarkdown(`### ${title}\n`);
  if (summary) {
    md.appendMarkdown(`${summary}\n\n`);
  }

  // WHY IT MATTERS (Section 2)
  const why = finding.whyItMatters || finding.why || finding.description;
  if (why) {
    md.appendMarkdown(`**WHY IT MATTERS**\n${why}\n\n`);
  }

  // EVIDENCE (Section 2: bullet points)
  const evidenceList: string[] = [];
  if (finding.evidence && finding.evidence.length > 0) {
    for (const ev of finding.evidence) {
      if (typeof ev === 'string') {
        evidenceList.push(ev);
      } else if (ev && typeof ev === 'object') {
        const text = (ev as any).explanation || (ev as any).snippet;
        if (text && !evidenceList.includes(text)) {
          evidenceList.push(text);
        }
      }
    }
  }

  // If repeated cards, ensure the detected evidence points are present
  if (finding.ruleId === 'CP-007' || (finding.instances && finding.instances.length > 1)) {
    const instCount = finding.instances?.length || count;
    const hasSibling = evidenceList.some(e => e.includes('sibling cards'));
    if (!hasSibling) {
      evidenceList.unshift(`${instCount} sibling cards`);
    }
  }

  if (evidenceList.length > 0) {
    md.appendMarkdown(`**EVIDENCE**\n`);
    for (const item of evidenceList.slice(0, 7)) {
      md.appendMarkdown(`• ${item}\n`);
    }
    md.appendMarkdown('\n');
  }

  // Severity and Confidence
  const rawSev = typeof finding.severity === 'string' ? finding.severity.toLowerCase() : '';
  const displaySev = rawSev === 'moderate'
    ? 'Moderate'
    : (() => {
        const norm = normalizeSeverity(finding.severity);
        return norm.charAt(0).toUpperCase() + norm.slice(1);
      })();
  const confPercent = formatConfidencePercent(finding.confidence || 0.94);

  md.appendMarkdown(`**Severity**  ${displaySev}  \n`);
  md.appendMarkdown(`**Confidence** ${confPercent}\n\n`);

  // Action links
  const targetId = finding.id || finding.fingerprint || finding.ruleId;
  const suggestArgs = encodeURIComponent(JSON.stringify([targetId, documentUri?.toString()]));
  md.appendMarkdown(`[ Suggest Better Design ](command:craftlens.suggestBetterDesign?${suggestArgs})`);

  if (finding.suggestions && finding.suggestions.length > 0 && finding.suggestions[0].replacement) {
    const applyArgs = encodeURIComponent(JSON.stringify([targetId, 0]));
    md.appendMarkdown(`  |  [ Suggested Fix ](command:craftlens.applySuggestion?${applyArgs})`);
  } else if (finding.fix || finding.designFix) {
    const fixArgs = encodeURIComponent(JSON.stringify([documentUri?.toString(), targetId]));
    md.appendMarkdown(`  |  [ Suggested Fix ](command:craftlens.applyQuickFix?${fixArgs})  |  [ Preview Fix ](command:craftlens.previewDesignFix?${fixArgs})`);
  }

  md.appendMarkdown(`  |  [ Reject ](command:craftlens.rejectFinding?${encodeURIComponent(JSON.stringify([targetId]))})`);

  return md;
}
