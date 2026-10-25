import * as vscode from 'vscode';
import {
  Finding,
  normalizeFindingLocation,
  normalizeSeverity,
} from '@craftlens/core';
import { DiagnosticsCollectionAdapter, mapLocationToVsCodeRange } from '../diagnostics/collection-adapter.js';
import { createCompactFindingHover } from '../hover/compact-hover.js';

export type DiagnosticSeverityLevel = 'critical' | 'high' | 'warning' | 'moderate' | 'suggestion';

export function mapSeverityToDiagnosticLevel(severity?: string): DiagnosticSeverityLevel {
  const s = (severity || '').toLowerCase();
  if (s === 'critical' || s === 'blocker' || s === 'error') return 'critical';
  if (s === 'high') return 'high';
  if (s === 'warning' || s === 'medium') return 'warning';
  if (s === 'moderate') return 'moderate';
  return 'suggestion';
}

// Semantic diagnostic tokens (Section 1)
export const DIAGNOSTIC_DESIGN_TOKENS: Record<DiagnosticSeverityLevel, {
  backgroundColor: string;
  border: string;
  overviewRulerColor: vscode.ThemeColor | string;
  color: string;
}> = {
  // Critical/Error → red
  critical: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    border: '1px solid rgba(239, 68, 68, 0.35)',
    overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.errorForeground'),
    color: '#ef4444',
  },
  // High → strong red/orange
  high: {
    backgroundColor: 'rgba(234, 88, 12, 0.08)',
    border: '1px solid rgba(234, 88, 12, 0.35)',
    overviewRulerColor: '#ea580c',
    color: '#ea580c',
  },
  // Warning/Medium → yellow
  warning: {
    backgroundColor: 'rgba(234, 179, 8, 0.08)',
    border: '1px solid rgba(234, 179, 8, 0.35)',
    overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.warningForeground'),
    color: '#eab308',
  },
  // Moderate → orange
  moderate: {
    backgroundColor: 'rgba(249, 115, 22, 0.08)',
    border: '1px solid rgba(249, 115, 22, 0.35)',
    overviewRulerColor: '#f97316',
    color: '#f97316',
  },
  // Suggestion/Low → blue/neutral accent
  suggestion: {
    backgroundColor: 'rgba(56, 189, 248, 0.06)',
    border: '1px dashed rgba(56, 189, 248, 0.30)',
    overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.infoForeground'),
    color: '#38bdf8',
  },
};

