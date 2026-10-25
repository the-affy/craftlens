import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  createLocation,
  regexEvidence,
} from '@craftlens/core';

export const LY_002_RULE: CraftLensRule = {
  id: 'LY-002',
  category: 'visual',
  title: 'Non-Responsive Multi-Column Grid Slop',
  problemTitle: 'Multi-column grid crushes cards on mobile viewports',
  description: 'Grid layout specifies 3 or more columns without mobile-first responsive breakpoints (e.g. grid-cols-3 without grid-cols-1 sm:/md:), breaking mobile screens.',
  rationale: 'AI generators routinely output desktop-only layouts like "grid grid-cols-3 gap-6". On mobile screens (under 640px), squeezing 3 or 4 columns into 360px viewport width crushes cards down to 100px wide, clipping text, breaking buttons, and forcing unreadable wrapping.',
  whatIsWrong: 'A 3+ column grid is applied directly without a mobile-first single-column fallback.',
  whyItMatters: 'Completely breaks layout on mobile devices and narrow browser panes, causing horizontal overflows and unreadable squished cards.',
  howToFix: 'Use mobile-first responsive grid utilities: e.g. "grid-cols-1 md:grid-cols-3" or "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4".',
  severity: 'warning',
  confidence: 0.9,
  engine: 'css',
  recommendation: 'Always start with grid-cols-1 on mobile and scale up via md: or lg: breakpoints.',
  fix: 'safe',
  platforms: ['react', 'web'],
  tags: ['ui-slop', 'layout', 'responsive', 'mobile', 'grid'],
  minimumAuditLevel: 'easy',
  suggestedSteps: [
    'Change "grid-cols-3" to "grid-cols-1 md:grid-cols-3".',
    'Change "grid-cols-4" to "grid-cols-1 md:grid-cols-2 lg:grid-cols-4".',
  ],
  structuredRecommendation: {
    summary: 'Make grid layout responsive with mobile-first column classes.',
    why: 'Fixed multi-column grids crush cards and cause unusable mobile experiences.',
    howToFix: 'Start with 1 column on mobile and scale up using breakpoint modifiers.',
    steps: ['Replace grid-cols-N with grid-cols-1 md:grid-cols-N.'],
    fix: {
      type: 'safe',
      description: 'Make grid layout responsive across screen sizes',
    },
  },
  supportedActions: ['fix', 'preview', 'explain', 'not_a_problem'],

  detect(context: AnalysisContext): Finding[] {
    const findings: Finding[] = [];
    const gridRegex = /\b(grid-cols-([3-6]))\b/g;

    const lines = context.sourceCode.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      // If line already has responsive prefix like md:grid-cols or sm:grid-cols, or grid-cols-1, skip
      if (lineText.includes('grid-cols-1') || lineText.includes('sm:grid-cols') || lineText.includes('md:grid-cols')) {
        continue;
      }

      let match: RegExpExecArray | null;
      while ((match = gridRegex.exec(lineText)) !== null) {
        // Skip if matched occurrence itself is prefixed with breakpoint (e.g. lg:grid-cols-3)
        const prefixIndex = match.index;
        if (prefixIndex >= 3 && lineText.substring(prefixIndex - 3, prefixIndex).includes(':')) {
          continue;
        }

        const startCol = match.index + 1;
        const endCol = startCol + match[0].length;
        const location = createLocation(context.filePath, i + 1, startCol, 0, i + 1, endCol, 0);

        const matchedText = match[0];
        const cols = match[2];
        const replacement = cols === '3'
          ? 'grid-cols-1 md:grid-cols-3'
          : cols === '4'
          ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'
          : `grid-cols-1 md:grid-cols-${cols}`;

        findings.push({
          ruleId: 'LY-002',
          problemTitle: 'Multi-column grid crushes cards on mobile viewports',
          message: `Grid layout specifies static "${matchedText}" without mobile responsive breakpoints.`,
          whatIsWrong: `Layout forces ${cols} columns on all screens, severely squeezing content on mobile displays.`,
          whyItMatters: 'Cards become unreadable and buttons overflow on mobile viewports under 640px.',
          howToFix: `Replace "${matchedText}" with "${replacement}".`,
          severity: 'warning',
          confidence: 0.9,
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
            id: `fix-ly-002-${i}-${startCol}`,
            title: `Make grid responsive`,
            description: `Change "${matchedText}" to "${replacement}" for 1 column on mobile and ${cols} columns on desktop.`,
            changes: [
              {
                range: location,
                after: replacement,
                before: matchedText,
                explanation: 'Mobile-first responsive grid composition',
              },
            ],
            safety: 'safe',
            isPreferred: true,
          },
          evidence: [
            regexEvidence(`Rigid grid column token: "${matchedText}"`, location),
            {
              type: 'rule',
              explanation: 'Multi-column grid without responsive breakpoint fallbacks',
            },
          ],
          supportedActions: ['fix', 'preview', 'explain', 'not_a_problem'],
        });
      }
    }

    return findings;
  },
};
