import ts from 'typescript';
import { Finding, UIDebugSummary, Signal, Pattern, ProjectContext } from '@craftlens/core';
import { UnifiedUIParser, ParsedUIDocument } from '@craftlens/parser';
import { StyleAnalyzer, StyleAnalysisResult } from './style-analyzer.js';
import { PatternAnalyzer, PatternAnalysisResult } from './pattern-analyzer.js';
import { CompositionAnalyzer, CompositionAnalysisResult } from './composition-analyzer.js';
import { RenderAnalyzer, RenderAnalysisResult, RenderAnalysisOptions } from './render-analyzer.js';
import { ContextAnalyzer, ContextAnalysisResult } from './context-analyzer.js';
import { SignalEngine, ExtractedSignalsResult } from '../signals/signal-engine.js';
import { PatternEngine } from '../patterns/pattern-engine.js';
import { ContextReasoner, EvaluatedPatternResult } from '../context/context-reasoner.js';
import { CrossScreenEngine } from '../cross-screen/cross-screen-engine.js';

export interface UIAnalysisReport {
  doc: ParsedUIDocument;
  styles: StyleAnalysisResult;
  patterns: PatternAnalysisResult;
  composition: CompositionAnalysisResult;
  render: RenderAnalysisResult;
  context: ContextAnalysisResult;
  signalsResult: ExtractedSignalsResult;
  recognizedPatterns: Pattern[];
  evaluatedPatterns: EvaluatedPatternResult[];
  findings: Finding[];
  debugSummary: UIDebugSummary;
}

export class UIAnalyzer {
  private static lastFilePath = '';
  private static lastSourceText = '';
  private static lastReport: UIAnalysisReport | null = null;

  public static clearCache(): void {
    UIAnalyzer.lastFilePath = '';
    UIAnalyzer.lastSourceText = '';
    UIAnalyzer.lastReport = null;
    CrossScreenEngine.clear();
  }

