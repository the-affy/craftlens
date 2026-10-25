import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  createLocation,
  regexEvidence,
} from '@craftlens/core';

export const LY_001_RULE: CraftLensRule = {
  id: 'LY-001',
  category: 'visual',
  title: 'Blindly Centered Layout Slop',
  problemTitle: 'Over-centered content impairs reading & form scanning',
  description: 'Container applies "text-center items-center justify-center" to multi-line copy, forms, or data views, impairing reading flow and natural eye tracking.',
  rationale: 'AI prototypes habitually center everything: headers, paragraphs, inputs, and feature lists. While centering is fine for a 2-line hero title, centering body paragraphs, forms, or card lists destroys the left alignment anchor that human eyes rely on to scan quickly, making the interface feel amateurish and hard to use.',
  whatIsWrong: 'Multi-line copy or form content is force-centered, destroying the natural left reading anchor.',
  whyItMatters: 'Ragged left edges on centered paragraphs increase cognitive effort and reading fatigue by 20–30%. Forms with centered labels and inputs create disjointed visual tracking.',
  howToFix: 'Align content to the left: change "text-center items-center" to "text-left items-start" for natural scanning.',
  severity: 'warning',
  confidence: 0.86,
  engine: 'css',
  recommendation: 'Anchor body copy, forms, and feature lists with left alignment.',
  fix: 'safe',
  platforms: ['react', 'web'],
  tags: ['ui-slop', 'layout', 'alignment', 'typography'],
  minimumAuditLevel: 'moderate',
  suggestedSteps: [
    'Change "text-center items-center" to "text-left items-start".',
  ],
  structuredRecommendation: {
    summary: 'Replace forced center alignment with clean left-aligned typography.',
    why: 'Centered multi-line content impairs vertical scanning and creates jagged reading rhythm.',
    howToFix: 'Use text-left items-start on body containers.',
    steps: ['Change text-center to text-left.'],
    fix: {
      type: 'safe',
      description: 'Restore natural left-aligned reading flow',
    },
  },
  supportedActions: ['fix', 'preview', 'explain', 'not_a_problem'],

  detect(context: AnalysisContext): Finding[] {
    const findings: Finding[] = [];
    const centeredRegex = /\b(flex\s+flex-col\s+items-center\s+(?:justify-center\s+)?text-center|items-center\s+text-center)\b/g;

    const lines = context.sourceCode.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      // Skip pure landing hero banners or badge chips
      const lower = lineText.toLowerCase();
      if (lower.includes('badge') || lower.includes('avatar') || lower.includes('hero-title')) {
        continue;
      }

      let match: RegExpExecArray | null;
      while ((match = centeredRegex.exec(lineText)) !== null) {
        const startCol = match.index + 1;
        const endCol = startCol + match[0].length;
        const location = createLocation(context.filePath, i + 1, startCol, 0, i + 1, endCol, 0);

        const matchedText = match[0];
        const replacement = matchedText.includes('flex flex-col')
          ? 'flex flex-col items-start text-left'
          : 'items-start text-left';

        findings.push({
          ruleId: 'LY-001',
          problemTitle: 'Over-centered content impairs reading & scanning',
          message: `Container applies blanket center alignment "${matchedText}", hurting readability.`,
          whatIsWrong: 'Body copy, forms, or card content is center-aligned, disrupting the eye\'s natural left margin tracking.',
          whyItMatters: 'Forces reader to search for the start of every line, significantly slowing comprehension.',
          howToFix: `Replace "${matchedText}" with "${replacement}".`,
          severity: 'warning',
          confidence: 0.86,
          location,
          findingType: 'problem',
          fix: {
            title: `Replace "${matchedText}" with "${replacement}"`,
            kind: 'safe',
            isPreferred: true,
            changes: [
              {
                range: location,
                newText: replacement,
                before: matchedText,
              },
            ],
          },
          designFix: {
            id: `fix-ly-001-${i}-${startCol}`,
            title: `Align content to the left`,
            description: `Change "${matchedText}" to "${replacement}" to anchor content for effortless scanning.`,
            changes: [
              {
                range: location,
                after: replacement,
                before: matchedText,
                explanation: 'Left-aligned content structure',
              },
            ],
            safety: 'safe',
            isPreferred: true,
          },
          evidence: [
            regexEvidence(`Center layout combination: "${matchedText}"`, location),
            {
              type: 'rule',
              explanation: 'Over-centered flex layout on content',
            },
          ],
          supportedActions: ['fix', 'preview', 'explain', 'not_a_problem'],
        });
      }
    }

    return findings;
  },
};
