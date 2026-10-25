import * as vscode from 'vscode';
import { Finding, Severity, SourceLocation, FindingStore } from '@craftlens/core';

export function mapSeverityToVsCode(severity: Severity): vscode.DiagnosticSeverity {
  switch (severity) {
    case 'blocker':
    case 'error':
      return vscode.DiagnosticSeverity.Error;
    case 'warning':
      return vscode.DiagnosticSeverity.Warning;
    case 'suggestion':
      return vscode.DiagnosticSeverity.Information;
    case 'info':
    default:
      return vscode.DiagnosticSeverity.Hint;
  }
}

export function mapLocationToVsCodeRange(loc: SourceLocation | any): vscode.Range {
  if (!loc) {
    return new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
  }
  if (loc.range && typeof loc.range.startLine === 'number') {
    const startLine = Math.max(0, loc.range.startLine - 1);
    const startCol = Math.max(0, loc.range.startColumn - 1);
    const endLine = Math.max(startLine, (loc.range.endLine ?? loc.range.startLine) - 1);
    const endCol = Math.max(0, (loc.range.endColumn ?? loc.range.startColumn) - 1);
    return new vscode.Range(new vscode.Position(startLine, startCol), new vscode.Position(endLine, endCol));
  }
  const startLine = Math.max(0, (loc.start?.line ?? 1) - 1);
  const startCol = Math.max(0, (loc.start?.column ?? 1) - 1);
  const endLine = Math.max(startLine, (loc.end?.line ?? (startLine + 1)) - 1);
  const endCol = Math.max(0, (loc.end?.column ?? (startCol + 1)) - 1);

  return new vscode.Range(
    new vscode.Position(startLine, startCol),
    new vscode.Position(endLine, endCol)
  );
}

export interface CraftLensDiagnostic extends vscode.Diagnostic {
  craftLensFinding?: Finding;
}

export function createVsCodeDiagnostic(finding: Finding): CraftLensDiagnostic {
  const range = mapLocationToVsCodeRange(finding.location);
  const severity = mapSeverityToVsCode(finding.severity);

  // Human-friendly diagnostic message without raw rule ID prefix
  const title = finding.problemTitle || finding.title || finding.whatIsWrong || finding.message;
  const parts: string[] = [title];
  if (finding.whatIsWrong && finding.whatIsWrong !== title) {
    parts.push(finding.whatIsWrong);
  }
  if (finding.whyItMatters) {
    parts.push(`Why: ${finding.whyItMatters}`);
  }
  if (finding.howToFix) {
    parts.push(`Fix: ${finding.howToFix}`);
  }
  const formattedMessage = parts.join('\n');
  const diagnostic: CraftLensDiagnostic = new vscode.Diagnostic(range, formattedMessage, severity);

  diagnostic.code = finding.ruleId;
  diagnostic.source = 'CraftLens';
  diagnostic.craftLensFinding = finding;

  if (Array.isArray(finding.evidence) && finding.evidence.length > 0) {
    diagnostic.relatedInformation = finding.evidence
      .filter((ev): ev is any => ev !== null && ev !== undefined)
      .map(ev => {
        const evType = typeof ev === 'string'
          ? 'EVIDENCE'
          : typeof ev.type === 'string' && ev.type.trim()
            ? ev.type.trim().toUpperCase()
            : 'EVIDENCE';

        const evExplanation = typeof ev === 'string'
          ? ev
          : typeof ev.explanation === 'string'
            ? ev.explanation
            : typeof ev.snippet === 'string'
              ? ev.snippet
              : 'Evidence detail';

        const targetFilePath = ev.location?.filePath || finding.filePath || finding.location?.filePath;
        const targetUri = targetFilePath ? vscode.Uri.file(targetFilePath) : undefined;
        const evRange = ev.location ? mapLocationToVsCodeRange(ev.location) : range;

        return targetUri
          ? new vscode.DiagnosticRelatedInformation(
              new vscode.Location(targetUri, evRange),
              `[${evType}] ${evExplanation}`
            )
          : undefined;
      })
      .filter((rel): rel is vscode.DiagnosticRelatedInformation => Boolean(rel));
  }

  return diagnostic;
}

export class DiagnosticsCollectionAdapter {
  private collection: vscode.DiagnosticCollection;
  private findingStore: FindingStore;

  constructor(findingStore?: FindingStore) {
    this.collection = vscode.languages.createDiagnosticCollection('CraftLens');
    this.findingStore = findingStore || new FindingStore();
  }

  public getFindingStore(): FindingStore {
    return this.findingStore;
  }

  public update(uri: vscode.Uri, findings: Finding[]): void {
    this.findingStore.setFindingsForFile(uri.fsPath, findings);
    const diagnostics = findings.map(f => createVsCodeDiagnostic(f));
    this.collection.set(uri, diagnostics);
  }

  public clear(uri: vscode.Uri): void {
    this.findingStore.clearFile(uri.fsPath);
    this.collection.delete(uri);
  }

  public clearAll(): void {
    this.findingStore.clearAll();
    this.collection.clear();
  }

  public getFindingsForFile(filePath: string): Finding[] {
    return this.findingStore.getFindingsForFile(filePath);
  }

  public getAllFindings(): Map<string, Finding[]> {
    return this.findingStore.getFindingsMap();
  }

  public dispose(): void {
    this.collection.dispose();
  }
}
