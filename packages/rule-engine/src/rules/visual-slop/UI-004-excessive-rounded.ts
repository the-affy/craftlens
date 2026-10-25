import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  createLocation,
  regexEvidence,
} from '@craftlens/core';
import { inferDesignIntent } from '@craftlens/design-intelligence';

export const UI_004_RULE: CraftLensRule = {
  id: 'UI-004',
  category: 'visual',
  title: 'Excessive Rounded Containers',
  problemTitle: 'Excessive rounded corners on dense container',
  description: 'Very large border radius (e.g. rounded-3xl / 24px+) applied to dense content containers or dashboard panels, consuming valuable inner padding and clipping child content.',
  rationale: 'Overly rounded containers (>= 24px) force excessive inner padding to avoid content colliding with curved corners. In operational dashboards or data-heavy views, this wastes screen real estate.',
  whatIsWrong: 'A 24px+ border radius is used on a dense data or content container.',
  whyItMatters: 'Deeply rounded corners distort visual alignment, eat into usable inner width, and create awkward dead space in container corners.',
  howToFix: 'Reduce container corner radius to standard scale (e.g. rounded-lg [8px] or rounded-xl [12px]) to maximize legible area and align with grid boundaries.',
  severity: 'warning',
  confidence: 0.84,
  engine: 'css',
  recommendation: 'Use restrained border radius (8–12px) for structured information containers.',
  fix: 'manual',
  platforms: ['react', 'web'],
  tags: ['visual-slop', 'radius', 'layout', 'ui'],
  supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],

  detect(context: AnalysisContext): Finding[] {
    const findings: Finding[] = [];
    const intent = inferDesignIntent({ filePath: context.filePath, sourceCode: context.sourceCode });

    // Allow large radius on mobile avatars or circular pill buttons
    const roundedRegex = /\b(rounded-(?:3xl|\[(?:2[4-9]|[3-9]\d)px\]))\b/g;

    const lines = context.sourceCode.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      // Skip avatars, badges, or pills
      if (lineText.includes('avatar') || lineText.includes('rounded-full') || lineText.includes('Avatar')) {
        continue;
      }

      let match: RegExpExecArray | null;
      while ((match = roundedRegex.exec(lineText)) !== null) {
        const startCol = match.index + 1;
        const endCol = startCol + match[0].length;
        const location = createLocation(context.filePath, i + 1, startCol, 0, i + 1, endCol, 0);

        const matchedText = match[0];
        const replacement = 'rounded-xl';

        findings.push({
          ruleId: 'UI-004',
          problemTitle: 'Excessive rounded corners on container',
          message: 'Large corner radius (rounded-3xl / 24px+) used on container.',
          whatIsWrong: 'Excessively rounded corners on this container consume interior space and distort layout alignment.',
          whyItMatters: 'Forces awkward padding compensations and clashes with the rectangular rhythm of data grids and typography.',
          howToFix: 'Adopt a consistent, restrained radius (such as rounded-lg or rounded-xl) that matches the project baseline.',
          severity: 'warning',
          confidence: 0.84,
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
            id: `fix-ui-004-${i}-${startCol}`,
            title: `Replace "${matchedText}" with "${replacement}"`,
            description: `Replace excessive ${matchedText} with balanced rounded-xl (12px) to restore layout alignment and padding.`,
            changes: [
              {
                range: location,
                after: replacement,
                before: matchedText,
                explanation: 'Adopt standard container radius',
              },
            ],
            safety: 'safe',
            isPreferred: true,
          },
          evidence: [
            regexEvidence(`Excessive radius class: "${matchedText}"`, location),
            {
              type: 'rule',
              explanation: 'Container radius >= 24px in structured content view',
            },
          ],
          supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
        });
      }
    }

    return findings;
  },
};
