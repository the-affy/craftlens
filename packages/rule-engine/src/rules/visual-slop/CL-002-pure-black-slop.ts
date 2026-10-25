import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  createLocation,
  regexEvidence,
} from '@craftlens/core';

export const CL_002_RULE: CraftLensRule = {
  id: 'CL-002',
  category: 'visual',
  title: 'Harsh Pure Black Slop',
  problemTitle: 'Harsh pure black (#000000) causes visual vibration',
  description: 'Uncalibrated pure black (#000000 or text-black) text applied against pure white surfaces, causing stark visual contrast vibration and eye fatigue.',
  rationale: 'Human eyes perceive 100% pure black text on 100% pure white as harsh and vibrating (halation effect), especially on OLED and high-DPI screens. Professional product design uses soft dark neutrals (such as slate-900 #0f172a or zinc-900) for a comfortable, refined reading experience.',
  whatIsWrong: 'Pure black (#000000 or text-black) text is used directly on a light surface.',
  whyItMatters: 'Causes visual halation and eye fatigue, signaling unstyled default HTML or template AI output.',
  howToFix: 'Replace pure black text with calibrated dark neutral "text-slate-900 dark:text-slate-100" or "#0f172a".',
  severity: 'warning',
  confidence: 0.88,
  engine: 'css',
  recommendation: 'Use refined dark neutrals instead of pure #000000 text.',
  fix: 'safe',
  platforms: ['react', 'web'],
  tags: ['ui-slop', 'color', 'typography', 'visual'],
  minimumAuditLevel: 'moderate',
  suggestedSteps: [
    'Replace "text-black" with "text-slate-900 dark:text-slate-100".',
  ],
  structuredRecommendation: {
    summary: 'Replace harsh pure black text with calibrated dark neutral.',
    why: '100% black on white creates optical vibration and unpolished aesthetic.',
    howToFix: 'Adopt text-slate-900 dark:text-slate-100 for primary typography.',
    steps: ['Change text-black to text-slate-900 dark:text-slate-100.'],
    fix: {
      type: 'safe',
      description: 'Upgrade pure black to refined slate-900',
    },
  },
  supportedActions: ['fix', 'preview', 'explain', 'not_a_problem'],

  detect(context: AnalysisContext): Finding[] {
    const findings: Finding[] = [];
    const pureBlackRegex = /\b(text-black|color:\s*['"]?#(?:000|000000)['"]?)\b/g;

    const lines = context.sourceCode.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      let match: RegExpExecArray | null;
      while ((match = pureBlackRegex.exec(lineText)) !== null) {
        const startCol = match.index + 1;
        const endCol = startCol + match[0].length;
        const location = createLocation(context.filePath, i + 1, startCol, 0, i + 1, endCol, 0);

        const matchedText = match[0];
        const replacement = matchedText.startsWith('color:') ? "color: '#0f172a'" : 'text-slate-900 dark:text-slate-100';

        findings.push({
          ruleId: 'CL-002',
          problemTitle: 'Harsh pure black causes visual vibration',
          message: `Text uses harsh pure black "${matchedText}" instead of refined dark neutral.`,
          whatIsWrong: 'Pure black (#000000) causes optical vibration and harsh contrast against light backgrounds.',
          whyItMatters: 'Causes visual fatigue on modern displays and signals raw unstyled template styling.',
          howToFix: `Replace "${matchedText}" with "${replacement}".`,
          severity: 'warning',
          confidence: 0.88,
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
            id: `fix-cl-002-${i}-${startCol}`,
            title: `Replace "${matchedText}" with refined neutral`,
            description: `Change "${matchedText}" to "${replacement}" for balanced readability and eye comfort.`,
            changes: [
              {
                range: location,
                after: replacement,
                before: matchedText,
                explanation: 'Calibrate contrast with refined slate neutral',
              },
            ],
            safety: 'safe',
            isPreferred: true,
          },
          evidence: [
            regexEvidence(`Pure black token: "${matchedText}"`, location),
            {
              type: 'rule',
              explanation: 'Uncalibrated pure black text on content',
            },
          ],
          supportedActions: ['fix', 'preview', 'explain', 'not_a_problem'],
        });
      }
    }

    return findings;
  },
};
