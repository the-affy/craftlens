import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  createLocation,
  regexEvidence,
} from '@craftlens/core';

export const UI_005_RULE: CraftLensRule = {
  id: 'UI-005',
  category: 'visual',
  title: 'Excessive Shadow Depth',
  problemTitle: 'Excessive shadow depth on routine container',
  description: 'Heavy multi-layer or 2xl drop shadow applied to static in-page card containers where only subtle boundary separation is needed.',
  rationale: 'Overly deep shadows (shadow-2xl) imply floating modal or popover z-elevation. When applied to routine grid cards, they make the interface feel floating and disconnected from the page surface.',
  whatIsWrong: 'A deep modal-level shadow (shadow-2xl) is applied to an in-flow container.',
  whyItMatters: 'Breaks elevation hierarchy by giving static in-flow cards the same visual elevation as floating modals and overlays.',
  howToFix: 'Use subtle 1px border definition (e.g. border border-slate-200/80 or dark:border-slate-800) with shadow-sm or shadow-none.',
  severity: 'warning',
  confidence: 0.85,
  engine: 'css',
  recommendation: 'Use subtle border definition and restrained elevation for in-flow cards.',
  fix: 'manual',
  platforms: ['react', 'web'],
  tags: ['visual-slop', 'shadows', 'elevation', 'ui'],
  supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],

  detect(context: AnalysisContext): Finding[] {
    const findings: Finding[] = [];
    const shadowRegex = /\b(shadow-2xl|shadow-\[0_2\dpx_[^\]]+\])\b/g;

    const lines = context.sourceCode.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      // Modals, popovers, drawers, dropdowns are legitimately floating
      const lower = lineText.toLowerCase();
      if (
        lower.includes('modal') ||
        lower.includes('dialog') ||
        lower.includes('popover') ||
        lower.includes('dropdown') ||
        lower.includes('fixed') ||
        lower.includes('toast')
      ) {
        continue;
      }

      let match: RegExpExecArray | null;
      while ((match = shadowRegex.exec(lineText)) !== null) {
        const startCol = match.index + 1;
        const endCol = startCol + match[0].length;
        const location = createLocation(context.filePath, i + 1, startCol, 0, i + 1, endCol, 0);

        const matchedText = match[0];
        const replacement = 'shadow-sm border border-slate-200/80 dark:border-slate-800';

        findings.push({
          ruleId: 'UI-005',
          problemTitle: 'Excessive shadow depth on container',
          message: 'Heavy modal-level shadow used on in-flow container.',
          whatIsWrong: 'A deep elevation shadow (shadow-2xl) is used on a static in-flow container.',
          whyItMatters: 'Distorts elevation hierarchy, making non-floating content compete visually with real overlays and modals.',
          howToFix: 'Replace heavy drop shadow with clean 1px border contrast (border border-border) and subtle shadow-sm.',
          severity: 'warning',
          confidence: 0.85,
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
            id: `fix-ui-005-${i}-${startCol}`,
            title: `Replace "${matchedText}" with subtle elevation`,
            description: `Change heavy ${matchedText} to subtle shadow-sm and 1px border contrast to preserve hierarchy.`,
            changes: [
              {
                range: location,
                after: replacement,
                before: matchedText,
                explanation: 'Disciplined surface elevation',
              },
            ],
            safety: 'safe',
            isPreferred: true,
          },
          evidence: [
            regexEvidence(`Excessive shadow class: "${matchedText}"`, location),
            {
              type: 'rule',
              explanation: 'shadow-2xl on static in-page card',
            },
          ],
          supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
        });
      }
    }

    return findings;
  },
};
