import * as vscode from 'vscode';
import { DiagnosticsCollectionAdapter } from '../diagnostics/collection-adapter.js';
import { ConfigurationManager } from '../configuration/config-manager.js';

/**
 * InlayHintsProvider - Streamlined to prevent duplicate inline finding text (Section 1).
 * The primary finding indicator is handled exclusively by CraftLensInlineDecorationManager.
 */
export class CraftLensInlayHintsProvider implements vscode.InlayHintsProvider {
  private onDidChangeInlayHintsEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeInlayHints = this.onDidChangeInlayHintsEmitter.event;

  constructor(
    private diagnosticsAdapter: DiagnosticsCollectionAdapter,
    private configManager: ConfigurationManager
  ) {
    this.diagnosticsAdapter.getFindingStore().onDidChange(() => {
      this.refresh();
    });
  }

  public refresh(): void {
    this.onDidChangeInlayHintsEmitter.fire();
  }

  public provideInlayHints(
    _document: vscode.TextDocument,
    _range: vscode.Range,
    _token: vscode.CancellationToken
  ): vscode.InlayHint[] {
    // Return empty array to avoid redundant duplicate finding/status text beside the code (Section 1).
    // The single authoritative inline finding indicator is rendered by CraftLensInlineDecorationManager.
    return [];
  }
}
