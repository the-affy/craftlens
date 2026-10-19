import * as vscode from 'vscode';
import { Finding, Severity, SourceLocation } from '@anti-slop/core';

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

export function mapLocationToVsCodeRange(loc: SourceLocation): vscode.Range {
  const startLine = Math.max(0, loc.start.line - 1);
  const startCol = Math.max(0, loc.start.column - 1);
  const endLine = Math.max(0, loc.end.line - 1);
  const endCol = Math.max(0, loc.end.column - 1);

  return new vscode.Range(
    new vscode.Position(startLine, startCol),
    new vscode.Position(endLine, endCol)
  );
}

export interface AntiSlopDiagnostic extends vscode.Diagnostic {
  antiSlopFinding?: Finding;
}

export function createVsCodeDiagnostic(finding: Finding): AntiSlopDiagnostic {
  const range = mapLocationToVsCodeRange(finding.location);
  const severity = mapSeverityToVsCode(finding.severity);

  const formattedMessage = `[${finding.ruleId}] ${finding.message}\n${finding.description}`;
  const diagnostic: AntiSlopDiagnostic = new vscode.Diagnostic(range, formattedMessage, severity);

  diagnostic.code = finding.ruleId;
  diagnostic.source = 'Anti-Slop';
  diagnostic.antiSlopFinding = finding;

  if (finding.evidence && finding.evidence.length > 0) {
    diagnostic.relatedInformation = finding.evidence.map(ev => {
      const targetUri = ev.location ? vscode.Uri.file(ev.location.filePath) : vscode.Uri.file(finding.location.filePath);
      const evRange = ev.location ? mapLocationToVsCodeRange(ev.location) : range;
      return new vscode.DiagnosticRelatedInformation(
        new vscode.Location(targetUri, evRange),
        `[${ev.type.toUpperCase()}] ${ev.explanation}`
      );
    });
  }

  return diagnostic;
}

export class DiagnosticsCollectionAdapter {
  private collection: vscode.DiagnosticCollection;
  private findingStore = new Map<string, Finding[]>();

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection('anti-slop');
  }

  public update(uri: vscode.Uri, findings: Finding[]): void {
    this.findingStore.set(uri.fsPath, findings);
    const diagnostics = findings.map(f => createVsCodeDiagnostic(f));
    this.collection.set(uri, diagnostics);
  }

  public clear(uri: vscode.Uri): void {
    this.findingStore.delete(uri.fsPath);
    this.collection.delete(uri);
  }

  public clearAll(): void {
    this.findingStore.clear();
    this.collection.clear();
  }

  public getFindingsForFile(filePath: string): Finding[] {
    return this.findingStore.get(filePath) || [];
  }

  public getAllFindings(): Map<string, Finding[]> {
    return this.findingStore;
  }

  public dispose(): void {
    this.collection.dispose();
  }
}
