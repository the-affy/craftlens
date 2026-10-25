import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  createLocation,
  regexEvidence,
} from '@craftlens/core';

export const CP_006_RULE: CraftLensRule = {
  id: 'CP-006',
  category: 'copy',
  title: 'AI Cliché / Boilerplate Fluff',
  problemTitle: 'Generic AI copy cliché',
  description: 'Marketing or interface copy relies on tired AI-generated boilerplate buzzwords ("Seamlessly", "Revolutionize", "Delve", "Supercharge", "Next-gen").',
  rationale: 'Generic buzzwords add zero factual substance about the actual capability of the software. Clear, concrete product language outperforms inflated clichés.',
  whatIsWrong: 'Copy relies on AI buzzwords rather than describing the real feature value.',
  whyItMatters: 'Signals superficial template copywriting, turns off discerning users, and obscures the real capability of the tool.',
  howToFix: 'State the concrete benefit or workflow directly without hyperbolic adjectives.',
  severity: 'suggestion',
  confidence: 0.88,
  engine: 'regex',
  recommendation: 'Replace generic buzzwords with plain, precise product descriptions.',
  fix: 'manual',
  platforms: ['react', 'web'],
  tags: ['copy', 'cliche', 'clarity'],
  supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],

  detect(context: AnalysisContext): Finding[] {
    const findings: Finding[] = [];
    const clicheRegex = /\b(seamlessly\s+(?:integrate|elevate|supercharge|streamline)|revolutionize\s+your|delve\s+into|supercharge\s+your\s+workflow|next-gen(?:eration)?\s+AI-powered)\b/gi;

    const lines = context.sourceCode.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      // Skip comments
      if (lineText.trim().startsWith('//') || lineText.trim().startsWith('*')) continue;

      let match: RegExpExecArray | null;
      while ((match = clicheRegex.exec(lineText)) !== null) {
        const startCol = match.index + 1;
        const location = createLocation(context.filePath, i + 1, startCol, 0, i + 1, startCol + match[0].length, 0);

        findings.push({
          ruleId: 'CP-006',
          problemTitle: 'Generic AI copy cliché',
          message: `AI copywriting cliché detected: "${match[0]}".`,
          whatIsWrong: `Phrasing "${match[0]}" is an overused template marketing cliché.`,
          whyItMatters: 'Hollow buzzwords reduce credibility and fail to explain the real technical or business value to users.',
          howToFix: 'Rewrite in concrete, straightforward language explaining what the product actually does.',
          severity: 'suggestion',
          confidence: 0.88,
          location,
          findingType: 'suggestion',
          evidence: [
            regexEvidence(`Template copy match: "${match[0]}"`, location),
            {
              type: 'rule',
              explanation: 'Overused synthetic marketing buzzword',
            },
          ],
          supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
        });
      }
    }

    return findings;
  },
};
