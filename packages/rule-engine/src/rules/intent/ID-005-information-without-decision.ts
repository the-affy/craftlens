import ts from 'typescript';
import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  astEvidence,
} from '@craftlens/core';
import { ParsedDocument } from '@craftlens/parser';
import { inferDesignIntent } from '@craftlens/design-intelligence';

export const ID_005_RULE: CraftLensRule = {
  id: 'ID-005',
  category: 'visual',
  title: 'Metric Information Without Decision Context',
  description: 'Metric card displays isolated numeric data with no baseline, percentage delta, trend, or actionability.',
  rationale:
    'Dashboards are designed to support rapid decision-making. An isolated number (e.g. "4,200") without context (is that good? bad? rising? falling?) forces the user to guess its significance.',
  severity: 'suggestion',
  confidence: 0.85,
  engine: 'ast',
  recommendation: 'Add comparison context (e.g. "+12% vs last month", sparkline, or target threshold) so the metric is actionable.',
  fix: 'manual',
  platforms: ['react', 'web'],
  tags: ['intent', 'metrics', 'dashboard', 'data-visualization', 'ux'],
  minimumAuditLevel: 'hard',
  diagnosis: 'Isolated metric card displays numbers without decision context.',
  supportedActions: ['explain', 'not_a_problem'],
  structuredRecommendation: {
    summary: 'Pair metric numbers with baseline comparisons or trend indicators.',
    rationale: 'Metrics without context create cognitive hesitation rather than clear decision support.',
    alternatives: [
      {
        id: 'percentage-trend',
        title: 'Percentage Delta / Trend Indicator',
        description: 'Include "+14% from previous 30 days" with positive/negative color coding.',
        whenToUse: 'When historical data is available for comparison.',
        implementationDifficulty: 'easy',
      },
      {
        id: 'target-progress',
        title: 'Target Benchmark or Goal Line',
        description: 'Show current value relative to a threshold or quota (e.g. "82% of monthly target").',
        whenToUse: 'When tracking goal attainment or operational capacity.',
        implementationDifficulty: 'medium',
      },
      {
        id: 'drilldown-link',
        title: 'Contextual Drill-Down Action',
        description: 'Provide a "View detailed report →" link so users can immediately investigate the metric.',
        whenToUse: 'When the metric summarizes a complex underlying dataset.',
        implementationDifficulty: 'easy',
      },
    ],
  },

  detect(context: AnalysisContext): Finding[] {
    const parsed = context.parsedAst as ParsedDocument | undefined;
    if (!parsed || !parsed.sourceFile) return [];

    const intent = inferDesignIntent({
      filePath: context.filePath,
      sourceCode: context.sourceCode,
    });

    if (intent.category !== 'dashboard' && intent.category !== 'data-analysis') {
      return [];
    }

    const findings: Finding[] = [];
    const sourceFile = parsed.sourceFile;

    function checkMetricContainer(container: ts.JsxElement): boolean {
      const tagName = container.openingElement.tagName.getText(sourceFile);
      const isCard = tagName.includes('Card') || tagName.includes('Surface') || tagName.includes('Metric');
      if (!isCard) return false;

      const text = container.getText(sourceFile);

      // Check if container has a big number (e.g. 1,420, $32k, 99.4%)
      const hasBigNumber = /\b(?:\$?\d{1,3}(?:,\d{3})*|\d+)(?:\.\d+)?%?\b/.test(text) &&
        (text.includes('text-2xl') || text.includes('text-3xl') || text.includes('text-4xl') || text.includes('font-bold'));

      if (!hasBigNumber) return true;

      // Check if it already has context indicators (delta, vs, from, %, trend, increase, decrease, target)
      const hasContext =
        /(?:[+-]\s*\$?\d+%\b|\bvs\b|\bfrom\b|\bsince\b|trend|target|increase|decrease|compared to|goal|status)/i.test(text);

      if (!hasContext) {
        const loc = parsed!.getLocation(container.openingElement);
        findings.push({
          ruleId: 'ID-005',
          message: 'Metric card displays isolated number with no comparative baseline or trend context.',
          description:
            'Operational dashboard metrics require baseline context (e.g. "+12% vs last month" or goal threshold) to enable rapid decision-making.',
          severity: 'suggestion',
          confidence: 0.85,
          location: loc,
          findingType: 'suggestion',
          diagnosis: 'Isolated metric card without comparison baseline or trend direction.',
          recommendation:
            'Add delta indicator (e.g. "+8% vs last month") or benchmark target to give the metric decision context.',
          intent,
          supportedActions: ['explain', 'not_a_problem'],
          evidence: [
            astEvidence(
              'Found metric display with numbers but no delta, comparison, or trend markers.',
              loc,
              container.openingElement.getText(sourceFile)
            ),
          ],
        });
      }

      return true;
    }

    function visit(node: ts.Node): void {
      if (ts.isJsxElement(node)) {
        const handled = checkMetricContainer(node);
        if (handled) return; // Do not recurse into inner elements of the card
      }
      ts.forEachChild(node, visit);
    }


    visit(sourceFile);
    return findings;
  },
};
