import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  createLocation,
  regexEvidence,
} from '@craftlens/core';

export const UI_003_RULE: CraftLensRule = {
  id: 'UI-003',
  category: 'visual',
  title: 'Glassmorphism Without Purpose',
  problemTitle: 'Glassmorphism without functional purpose',
  description: 'Backdrop blur / translucent glass styling applied to static in-flow cards where no underlying content needs to be partially visible.',
  rationale: 'Glassmorphism (backdrop-filter) has high GPU compositor overhead and is only appropriate for floating sticky headers or modals over complex content. On routine cards, it degrades scroll FPS and reduces text contrast.',
  whatIsWrong: 'Backdrop blur and translucent surface are used on a standard in-flow container.',
  whyItMatters: 'Triggers expensive GPU redraws during scrolling and causes unpredictable text contrast variations depending on content behind it.',
  howToFix: 'Replace backdrop-blur and transparent surface with an opaque background color from the design system.',
  severity: 'warning',
  confidence: 0.86,
  engine: 'css',
  recommendation: 'Use solid opaque surface background instead of translucent glassmorphism.',
  fix: 'manual',
  platforms: ['react', 'web'],
  tags: ['visual-slop', 'glassmorphism', 'ui', 'performance'],
  supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],

  detect(context: AnalysisContext): Finding[] {
    const findings: Finding[] = [];
    const glassRegex = /\b(backdrop-blur-(?:sm|md|lg|xl|2xl|3xl)|backdrop-filter:\s*blur)/gi;

    const lines = context.sourceCode.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      // Skip if this is a header, navbar, modal, dialog, or drawer where backdrop blur is purposeful
      const lower = lineText.toLowerCase();
      if (
        lower.includes('header') ||
        lower.includes('nav') ||
        lower.includes('modal') ||
        lower.includes('dialog') ||
        lower.includes('overlay') ||
        lower.includes('fixed') ||
        lower.includes('sticky')
      ) {
        continue;
      }

      let match: RegExpExecArray | null;
      while ((match = glassRegex.exec(lineText)) !== null) {
        const startCol = match.index + 1;
        const endCol = startCol + match[0].length;
        const location = createLocation(context.filePath, i + 1, startCol, 0, i + 1, endCol, 0);

        findings.push({
          ruleId: 'UI-003',
          problemTitle: 'Glassmorphism without functional purpose',
          message: 'Translucent glass surface with backdrop-blur used on non-overlay element.',
          whatIsWrong: 'Backdrop-blur and translucent background used on an in-flow card or container without elevation hierarchy.',
          whyItMatters: 'Forces browser to maintain extra compositing layers during scroll and risks poor WCAG contrast when background varies.',
          howToFix: 'Use a solid, opaque surface token (e.g. bg-white or bg-slate-900 with subtle border) instead of backdrop-blur.',
          severity: 'warning',
          confidence: 0.86,
          location,
          findingType: 'problem',
          evidence: [
            regexEvidence(`Glassmorphic pattern match: "${match[0]}"`, location),
            {
              type: 'rule',
              explanation: 'Backdrop blur applied to routine in-page content container',
            },
          ],
          supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
        });
      }
    }

    return findings;
  },
};
