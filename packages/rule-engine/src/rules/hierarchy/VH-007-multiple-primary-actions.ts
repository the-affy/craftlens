import ts from 'typescript';
import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  astEvidence,
} from '@craftlens/core';
import { ParsedDocument } from '@craftlens/parser';
import { ActionHierarchyAnalyzer } from '@craftlens/design-intelligence';

export const VH_007_RULE: CraftLensRule = {
  id: 'VH-007',
  category: 'hierarchy',
  title: 'Multiple Primary Actions Competing For Visual Weight',
  problemTitle: 'Weak CTA hierarchy',
  whatIsWrong: 'Multiple competing primary actions share identical visual weight.',
  whyItMatters: 'Users cannot quickly determine what matters most, creating decision hesitation.',
  howToFix: 'Keep one clear primary action and downgrade secondary buttons to outline or ghost variant.',
  description: 'Multiple buttons with primary styling exist within the same container, creating decision paralysis.',
  rationale:
    'Visual hierarchy works best when each view or section has one unmistakable primary action. Multiple high-weight buttons compete for attention and reduce conversion clarity.',
  severity: 'warning',
  confidence: 0.9,
  engine: 'ast',
  recommendation: 'Establish one primary action and convert remaining actions to secondary, outline, or ghost styling.',
  fix: 'assisted',
  platforms: ['react', 'web'],
  tags: ['hierarchy', 'actions', 'buttons', 'visual-design', 'cta'],
  minimumAuditLevel: 'moderate',
  diagnosis: 'Multiple actions share identical primary visual weight in the same container.',
  implementationGuide: 'Change non-dominant button variant to "secondary", "outline", or "ghost".',
  supportedActions: ['fix', 'preview', 'suggest_better_design', 'explain', 'not_a_problem'],
  structuredRecommendation: {
    summary: 'Designate one clear primary action and visually subordinate the others.',
    rationale: 'Equal visual prominence forces the user to pause and analyze rather than follow an obvious primary path.',
    alternatives: ActionHierarchyAnalyzer.getAlternatives(),
    fix: {
      type: 'assisted',
      description: 'Convert secondary buttons to variant="secondary"',
    },
  },

  detect(context: AnalysisContext): Finding[] {
    const parsed = context.parsedAst as ParsedDocument | undefined;
    if (!parsed || !parsed.sourceFile) return [];

    const findings: Finding[] = [];
    const results = ActionHierarchyAnalyzer.analyzeActions(parsed);

    for (const res of results) {
      if (res.competingActionsCount >= 2) {
        // Flag competing actions from the second action onward
        const secondaryCandidate = res.primaryActions[1];
        const location = secondaryCandidate.location;

        const finding: Finding = {
          ruleId: 'VH-007',
          problemTitle: 'Weak CTA hierarchy',
          whatIsWrong: `${res.competingActionsCount} competing buttons share primary visual weight.`,
          whyItMatters: 'Users cannot determine the intended primary outcome when multiple actions compete for identical prominence.',
          howToFix: 'Subordinate this button to variant="secondary" or outline styling.',
          message: `${res.competingActionsCount} actions have primary visual weight in the same container.`,
          description:
            'Multiple buttons share primary prominence. Convert secondary buttons to secondary or outline actions.',
          severity: 'warning',
          confidence: 0.9,
          location,
          findingType: 'problem',

          diagnosis: `${res.competingActionsCount} actions share primary visual prominence in the same container.`,
          recommendation:
            'Keep one primary action and convert remaining actions to secondary or outline styling.',
          structuredRecommendation: {
            summary: 'Establish one primary action and subordinate remaining actions.',
            rationale: 'Hierarchical clarity speeds up comprehension and prevents cognitive friction.',
            alternatives: ActionHierarchyAnalyzer.getAlternatives(),
            fix: {
              type: 'assisted',
              description: 'Convert competing button to variant="secondary"',
            },
          },
          alternatives: ActionHierarchyAnalyzer.getAlternatives(),
          supportedActions: ['fix', 'preview', 'suggest_better_design', 'explain', 'not_a_problem'],
          evidence: [
            astEvidence(
              `Found ${res.competingActionsCount} competing primary buttons. Primary: "${res.primaryActions[0].rawText}". Competing: "${secondaryCandidate.rawText}"`,
              location,
              secondaryCandidate.rawText
            ),
          ],
        };

        // If it's a Button with variant="primary" or variant="default", or raw Button tag, offer assisted transformation
        const raw = secondaryCandidate.rawText;
        let newRaw = raw;
        if (raw.includes('variant="primary"') || raw.includes('variant="default"')) {
          newRaw = raw.replace(/variant="(primary|default)"/, 'variant="secondary"');
        } else if (raw.includes('variant={\'primary\'}') || raw.includes('variant={\'default\'}')) {
          newRaw = raw.replace(/variant=\{'(primary|default)'\}/, 'variant="secondary"');
        } else if (raw.includes('<Button')) {
          newRaw = raw.replace('<Button', '<Button variant="secondary"');
        }

        if (newRaw !== raw) {
          finding.fix = {
            title: 'Convert competing action to variant="secondary"',
            kind: 'assisted',
            changes: [
              {
                range: location,
                newText: newRaw,
                before: raw,
              },
            ],
            isPreferred: true,
          };
          finding.designFix = {
            id: 'VH-007-fix',
            title: 'Subordinate competing button to secondary variant',
            description: 'Change button styling to variant="secondary" to establish clear hierarchy.',
            safety: 'assisted',
            isPreferred: true,
            changes: [
              {
                file: location.filePath,
                range: location,
                before: raw,
                after: newRaw,
                explanation: 'Convert secondary action to variant="secondary" so only one primary CTA remains.',
              },
            ],
          };
        }

        findings.push(finding);
      }
    }

    return findings;
  },
};
