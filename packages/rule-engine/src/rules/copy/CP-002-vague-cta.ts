import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  createLocation,
  regexEvidence,
} from '@craftlens/core';

import { UIAnalyzer } from '@craftlens/design-intelligence';

export const CP_002_RULE: CraftLensRule = {
  id: 'CP-002',
  category: 'copy',
  title: 'Vague CTA Without Clear Outcome',
  problemTitle: 'Generic CTA language',
  description: 'Button or action uses generic placeholder labels such as "Click Here", "Submit", or "Get Started" without informing the user what happens next.',
  rationale: 'Clear call-to-actions state the direct outcome of the user action (e.g. "Create Project", "Send Invitation", "Download CSV") instead of generic verbs. This reduces anxiety and increases completion rates.',
  whatIsWrong: 'The action label is vague and does not communicate what will occur upon clicking.',
  whyItMatters: 'Users hesitate when clicking buttons with ambiguous outcomes, fearing unexpected state changes or data loss.',
  howToFix: 'Replace with a specific verb + noun describing the direct outcome (e.g. "Save Changes", "Generate API Key").',
  severity: 'warning',
  confidence: 0.9,
  engine: 'heuristic',
  recommendation: 'Use descriptive verb + noun action labels (e.g. "Create Workspace").',
  fix: 'manual',
  platforms: ['react', 'web'],
  tags: ['copy', 'cta', 'ux', 'clarity'],
  supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],

  detect(context: AnalysisContext): Finding[] {
    try {
      const report = UIAnalyzer.analyze(context.filePath, context.sourceCode);
      const uiFindings = report.composition.findings.filter(f => f.ruleId === 'CP-002');
      if (uiFindings.length > 0) {
        return uiFindings;
      }
    } catch {
      // Fallback to regex below
    }

    const findings: Finding[] = [];
    const vagueRegex = /<(?:button|Button|a)[^>]*>([\s\S]*?)<\/(?:button|Button|a)>/gi;
    const genericPhrases = ['click here', 'submit', 'continue', 'get started', 'learn more', 'try now', 'explore', 'discover', 'unlock your potential'];

    const lines = context.sourceCode.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      let match: RegExpExecArray | null;
      while ((match = vagueRegex.exec(lineText)) !== null) {
        const startCol = match.index + 1;
        const location = createLocation(context.filePath, i + 1, startCol, 0, i + 1, startCol + match[0].length, 0);

        findings.push({
          ruleId: 'CP-002',
          problemTitle: 'Vague action label without outcome',
          message: `Button uses vague generic label "${match[0].replace(/<[^>]+>/g, '').trim()}".`,
          whatIsWrong: 'Action label does not explain the concrete result of clicking.',
          whyItMatters: 'Vague action words increase cognitive hesitation and create uncertainty about irreversible actions.',
          howToFix: 'Specify the direct action and entity (e.g. "Create Agent", "Save Profile", "Export Report").',
          severity: 'suggestion',
          confidence: 0.9,
          location,
          findingType: 'suggestion',
          evidence: [
            regexEvidence(`Vague CTA text: "${match[0]}"`, location),
            {
              type: 'rule',
              explanation: 'Action label lacks specific verb-noun pairing',
            },
          ],
          supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
        });
      }
    }

    return findings;
  },
};
