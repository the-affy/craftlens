import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  astEvidence,
} from '@craftlens/core';
import { ParsedDocument } from '@craftlens/parser';
import { SurfaceHierarchyAnalyzer, UIAnalyzer } from '@craftlens/design-intelligence';

export const CP_007_RULE: CraftLensRule = {
  id: 'CP-007',
  category: 'hierarchy',
  title: 'Excessive Card Usage',
  description: 'Your dashboard has too many visually equal cards.',
  rationale: 'Everything has the same visual weight, making it difficult to understand what matters first.',
  problemTitle: 'Card-heavy layout',
  whatIsWrong: 'Your dashboard has too many visually equal cards.',
  whyItMatters: 'Everything has the same visual weight, making it difficult to understand what matters first.',
  howToFix: 'Keep primary metrics prominent and convert secondary information into a compact list.',
  severity: 'warning',
  confidence: 0.9,
  engine: 'ast',
  recommendation: 'Keep primary items visually prominent and convert secondary items into a compact list or grouped sections.',
  fix: 'manual',
  platforms: ['react', 'web'],
  tags: ['hierarchy', 'cards', 'visual-design', 'layout', 'ui'],
  minimumAuditLevel: 'moderate',
  diagnosis: 'Visually identical cards flatten information hierarchy.',
  supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
  structuredRecommendation: {
    summary: 'Differentiate information hierarchy by replacing repetitive cards with a compact list or featured items.',
    rationale: 'The repeated containers flatten visual hierarchy and make every item appear equally important.',
    alternatives: SurfaceHierarchyAnalyzer.getExcessiveCardAlternatives(),
  },

  detect(context: AnalysisContext): Finding[] {
    // 1. Try unified UI analyzer (supports both HTML & JSX/TSX)
    try {
      const report = UIAnalyzer.analyze(context.filePath, context.sourceCode);
      const uiFindings = report.composition.findings.filter(f => f.ruleId === 'CP-007');
      if (uiFindings.length > 0) {
        return uiFindings;
      }
    } catch {
      // Fallback to AST below
    }

    const parsed = context.parsedAst as ParsedDocument | undefined;
    if (!parsed || !parsed.sourceFile) return [];

    const findings: Finding[] = [];
    const results = SurfaceHierarchyAnalyzer.findExcessiveCards(parsed, 4);

    for (const res of results) {
      const alternatives = SurfaceHierarchyAnalyzer.getExcessiveCardAlternatives();
      findings.push({
        ruleId: 'CP-007',
        problemTitle: 'Card-heavy layout',
        message: `${res.cardCount} visually identical cards are being used for content in a single view.`,
        whatIsWrong: 'Most of the dashboard is divided into visually identical rounded cards.',
        whyItMatters: 'Everything has the same visual weight, so users cannot quickly distinguish primary information from supporting detail.',
        howToFix: 'Keep primary metrics prominent and convert secondary information into a compact list.',
        description:
          'Repeated container surfaces create visual uniformity without communicating which information matters most.',
        severity: 'warning',
        confidence: 0.9,
        location: res.location,
        findingType: 'problem',
        diagnosis: `${res.cardCount} visually identical cards are being used for content with different levels of importance.`,
        recommendation:
          'Keep primary items visually prominent, convert secondary items into a compact list, and use typography/spacing rather than box containers.',
        structuredRecommendation: {
          summary: 'Keep 1–2 primary items visually prominent and convert secondary items into a compact list.',
          rationale: 'Repeated containers flatten the visual hierarchy and make every item appear equally important.',
          alternatives,
        },
        alternatives,
        supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
        evidence: [
          astEvidence(
            `Detected container holding ${res.cardCount} identical card surfaces.`,
            res.location
          ),
          {
            type: 'rule',
            explanation: `${res.cardCount} card containers share identical visual treatment without grouping`,
          },
        ],
      });
    }

    return findings;
  },

};