export class CraftLensInlineDecorationManager implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  // 5 Semantic Diagnostics Decoration Types (Section 1)
  private criticalDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: DIAGNOSTIC_DESIGN_TOKENS.critical.backgroundColor,
    border: DIAGNOSTIC_DESIGN_TOKENS.critical.border,
    borderRadius: '3px',
    overviewRulerColor: DIAGNOSTIC_DESIGN_TOKENS.critical.overviewRulerColor,
    overviewRulerLane: vscode.OverviewRulerLane.Right,
  });

  private highDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: DIAGNOSTIC_DESIGN_TOKENS.high.backgroundColor,
    border: DIAGNOSTIC_DESIGN_TOKENS.high.border,
    borderRadius: '3px',
    overviewRulerColor: DIAGNOSTIC_DESIGN_TOKENS.high.overviewRulerColor,
    overviewRulerLane: vscode.OverviewRulerLane.Right,
  });

  private warningDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: DIAGNOSTIC_DESIGN_TOKENS.warning.backgroundColor,
    border: DIAGNOSTIC_DESIGN_TOKENS.warning.border,
    borderRadius: '3px',
    overviewRulerColor: DIAGNOSTIC_DESIGN_TOKENS.warning.overviewRulerColor,
    overviewRulerLane: vscode.OverviewRulerLane.Right,
  });

  private moderateDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: DIAGNOSTIC_DESIGN_TOKENS.moderate.backgroundColor,
    border: DIAGNOSTIC_DESIGN_TOKENS.moderate.border,
    borderRadius: '3px',
    overviewRulerColor: DIAGNOSTIC_DESIGN_TOKENS.moderate.overviewRulerColor,
    overviewRulerLane: vscode.OverviewRulerLane.Right,
  });

  private suggestionDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: DIAGNOSTIC_DESIGN_TOKENS.suggestion.backgroundColor,
    border: DIAGNOSTIC_DESIGN_TOKENS.suggestion.border,
    borderRadius: '3px',
    overviewRulerColor: DIAGNOSTIC_DESIGN_TOKENS.suggestion.overviewRulerColor,
    overviewRulerLane: vscode.OverviewRulerLane.Right,
  });

  // Active focus decoration (when user clicks an issue in the sidebar)
  private focusDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(54, 141, 243, 0.22)',
    border: '1px solid #368df3',
    borderRadius: '3px',
    isWholeLine: false,
  });

  constructor(private diagnosticsAdapter: DiagnosticsCollectionAdapter) {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        try {
          if (editor) {
            this.updateEditor(editor);
          }
        } catch (err: any) {
          console.error('[CraftLens] InlineDecoration onDidChangeActiveTextEditor failure:', err);
        }
      }),
      vscode.window.onDidChangeVisibleTextEditors(editors => {
        try {
          for (const editor of editors) {
            this.updateEditor(editor);
          }
        } catch (err: any) {
          console.error('[CraftLens] InlineDecoration onDidChangeVisibleTextEditors failure:', err);
        }
      })
    );

    const unsub = this.diagnosticsAdapter.getFindingStore().onDidChange(() => {
      try {
        this.updateAllVisibleEditors();
      } catch (err: any) {
        console.error('[CraftLens] InlineDecoration onDidChange failure:', err);
      }
    });
    this.disposables.push({ dispose: unsub });

    // Initial update
    try {
      this.updateAllVisibleEditors();
    } catch (err: any) {
      console.error('[CraftLens] InlineDecoration initial update failure:', err);
    }
  }

  public updateAllVisibleEditors(): void {
    try {
      for (const editor of vscode.window.visibleTextEditors) {
        this.updateEditor(editor);
      }
    } catch (err: any) {
      console.error('[CraftLens] updateAllVisibleEditors failure:', err);
    }
  }

  public highlightFocusRange(editor: vscode.TextEditor, range: vscode.Range): void {
    try {
      editor.setDecorations(this.focusDecoration, [range]);
      setTimeout(() => {
        try {
          editor.setDecorations(this.focusDecoration, []);
        } catch {
          // Editor might be closed
        }
      }, 3000);
    } catch (err: any) {
      console.error('[CraftLens] highlightFocusRange failure:', err);
    }
  }

  public updateEditor(editor: vscode.TextEditor): void {
    try {
      const doc = editor.document;
      if (doc.uri.scheme !== 'file') return;

      const findings = this.diagnosticsAdapter.getFindingsForFile(doc.uri.fsPath);

      if (findings.length === 0) {
        editor.setDecorations(this.criticalDecoration, []);
        editor.setDecorations(this.highDecoration, []);
        editor.setDecorations(this.warningDecoration, []);
        editor.setDecorations(this.moderateDecoration, []);
        editor.setDecorations(this.suggestionDecoration, []);
        return;
      }

    const criticalOptions: vscode.DecorationOptions[] = [];
    const highOptions: vscode.DecorationOptions[] = [];
    const warningOptions: vscode.DecorationOptions[] = [];
    const moderateOptions: vscode.DecorationOptions[] = [];
    const suggestionOptions: vscode.DecorationOptions[] = [];

    for (const f of findings) {
      const loc = normalizeFindingLocation(f);
      if (!loc) continue;

      const range = mapLocationToVsCodeRange(loc);
      const level = mapSeverityToDiagnosticLevel(f.severity);

      // Build compact hover explanation (Section 2)
      const hover = createCompactFindingHover(f, doc.uri);

      // Section 1: Finding severity is represented DIRECTLY by the highlighted diagnostic/range.
      // Separate Error / Warning / Moderate warning / Suggestion text below/after code is REMOVED.
      const option: vscode.DecorationOptions = {
        range,
        hoverMessage: hover,
        // renderOptions is explicitly omitted to remove redundant text below/after code!
      };

      if (level === 'critical') {
        criticalOptions.push(option);
      } else if (level === 'high') {
        highOptions.push(option);
      } else if (level === 'warning') {
        warningOptions.push(option);
      } else if (level === 'moderate') {
        moderateOptions.push(option);
      } else {
        suggestionOptions.push(option);
      }
    }

    editor.setDecorations(this.criticalDecoration, criticalOptions);
    editor.setDecorations(this.highDecoration, highOptions);
    editor.setDecorations(this.warningDecoration, warningOptions);
    editor.setDecorations(this.moderateDecoration, moderateOptions);
    editor.setDecorations(this.suggestionDecoration, suggestionOptions);
  } catch (err: any) {
    console.error('[CraftLens] updateEditor failure:', err);
  }
}

  public dispose(): void {
    this.criticalDecoration.dispose();
    this.highDecoration.dispose();
    this.warningDecoration.dispose();
    this.moderateDecoration.dispose();
    this.suggestionDecoration.dispose();
    this.focusDecoration.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
