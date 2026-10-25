import { Finding, Signal, Pattern, ProjectContext, CraftLensRule } from '@craftlens/core';

export interface PromptConstructionOptions {
  productContext?: ProjectContext;
  userTask?: string;
  filePath: string;
  sourceSlice: string;
  signals?: Signal[];
  patterns?: Pattern[];
  crossScreenEvidence?: string[];
  currentFindings?: Finding[];
  relevantRules?: CraftLensRule[];
}

/**
 * Builds compact, highly-contextual AI reasoning prompts (Section 26).
 * Never sends the entire project; packages only relevant source, extracted signals,
 * detected patterns, and product context to perform high-level evaluation.
 */
export class AiPromptBuilder {
  public static buildContextualPrompt(options: PromptConstructionOptions): string {
    const {
      productContext,
      userTask = 'Audit & Polish',
      filePath,
      sourceSlice,
      signals = [],
      patterns = [],
      crossScreenEvidence = [],
      currentFindings = [],
      relevantRules = [],
    } = options;

    const sections: string[] = [];

    // Header & Role
    sections.push(
      'You are a senior product designer, senior frontend engineer, and accessibility reviewer sitting beside the developer.',
      'Analyze the provided interface slice using contextual design reasoning. Distinguish intentional, brand-grounded design from generic template behavior.'
    );

    // 1. PRODUCT CONTEXT
    const pMeta = productContext?.productMeta;
    sections.push('## PRODUCT CONTEXT');
    sections.push(`• Product Type: ${pMeta?.productType || 'Web Application'}`);
    sections.push(`• Expected Density: ${pMeta?.expectedDensity || 'Balanced'}`);
    if (pMeta?.audience) sections.push(`• Target Audience: ${pMeta.audience}`);
    if (pMeta?.primaryTask) {
      sections.push(`• Primary User Task: ${pMeta.primaryTask}`);
    }
    if (pMeta?.brandColors && pMeta.brandColors.length > 0) {
      sections.push(`• Established Brand Colors: ${pMeta.brandColors.join(', ')}`);
    }
    if (pMeta?.intentionalPatterns && pMeta.intentionalPatterns.length > 0) {
      sections.push(`• Documented Intentional Patterns: ${pMeta.intentionalPatterns.join(', ')}`);
    }

    // 2. DESIGN SYSTEM
    const ds = productContext?.designSystem;
    sections.push('\n## DESIGN SYSTEM');
    if (ds) {
      if (ds.spacing.length > 0) sections.push(`• Spacing Scale: ${ds.spacing.join(', ')}`);
      if (ds.radius.length > 0) sections.push(`• Radius Scale: ${ds.radius.join(', ')}`);
      if (ds.components.length > 0) {
        sections.push(`• Discovered Components: ${ds.components.map(c => c.name).join(', ')}`);
      }
    } else {
      sections.push('• System: Inferred from local components and style tokens.');
    }

    // 3. USER TASK
    sections.push('\n## USER TASK');
    sections.push(userTask);

    // 4. RELEVANT SOURCE
    sections.push('\n## RELEVANT SOURCE');
    sections.push(`File: ${filePath}`);
    sections.push('```tsx');
    sections.push(sourceSlice.trim());
    sections.push('```');

    // 5. EXTRACTED SIGNALS (Layer 1)
    sections.push('\n## EXTRACTED SIGNALS');
    if (signals.length > 0) {
      for (const sig of signals.slice(0, 20)) {
        sections.push(`• [${sig.type}] ${sig.source}: ${typeof sig.value === 'object' ? JSON.stringify(sig.value) : sig.value}`);
      }
      if (signals.length > 20) {
        sections.push(`• ... and ${signals.length - 20} additional signals`);
      }
    } else {
      sections.push('• No raw suspicious signals extracted.');
    }

    // 6. DETECTED PATTERNS (Layer 2)
    sections.push('\n## DETECTED PATTERNS');
    if (patterns.length > 0) {
      for (const pat of patterns) {
        sections.push(`• Pattern: ${pat.type} (Confidence: ${Math.round(pat.confidence * 100)}%)`);
      }
    } else {
      sections.push('• No multi-signal patterns built.');
    }

    // 7. CROSS-SCREEN EVIDENCE (Layer 4)
    sections.push('\n## CROSS-SCREEN EVIDENCE');
    if (crossScreenEvidence.length > 0) {
      for (const ev of crossScreenEvidence) {
        sections.push(`• ${ev}`);
      }
    } else {
      sections.push('• Single screen analysis; no multi-route template convergence detected.');
    }

    // 8. CURRENT FINDINGS
    sections.push('\n## CURRENT FINDINGS');
    if (currentFindings.length > 0) {
      for (const f of currentFindings) {
        sections.push(`• [${f.ruleId}] ${f.problemTitle || f.message} (Severity: ${f.severity}, Confidence: ${f.confidence ?? 'N/A'})`);
      }
    } else {
      sections.push('• No deterministic findings reported.');
    }

    // 9. RULES RELEVANT TO THIS TASK
    if (relevantRules.length > 0) {
      sections.push('\n## RULES RELEVANT TO THIS TASK');
      for (const r of relevantRules.slice(0, 10)) {
        sections.push(`• ${r.id} (${r.title}): ${r.whatIsWrong || r.description}`);
      }
    }

    // 10. REASONING INSTRUCTIONS
    sections.push('\n## REASONING INSTRUCTIONS');
    sections.push('Perform contextual evaluation according to the CraftLens Product UI principles:');
    sections.push('1. Validate the signals against the actual source and product context.');
    sections.push('2. Determine whether the detected pattern is genuinely problematic or justified by content/workflow.');
    sections.push('3. Never flag purple, gradients, cards, rounded corners, glass, Inter, or Tailwind on their own.');
    sections.push('4. Never claim AI authorship; describe generic patterns as "Strong template-like visual pattern".');
    sections.push('5. Reject false positives if the pattern matches established brand colors or intentional design system rules.');
    sections.push('6. Cluster related issues into single findings instead of flooding output.');
    sections.push('7. Produce concise findings with: WHAT IS WRONG, WHY IT MATTERS, EVIDENCE, HOW TO IMPROVE IT, and VERIFICATION CRITERIA.');

    return sections.join('\n');
  }
}
