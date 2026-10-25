import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  createLocation,
  regexEvidence,
} from '@craftlens/core';

export const IX_002_RULE: CraftLensRule = {
  id: 'IX-002',
  category: 'accessibility',
  title: 'Missing Focus-Visible State',
  problemTitle: 'Focus outline removed without replacement',
  description: 'Outline is stripped using outline-none or focus:outline-none without providing an accessible focus-visible ring.',
  rationale: 'Removing focus rings traps keyboard users in invisible navigation. WCAG 2.4.7 requires a visible indicator of focus for every focusable control.',
  whatIsWrong: 'Focus outline is suppressed with outline-none without an accessible focus-visible alternative.',
  whyItMatters: 'Keyboard and assistive technology users cannot see which element has focus when tabbing.',
  howToFix: 'Add focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 to restore keyboard affordance.',
  severity: 'warning',
  confidence: 0.92,
  engine: 'css',
  recommendation: 'Always pair outline-none with focus-visible:ring-2.',
  fix: 'assisted',
  platforms: ['react', 'web'],
  tags: ['interaction', 'focus', 'accessibility', 'a11y', 'ux'],
  supportedActions: ['fix', 'preview', 'suggest_better_design', 'explain', 'not_a_problem'],

  detect(context: AnalysisContext): Finding[] {
    const findings: Finding[] = [];
    const outlineRegex = /\b(outline-none|focus:outline-none)\b/g;

    const lines = context.sourceCode.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      let match: RegExpExecArray | null;
      while ((match = outlineRegex.exec(lineText)) !== null) {
        // If focus-visible ring is provided, it is compliant
        if (lineText.includes('focus-visible:ring') || lineText.includes('focus-visible:outline')) {
          continue;
        }

        const startCol = match.index + 1;
        const endCol = startCol + match[0].length;
        const location = createLocation(context.filePath, i + 1, startCol, 0, i + 1, endCol, 0);

        findings.push({
          ruleId: 'IX-002',
          problemTitle: 'Focus outline removed without replacement',
          message: 'outline-none removes keyboard focus indicator without focus-visible replacement.',
          whatIsWrong: 'Default focus indicator is stripped without adding an accessible focus-visible style.',
          whyItMatters: 'Prevents keyboard-only users from navigating or interacting with this control.',
          howToFix: 'Add focus-visible:ring-2 focus-visible:ring-offset-2 to provide an accessible focus ring.',
          severity: 'warning',
          confidence: 0.92,
          location,
          findingType: 'problem',
          evidence: [
            regexEvidence(`Missing focus-visible ring alongside "${match[0]}"`, location),
            {
              type: 'rule',
              explanation: 'outline-none without focus-visible:ring violates WCAG 2.4.7',
            },
          ],
          supportedActions: ['fix', 'preview', 'suggest_better_design', 'explain', 'not_a_problem'],
        });
      }
    }

    return findings;
  },
};
