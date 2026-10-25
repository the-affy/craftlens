import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  createLocation,
  regexEvidence,
} from '@craftlens/core';

export const TY_001_RULE: CraftLensRule = {
  id: 'TY-001',
  category: 'visual',
  title: 'Arbitrary Font Size',
  problemTitle: 'Arbitrary font size outside typographic scale',
  description: 'Ad-hoc pixel font size (e.g. text-[13px], text-[15px], text-[17px]) introduced outside standard typographic scale tokens.',
  rationale: 'Harmonious interfaces adhere to a defined type scale (e.g. 12, 14, 16, 18, 20, 24, 30, 36). Arbitrary in-between sizes create visual inconsistency and font rendering fuzziness.',
  whatIsWrong: 'An arbitrary pixel font size is used instead of a design token.',
  whyItMatters: 'Breaks typographic rhythm and causes uneven visual hierarchy across screens.',
  howToFix: 'Replace arbitrary size with standard scale tokens (e.g. text-xs [12px], text-sm [14px], text-base [16px]).',
  severity: 'suggestion',
  confidence: 0.88,
  engine: 'css',
  recommendation: 'Use standard typographic scale tokens (text-xs, text-sm, text-base, text-lg).',
  fix: 'manual',
  platforms: ['react', 'web'],
  tags: ['typography', 'scale', 'ui'],
  supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],

  detect(context: AnalysisContext): Finding[] {
    const findings: Finding[] = [];
    const fontRegex = /\b(text-\[(\d+)px\]|font-size:\s*(\d+)px)\b/g;
    const standardSizes = new Set([10, 12, 14, 16, 18, 20, 24, 30, 32, 36, 48, 64]);

    const lines = context.sourceCode.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      let match: RegExpExecArray | null;
      while ((match = fontRegex.exec(lineText)) !== null) {
        const size = parseInt(match[2] || match[3], 10);
        if (!standardSizes.has(size)) {
          const startCol = match.index + 1;
          const endCol = startCol + match[0].length;
          const location = createLocation(context.filePath, i + 1, startCol, 0, i + 1, endCol, 0);

          const matchedText = match[0];
          const isInline = matchedText.startsWith('font-size:');
          let replacement = 'text-base';
          let nearestPx = 16;
          if (size <= 12) { replacement = 'text-xs'; nearestPx = 12; }
          else if (size <= 14) { replacement = 'text-sm'; nearestPx = 14; }
          else if (size <= 17) { replacement = 'text-base'; nearestPx = 16; }
          else if (size <= 20) { replacement = 'text-lg'; nearestPx = 18; }
          else if (size <= 24) { replacement = 'text-xl'; nearestPx = 20; }
          else if (size <= 30) { replacement = 'text-2xl'; nearestPx = 24; }
          else { replacement = 'text-3xl'; nearestPx = 30; }

          const finalReplacement = isInline ? `font-size: ${nearestPx}px` : replacement;

          findings.push({
            ruleId: 'TY-001',
            problemTitle: 'Arbitrary font size outside scale',
            message: `Arbitrary font size (${size}px) breaks typographic scale.`,
            whatIsWrong: `Arbitrary font size ${size}px is not part of the project type scale.`,
            whyItMatters: 'Ad-hoc type sizes erode typographic hierarchy and produce uneven line heights.',
            howToFix: `Use standard scale: ${replacement} (${nearestPx}px).`,
            severity: 'suggestion',
            confidence: 0.88,
            location,
            findingType: 'suggestion',
            fix: {
              title: `Snap to standard scale "${finalReplacement}"`,
              kind: 'safe',
              isPreferred: true,
              changes: [
                {
                  range: location,
                  newText: finalReplacement,
                  before: matchedText,
                },
              ],
            },
            designFix: {
              id: `fix-ty-001-${i}-${startCol}`,
              title: `Snap to standard scale "${finalReplacement}"`,
              description: `Align arbitrary ${size}px to standard scale token "${finalReplacement}".`,
              changes: [
                {
                  range: location,
                  after: finalReplacement,
                  before: matchedText,
                  explanation: 'Align with standard typographic scale',
                },
              ],
              safety: 'safe',
              isPreferred: true,
            },
            evidence: [
              regexEvidence(`Arbitrary type size: "${matchedText}"`, location),
              {
                type: 'rule',
                explanation: `${size}px is not on standard type scale`,
              },
            ],
            supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
          });
        }
      }
    }

    return findings;
  },
};
