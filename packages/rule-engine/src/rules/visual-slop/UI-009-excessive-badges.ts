import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  createLocation,
  regexEvidence,
} from '@craftlens/core';
import { inferDesignIntent } from '@craftlens/design-intelligence';

export const UI_009_BADGES_RULE: CraftLensRule = {
  id: 'UI-009B',
  category: 'visual',
  title: 'Excessive Badges / Status Pills',
  problemTitle: 'Excessive badges and pills',
  description: 'A single component or card contains multiple brightly-colored badges/pills, creating colorful noise and diluting meaningful status signals.',
  rationale: 'Badges should be reserved for high-signal status changes (e.g. Active, Pending, Failed). When multiple badges are stacked on every item, their signaling value collapses into visual noise.',
  whatIsWrong: 'Four or more badges/pills are clustered within a single component.',
  whyItMatters: 'Color-coded badges lose their communicative power when overused, confusing the user about which state actually requires attention.',
  howToFix: 'Consolidate multiple badges into plain metadata text with muted styling, keeping at most one prominent status badge.',
  severity: 'warning',
  confidence: 0.86,
  engine: 'ast',
  recommendation: 'Limit to 1 prominent status badge per card/row; render supporting attributes as clean metadata text.',
  fix: 'manual',
  platforms: ['react', 'web'],
  tags: ['visual-slop', 'badges', 'hierarchy', 'ui'],
  supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],

  detect(context: AnalysisContext): Finding[] {
    const findings: Finding[] = [];
    const intent = inferDesignIntent({ filePath: context.filePath, sourceCode: context.sourceCode });
    // In monitoring dashboards, multiple status chips in a data table may be acceptable
    if (intent.category === 'monitoring') {
      return [];
    }

    // Match clusters of Badge or rounded-full status pills
    const badgeRegex = /<(?:Badge|Tag|Chip|StatusPill)\b|class(?:Name)?=["'][^"']*(?:rounded-full|badge|pill)[^"']*/g;
    const lines = context.sourceCode.split('\n');

    let badgeCount = 0;
    let firstLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matches = line.match(badgeRegex);
      if (matches) {
        badgeCount += matches.length;
        if (firstLine === 0) firstLine = i + 1;
      }
    }

    if (badgeCount >= 5) {
      const location = createLocation(context.filePath, firstLine, 1, 0, firstLine, 1, 0);
      findings.push({
        ruleId: 'UI-009',
        problemTitle: 'Excessive badges and status pills',
        message: `${badgeCount} decorative status badges/pills detected in component.`,
        whatIsWrong: `${badgeCount} color-coded badges/pills are used in a single view, creating visual noise.`,
        whyItMatters: 'When everything is badged, nothing stands out. Users cannot distinguish critical status from routine metadata.',
        howToFix: 'Reserve colored badges for primary status (e.g. Active/Inactive) and format secondary tags as neutral muted text.',
        severity: 'warning',
        confidence: 0.86,
        location,
        findingType: 'problem',
        evidence: [
          regexEvidence(`Found ${badgeCount} badge/chip elements in component`, location),
          {
            type: 'rule',
            explanation: 'Density of status pills exceeds recommended limit (>= 5)',
          },
        ],
        supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
      });
    }

    return findings;
  },
};
