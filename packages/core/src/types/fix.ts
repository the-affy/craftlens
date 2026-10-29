import { SourceLocation } from './location.js';
import { ContextAwareFixGenerator } from '../recommendations/context-aware-fix-generator.js';

export type FixPolicy = 'safe' | 'assisted' | 'manual' | 'none';
export type FixSafety = 'safe' | 'assisted' | 'manual';

export interface TextEditChange {
  range: SourceLocation;
  newText: string;
  before?: string;
}

export interface ProposedChange {
  file?: string;
  range: SourceLocation;
  before?: string;
  after: string;
  explanation?: string;
}

export interface FixDescriptor {
  title: string;
  kind: 'safe' | 'assisted';
  changes: TextEditChange[];
  isPreferred?: boolean;
}

export interface DesignFix {
  id: string;
  title: string;
  description: string;
  changes: ProposedChange[];
  safety: FixSafety;
  isPreferred?: boolean;
}

export interface FixCapability {
  issueId: string;
  deterministic: boolean;
  skillAssisted: boolean;
  aiAssisted: boolean;
  suggested: boolean;
  canApply: boolean;
  fixId?: string;
  skillId?: string;
  skillName?: string;
  explanation?: string;
  suggestion?: string;
  whyItMatters?: string;
  exampleBefore?: string;
  exampleAfter?: string;
  verificationSteps?: string[];

  // Backward-compatible properties
  recommendationAvailable: boolean;
  deterministicFixAvailable: boolean;
  skillAssistedFixAvailable: boolean;
  proposedChangeAvailable: boolean;
  automaticApplyAvailable: boolean;
  reason?: string;
}

/**
 * Distinguishes Recommendation ≠ Proposed Change ≠ Deterministic Fix ≠ Automatically Applicable Fix.
 * Exactly one canonical FixCapability representation used across all surfaces (Section 3).
 */
