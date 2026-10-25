import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  createLocation,
  regexEvidence,
} from '@craftlens/core';

export const UI_002_RULE: CraftLensRule = {
  id: 'UI-002',
  category: 'visual',
  title: 'Decorative Glow Without Purpose',
  problemTitle: 'Decorative glow without purpose',
  description: 'Colored blurred glow aura (e.g. blur-xl / blur-2xl) placed behind containers as cosmetic filler without communicating active status or interactivity.',
  rationale: 'Diffused decorative glow blobs are often generated as ambient filling in AI prototypes. In production applications, they cause visual noise, blur rendering artifacts, and dilute true focus rings.',
  whatIsWrong: 'A colored ambient glow is placed behind this element purely for decorative styling.',
  whyItMatters: 'Decorative glow creates visual clutter and competes with semantic focus-visible states and active indicators.',
  howToFix: 'Remove the absolute-positioned blurred aura and rely on subtle border contrast or clean surface layering.',
  severity: 'warning',
  confidence: 0.85,
  engine: 'css',
  recommendation: 'Remove cosmetic glow layers and preserve glow only for purposeful status/focus states.',
  fix: 'manual',
  platforms: ['react', 'web'],
  tags: ['visual-slop', 'glow', 'ui'],
  supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],

  detect(context: AnalysisContext): Finding[] {
    const findings: Finding[] = [];
    const glowRegex = /\b(blur-[1-3]?[xX]l|shadow-\[0_0_\d+px|filter:\s*drop-shadow\([^)]*#|box-shadow:\s*0\s+0\s+\d+px)/gi;

    const lines = context.sourceCode.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      let match: RegExpExecArray | null;
      while ((match = glowRegex.exec(lineText)) !== null) {
        const startCol = match.index + 1;
        const endCol = startCol + match[0].length;
        const location = createLocation(context.filePath, i + 1, startCol, 0, i + 1, endCol, 0);

        findings.push({
          ruleId: 'UI-002',
          problemTitle: 'Decorative glow without purpose',
          message: 'Decorative colored blur glow used behind container surface.',
          whatIsWrong: 'Colored glow element is used as cosmetic decoration without communicating status or function.',
          whyItMatters: 'Unnecessary glow creates visual haze, impairs readability, and degrades rendering performance on lower-tier devices.',
          howToFix: 'Remove decorative blur layer and use clean surface borders or subtle elevation.',
          severity: 'warning',
          confidence: 0.85,
          location,
          findingType: 'problem',
          evidence: [
            regexEvidence(`Decorative glow match: "${match[0]}"`, location),
            {
              type: 'rule',
              explanation: 'Ambient blur filter layer without semantic role',
            },
          ],
          supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
        });
      }
    }

    return findings;
  },
};
