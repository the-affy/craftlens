import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  astEvidence,
} from '@craftlens/core';
import { ParsedDocument } from '@craftlens/parser';
import { SurfaceHierarchyAnalyzer } from '@craftlens/design-intelligence';

export const CP_008_RULE: CraftLensRule = {
  id: 'CP-008',
  category: 'hierarchy',
  title: 'Card Inside Card Nesting',
  description: 'A Card component is nested inside another Card container, creating visual noise and stacked borders.',
  rationale:
    'Nesting cards inside cards introduces unnecessary surface levels, double borders, and stacked shadows. Modern UI uses dividers, whitespace, or flat rows for inner items.',
  severity: 'warning',
  confidence: 0.95,
  engine: 'ast',
  recommendation: 'Replace inner cards with borderless list items, divider lines, or subtle background tinting.',
  fix: 'assisted',
  platforms: ['react', 'web'],
  tags: ['hierarchy', 'cards', 'surfaces', 'visual-design'],
  minimumAuditLevel: 'moderate',
  diagnosis: 'Nested Card surface detected inside another Card.',
  supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
  structuredRecommendation: {
    summary: 'Flatten nested card surfaces into clean divider-separated rows or lists.',
    rationale: 'Nested cards create visual clutter and increase cognitive load with redundant containers.',
    alternatives: [
      {
        id: 'divided-list',
        title: 'Divided List Rows',
        description: 'Remove the inner <Card> wrapper and separate list items with a simple border-b or divide-y.',
        whenToUse: 'When displaying multiple child items inside a parent card.',
        tradeoffs: ['Simpler layout', 'Less isolated container per item'],
        implementationDifficulty: 'easy',
      },
      {
        id: 'subtle-row-background',
        title: 'Subtle Row Tinting',
        description: 'Use a faint background tint (e.g. bg-muted/50) on hover instead of heavy border boxes.',
        whenToUse: 'For interactive child items inside a parent summary card.',
        tradeoffs: ['Needs accessible contrast in both light and dark mode'],
        implementationDifficulty: 'easy',
      },
    ],
  },

  detect(context: AnalysisContext): Finding[] {
    const parsed = context.parsedAst as ParsedDocument | undefined;
    if (!parsed || !parsed.sourceFile) return [];

    const findings: Finding[] = [];
    const nested = SurfaceHierarchyAnalyzer.findNestedCards(parsed);

    for (const item of nested) {
      findings.push({
        ruleId: 'CP-008',
        message: 'Nested Card surface detected inside an outer Card container.',
        description:
          'Nesting cards inside cards creates double borders and heavy shadows. Prefer dividers or borderless rows.',
        severity: 'warning',
        confidence: 0.95,
        location: item.location,
        findingType: 'problem',
        diagnosis: 'Card container nested inside another Card container.',
        recommendation:
          'Remove inner Card wrapper and use border-b dividers or whitespace to separate inner items.',
        structuredRecommendation: {
          summary: 'Replace nested Card with divider-separated rows.',
          rationale: 'Redundant surface nesting clutters the interface.',
        },
        supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
        evidence: [
          astEvidence(
            'Found <Card> element positioned inside another <Card> hierarchy.',
            item.location
          ),
        ],
      });
    }

    return findings;
  },
};