  public static analyze(
    filePath: string,
    sourceText: string,
    existingSourceFile?: ts.SourceFile,
    projectContext?: ProjectContext,
    renderOptions?: RenderAnalysisOptions
  ): UIAnalysisReport {
    if (
      UIAnalyzer.lastReport &&
      UIAnalyzer.lastFilePath === filePath &&
      UIAnalyzer.lastSourceText === sourceText &&
      !projectContext
    ) {
      return UIAnalyzer.lastReport;
    }

    // 1. Unified parsing (HTML / JSX / TSX / Vue / Svelte)
    const doc = UnifiedUIParser.parse(filePath, sourceText, existingSourceFile);

    // 2. Style analysis
    const styles = StyleAnalyzer.analyze(doc);

    // 3. Pattern analysis (legacy structure)
    const patterns = PatternAnalyzer.analyze(doc);

    // 4. Composition analysis (existing rule integration)
    const composition = CompositionAnalyzer.analyze(doc);

    // 5. Render analysis (capability check)
    const render = RenderAnalyzer.analyze(doc, renderOptions);

    // 6. Context analysis
    const context = ContextAnalyzer.analyze(doc);

    // 7. Layer 1: Deterministic Signals Extraction
    const signalsResult = SignalEngine.extract(doc);

    // 8. Layer 2: Pattern Recognition
    const recognizedPatterns = PatternEngine.recognize(doc, signalsResult);

    // 9. Layer 3: Product Context Reasoning
    const evaluatedPatterns = ContextReasoner.evaluate(doc, recognizedPatterns, projectContext);

    // 10. Layer 4: Cross-Screen Registration & Detection
    CrossScreenEngine.registerScreen(doc, recognizedPatterns);
    const crossScreenFindings = CrossScreenEngine.detectCrossScreenConvergence();

    // 11. Aggregate and deduplicate all findings
    const evaluatedFindings = evaluatedPatterns
      .filter(p => p.shouldReport && p.finding)
      .map(p => p.finding!);

    const allFindings: Finding[] = [
      ...composition.findings,
      ...render.findings,
      ...context.convergenceFindings,
      ...evaluatedFindings,
      ...crossScreenFindings,
    ];

    // Deduplicate findings by ruleId + line (or fingerprint)
    const seen = new Set<string>();
    const deduplicatedFindings: Finding[] = [];
    for (const f of allFindings) {
      const line = f.location?.start?.line ?? 1;
      const key = `${f.ruleId}:${line}`;
      if (!seen.has(key)) {
        seen.add(key);

        // Enrich finding with lineage
        const matchingEval = evaluatedPatterns.find(e => e.finding?.id === f.id || e.finding?.ruleId === f.ruleId);
        if (matchingEval) {
          f.verification = f.verification || matchingEval.finding?.verification;
          f.falsePositiveNote = f.falsePositiveNote || matchingEval.falsePositiveNote;
          f.falsePositiveContext = f.falsePositiveContext || matchingEval.falsePositiveContext;
          f.signals = f.signals || matchingEval.pattern.signals;
        }

        deduplicatedFindings.push(f);
      }
    }

    // 12. Build UIDebugSummary for Requirement 20
    const clusters: Record<string, number> = {};
    for (const f of deduplicatedFindings) {
      const c = f.clusterId || f.problemTitle || f.ruleId;
      clusters[c] = (clusters[c] || 0) + 1;
    }

    const high = deduplicatedFindings.filter(f => f.severity === 'error' || f.severity === 'blocker').length;
    const medium = deduplicatedFindings.filter(f => f.severity === 'warning').length;
    const suggestions = deduplicatedFindings.filter(f => f.severity === 'suggestion' || f.severity === 'info').length;

    const suppressedFindings: { ruleId: string; reason: string }[] = [];
    for (const ev of evaluatedPatterns) {
      if (!ev.shouldReport) {
        suppressedFindings.push({
          ruleId: ev.pattern.type,
          reason: ev.falsePositiveNote || `Confidence below threshold (${Math.round(ev.adjustedConfidence * 100)}%)`,
        });
      }
    }

    const debugSummary: UIDebugSummary = {
      projectDetected: typeof projectContext?.productMeta?.productType === 'string' && projectContext.productMeta.productType.trim()
        ? `${projectContext.productMeta.productType.trim().toUpperCase()} (${projectContext.framework || 'Web'})`
        : projectContext?.framework || 'Web application',
      frameworkDetected: projectContext?.framework || (doc.filePath.endsWith('.tsx') ? 'React / TypeScript' : 'HTML / Web'),
      uiFilesDiscovered: 1,
      componentsDiscovered: doc.all.length,
      stylesDiscovered: styles.colorPalette.size + styles.radii.length + styles.shadows.length,
      tokensDiscovered: projectContext?.designSystem?.spacing.length || 0,
      routesDiscovered: projectContext?.routes || [],
      domAvailable: true,
      renderedUiAvailable: render.isRenderAvailable,
      filesScanned: 1,
      uiFiles: 1,
      components: doc.all.length,
      rulesExecuted: 82,
      rulesSkipped: 0,
      rawSignalsList: signalsResult.signals.map(s => `${s.type} (${s.source})`),
      patternsBuilt: recognizedPatterns.map(p => `${p.type} (conf: ${Math.round(p.confidence * 100)}%)`),
      signalsDetected: {
        cards: patterns.cards.cards.length,
        buttons: patterns.buttons.allButtons.length,
        badges: patterns.badges.allBadges.length,
        gradients: styles.gradients.length,
        glows: styles.glows.length,
        largeRadii: styles.radii.filter(r => r.radius >= 16).length,
        shadows: styles.shadows.length,
        repeatedComponents: patterns.cards.isVisuallyIdentical ? patterns.cards.cards.length : 0,
        sparkles: patterns.icons.sparkleIcons.length,
        fakeMetrics: composition.fakeProductSignalsDetected ? 1 : 0,
      },
      clusters,
      findings: {
        high,
        medium,
        suggestions,
      },
      suppressedFindings,
    };

    const report: UIAnalysisReport = {
      doc,
      styles,
      patterns,
      composition,
      render,
      context,
      signalsResult,
      recognizedPatterns,
      evaluatedPatterns,
      findings: deduplicatedFindings,
      debugSummary,
    };

    UIAnalyzer.lastFilePath = filePath;
    UIAnalyzer.lastSourceText = sourceText;
    UIAnalyzer.lastReport = report;

    return report;
  }
}
