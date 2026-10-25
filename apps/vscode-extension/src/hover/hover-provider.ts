import * as vscode from 'vscode';
import { DiagnosticsCollectionAdapter, mapLocationToVsCodeRange } from '../diagnostics/collection-adapter.js';
import { createCompactFindingHover } from './compact-hover.js';

export class CraftLensHoverProvider implements vscode.HoverProvider {
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

    // Render the compact finding hover for the most specific finding
    const primary = matching[0];
    const hoverMd = createCompactFindingHover(primary, document.uri);

    return new vscode.Hover(hoverMd);
  }
}
