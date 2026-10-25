import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  createLocation,
  regexEvidence,
} from '@craftlens/core';

export const UI_010_EMOJI_RULE: CraftLensRule = {
  id: 'UI-010',
  category: 'visual',
  title: 'Emoji / Icon Decoration Spam',
  problemTitle: 'Emoji decoration as list bullets',
  description: 'Casual emojis (🚀, 🔥, ⚡, 💡, ✨, 🎉) used repeatedly as bullet points or card header icons without conveying professional product meaning.',
  rationale: 'Generic AI-generated landing pages and cards heavily rely on emoji triplets (🚀 Fast, 🔒 Secure, 💡 Smart) to compensate for lack of genuine iconography. In serious production software, they signal amateur or demo quality.',
  whatIsWrong: 'Emojis are used as cosmetic list bullets or feature icon substitutes.',
  whyItMatters: 'Emojis render inconsistently across operating systems and platforms, undermine professional credibility, and add visual clutter.',
  howToFix: 'Replace emoji decorations with purposeful SVG icons from the project icon set (e.g. Lucide) or clean typographic hierarchy.',
  severity: 'suggestion',
  confidence: 0.9,
  engine: 'regex',
  recommendation: 'Replace generic emoji bullets with a consistent SVG icon system.',
  fix: 'manual',
  platforms: ['react', 'web'],
  tags: ['visual-slop', 'emoji', 'copy', 'ui'],
  supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],

  detect(context: AnalysisContext): Finding[] {
    const findings: Finding[] = [];
    const emojiRegex = /(?:🚀|🔥|⚡|💡|✨|🎉|💪|🌟|📈|🤖|🛠️|📦)\s*([A-Za-z0-9])/g;

    const lines = context.sourceCode.split('\n');
    let count = 0;
    let firstLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comments
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

      let match: RegExpExecArray | null;
      while ((match = emojiRegex.exec(line)) !== null) {
        count++;
        if (firstLine === 0) firstLine = i + 1;
      }
    }

    if (count >= 3) {
      const location = createLocation(context.filePath, firstLine, 1, 0, firstLine, 1, 0);
      findings.push({
        ruleId: 'UI-010',
        problemTitle: 'Emoji decoration as bullet icons',
        message: `${count} generic emoji decorations used as bullet points or header prefixes.`,
        whatIsWrong: 'Repetitive emojis (e.g. 🚀, ⚡, 💡) are used as decorative bullet points or card headers.',
        whyItMatters: 'Signals template boilerplate, degrades accessibility for screen readers (which read emoji names aloud), and renders unpredictably across OS platforms.',
        howToFix: 'Use curated SVG icons from the project icon set (such as lucide-react) or rely on strong typographic styling.',
        severity: 'warning',
        confidence: 0.9,
        location,
        findingType: 'problem',
        evidence: [
          regexEvidence(`Detected ${count} decorative emoji bullets in component`, location),
          {
            type: 'rule',
            explanation: '>= 3 casual emojis used as UI decoration',
          },
        ],
        supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
      });
    }

    return findings;
  },
};
