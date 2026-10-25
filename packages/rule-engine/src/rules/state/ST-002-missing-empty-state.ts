import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  createLocation,
  regexEvidence,
} from '@craftlens/core';
import { inferDesignIntent } from '@craftlens/design-intelligence';

export const ST_002_RULE: CraftLensRule = {
  id: 'ST-002',
  category: 'ux',
  title: 'Missing Empty State',
  problemTitle: 'Missing empty state for collection',
  description: 'Collection or table is rendered via .map() without an explicit empty state fallback when no items exist.',
  rationale: 'When lists or tables receive zero items, displaying a blank void leaves users guessing whether the app is loading, broken, or empty. An informative empty state explains the absence and guides the next action.',
  whatIsWrong: 'This data collection is mapped directly without an empty state fallback.',
  whyItMatters: 'Zero-data states display as a blank screen or empty table, confusing users about whether data is missing or still loading.',
  howToFix: 'Add a condition checking collection.length === 0 to render a clear empty state message with a prompt or CTA.',
  severity: 'suggestion',
  confidence: 0.85,
  engine: 'ast',
  recommendation: 'Render a clear empty state when the collection is empty.',
  fix: 'manual',
  platforms: ['react', 'web'],
  tags: ['state-coverage', 'empty-state', 'ux'],
  supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],

  detect(context: AnalysisContext): Finding[] {
    const findings: Finding[] = [];
    const source = context.sourceCode;

    // Check for array .map inside JSX without a length check nearby
    const mapRegex = /\{([a-zA-Z0-9_]+)\.map\s*\(/g;
    const lines = source.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let match: RegExpExecArray | null;
      while ((match = mapRegex.exec(line)) !== null) {
        const varName = match[1];
        // Ignore internal short loop indices like [1,2,3].map
        if (varName === 'Array' || varName.length <= 1) continue;

        // Check if the file contains a check for varName.length === 0 or !varName.length
        const hasLengthCheck =
          source.includes(`${varName}.length === 0`) ||
          source.includes(`${varName}.length > 0`) ||
          source.includes(`${varName}?.length === 0`) ||
          source.includes(`!${varName}.length`) ||
          source.includes(`${varName}.length ?`) ||
          source.includes(`EmptyState`) ||
          source.includes(`No ${varName}`);

        if (!hasLengthCheck) {
          const startCol = match.index + 1;
          const location = createLocation(context.filePath, i + 1, startCol, 0, i + 1, startCol + match[0].length, 0);
          findings.push({
            ruleId: 'ST-002',
            problemTitle: 'Missing empty state for collection',
            message: `Collection "${varName}" is mapped without an empty state fallback.`,
            whatIsWrong: `"${varName}" is rendered without handling the empty (0 items) state.`,
            whyItMatters: 'When no items are returned, users see an empty screen or blank box with no guidance on how to populate data.',
            howToFix: `Render an empty state fallback when ${varName}.length === 0.`,
            severity: 'suggestion',
            confidence: 0.85,
            location,
            findingType: 'suggestion',
            evidence: [
              regexEvidence(`Direct .map() rendering without length fallback: "${match[0]}"`, location),
              {
                type: 'rule',
                explanation: `No conditional branch found for empty "${varName}" collection`,
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