export function resolveFixCapability(
  item: any,
  skillManager?: any,
  projectContext?: any
): FixCapability {
  const issueId = item?.id || item?.ruleId || item?.fingerprint || 'unknown_issue';
  if (!item) {
    return {
      issueId,
      deterministic: false,
      skillAssisted: false,
      aiAssisted: false,
      suggested: false,
      canApply: false,
      explanation: 'No issue provided',
      recommendationAvailable: false,
      deterministicFixAvailable: false,
      skillAssistedFixAvailable: false,
      proposedChangeAvailable: false,
      automaticApplyAvailable: false,
      reason: 'No item provided',
    };
  }

  // 1. Recommendation availability
  const fixChanges = Array.isArray(item.fix?.changes) ? item.fix.changes : [];
  const designFixChanges = Array.isArray(item.designFix?.changes) ? item.designFix.changes : [];
  let rawSuggestions: any[] = Array.isArray(item.suggestions) ? item.suggestions : [];
  if (rawSuggestions.length === 0 && fixChanges.length === 0 && designFixChanges.length === 0) {
    try {
      const generated = ContextAwareFixGenerator.generateSuggestions(item, projectContext);
      if (Array.isArray(generated) && generated.length > 0) {
        rawSuggestions = generated;
      }
    } catch {
      // fallback
    }
  }

  const hasRec = Boolean(
    item.howToFix ||
    item.recommendation ||
    item.whyItMatters ||
    item.why ||
    item.whatIsWrong ||
    item.structuredRecommendation ||
    (Array.isArray(item.recommendations) && item.recommendations.length > 0) ||
    (rawSuggestions.length > 0)
  );

  // 2. Deterministic fix availability
  const hasAnyReplacement = rawSuggestions.some(
    (s: any) => s && (s.replacement !== undefined || s.patch !== undefined)
  );
  const hasSafeReplacement = rawSuggestions.some(
    (s: any) => s && (s.replacement !== undefined || s.patch !== undefined) && (s.safe === true || s.type === 'autofix')
  );

  let deterministic =
    fixChanges.length > 0 ||
    designFixChanges.length > 0 ||
    hasAnyReplacement ||
    Boolean(item.autoFixAvailable) ||
    Boolean(item.fixAvailable);

  const isExplicitManual = (item.fix === 'manual' || item.fix?.kind === 'manual');
  if (isExplicitManual) {
    deterministic = false;
  }

  // 3. Resolve skill attribution
  let skillId: string | undefined = item.skillId || item.sourceSkillId;
  let skillName: string | undefined;

  if (skillManager && typeof skillManager.findSkillsForFinding === 'function') {
    try {
      const matchedSkills = skillManager.findSkillsForFinding(item);
      if (matchedSkills && matchedSkills.length > 0) {
        skillId = skillId || matchedSkills[0].id;
        skillName = skillName || matchedSkills[0].name || (matchedSkills[0] as any).displayName;
      }
    } catch {
      // ignore
    }
  }

  const ruleId = (item.ruleId || '').toUpperCase();
  const category = (item.category || '').toLowerCase();

  if (!skillId) {
    if (category === 'security' || ruleId.startsWith('SEC-')) {
      skillId = 'api-security';
      skillName = skillName || 'API Security Review';
    } else if (
      category === 'qa' ||
      item.skillId === 'qa-release-assurance' ||
      ruleId.startsWith('CMD-') ||
      ruleId.startsWith('EXT-') ||
      ruleId.startsWith('RUNTIME-') ||
      ruleId.startsWith('STATE-') ||
      ruleId.startsWith('FIX-ENGINE-') ||
      ruleId.startsWith('PKG-') ||
      ruleId.startsWith('ARCH-')
    ) {
      skillId = 'qa-release-assurance';
      skillName = skillName || 'QA, Code Review & Release Assurance';
    } else if (category === 'accessibility' || ruleId.startsWith('AX-')) {
      skillId = 'accessibility';
      skillName = skillName || 'Accessibility Guardian';
    } else if (
      category === 'ui' ||
      category === 'ui-ux' ||
      ruleId.startsWith('UI-') ||
      ruleId.startsWith('UX-') ||
      ruleId.startsWith('VH-') ||
      ruleId.startsWith('CP-') ||
      ruleId.startsWith('CL-') ||
      ruleId.startsWith('ID-') ||
      ruleId.startsWith('CX-') ||
      ruleId.includes('TOKEN')
    ) {
      skillId = 'design-system-consistency';
      skillName = skillName || 'Design System Consistency';
    } else {
      skillId = 'code-quality';
      skillName = skillName || 'Code Quality & Maintainability';
    }
  }
  if (!skillName) {
    skillName = skillId === 'api-security' ? 'API Security Review' :
      skillId === 'accessibility' ? 'Accessibility Guardian' :
      skillId === 'qa-release-assurance' ? 'QA, Code Review & Release Assurance' :
      skillId === 'product-ui-intelligence' ? 'Product/UI Intelligence' : 'Code Quality & Maintainability';
  }

  // 4. Proposed change availability
  const hasLinkedChanges = Array.isArray(item.changeIds) && item.changeIds.length > 0;
  const hasProposedChangesInRec = Array.isArray(item.recommendations) && item.recommendations.some(
    (r: any) => Array.isArray(r.proposedChanges) && r.proposedChanges.length > 0
  );
  const proposedChangeAvailable = deterministic || hasLinkedChanges || hasProposedChangesInRec;

  // 5. Automatic apply availability
  let canApply = false;
  if (deterministic && !isExplicitManual) {
    const isSafeFix = item.fix?.kind === 'safe' || item.designFix?.safety === 'safe';
    const isSafeSuggestion = hasSafeReplacement;
    canApply = (isSafeFix || isSafeSuggestion || Boolean(item.autoFixAvailable) || fixChanges.length > 0 || designFixChanges.length > 0) && item.autoFixAvailable !== false;
  }

  // 6. Explanation and Suggestion texts (Sections 11 & 15)
  let explanation = item.whatIsWrong || item.message || item.description || '';
  if (!canApply) {
    if (ruleId.includes('TOKEN') || category === 'ui' || category === 'ui-ux') {
      explanation = "This issue depends on the project's design-token structure and theme conventions.";
    } else if (category === 'security' || ruleId.startsWith('SEC-')) {
      explanation = 'Security mitigations must be audited in the context of your data boundary.';
    } else {
      explanation = item.whyItMatters || item.why || 'Manual review is recommended to preserve component architecture.';
    }
  }

  let suggestion =
    rawSuggestions[0]?.explanation ||
    item.howToFix ||
    item.recommendation ||
    (item.recommendations && item.recommendations.length > 0 ? item.recommendations[0].description : undefined);

  if (!canApply && (!suggestion || suggestion.trim().length === 0)) {
    suggestion = `Use the ${skillName} skill to identify the appropriate pattern and replace the hardcoded or non-compliant value.`;
  }

  let exampleBefore: string | undefined;
  let exampleAfter: string | undefined;
  if (ruleId.includes('TOKEN') || category === 'ui' || category === 'ui-ux') {
    exampleBefore = 'color: #38bdf8;';
    exampleAfter = 'color: var(--color-accent);';
  }

  const verificationSteps = [
    'Inspect the affected location in the source file.',
    'Apply the recommended pattern or semantic token.',
    'Run CraftLens audit to verify zero residual issues.',
  ];

  const fixId = (item.fix as any)?.id || item.designFix?.id || rawSuggestions[0]?.id;

  return {
    issueId,
    deterministic,
    skillAssisted: true,
    aiAssisted: true,
    suggested: true,
    canApply,
    fixId,
    skillId,
    skillName,
    explanation,
    suggestion,
    whyItMatters: item.whyItMatters || item.why,
    exampleBefore,
    exampleAfter,
    verificationSteps,

    // Backward-compat aliases
    recommendationAvailable: hasRec,
    deterministicFixAvailable: deterministic,
    skillAssistedFixAvailable: true,
    proposedChangeAvailable,
    automaticApplyAvailable: canApply,
    reason: canApply ? 'Automatic deterministic fix ready to apply.' : `Skill-assisted remediation available via "${skillName}".`,
  };
}

