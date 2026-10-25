import {
  Pattern,
  Finding,
  ProjectContext,
  SourceLocation,
  createLocation,
  astEvidence,
} from '@craftlens/core';
import { ParsedUIDocument } from '@craftlens/parser';

export interface EvaluatedPatternResult {
  pattern: Pattern;
  shouldReport: boolean;
  adjustedConfidence: number;
  adjustedSeverity: 'error' | 'warning' | 'suggestion' | 'info';
  falsePositiveNote?: string;
  falsePositiveContext: string[];
  finding?: Finding;
}

export class ContextReasoner {
  public static evaluate(
    doc: ParsedUIDocument,
    patterns: Pattern[],
    projectContext?: ProjectContext
  ): EvaluatedPatternResult[] {
    const results: EvaluatedPatternResult[] = [];
    const meta = projectContext?.productMeta;
    const baseline = projectContext?.baseline;
    const ds = projectContext?.designSystem;
    const intentionalPatterns = new Set(meta?.intentionalPatterns || []);
    const brandColors = new Set(meta?.brandColors || baseline?.brandColors || []);
    const topLocation: SourceLocation = doc.roots[0]?.range || createLocation(doc.filePath, 1, 1, 0, 1, 20, 0);

    for (const pat of patterns) {
      let shouldReport = true;
      let adjustedConfidence = pat.confidence;
      let adjustedSeverity: 'error' | 'warning' | 'suggestion' | 'info' = 'warning';
      const fpContext: string[] = [];
      let falsePositiveNote: string | undefined;

      // ─────────────────────────────────────────────────────────────
      // Check 1: Intentional Design System or Brand Match
      // ─────────────────────────────────────────────────────────────
      if (pat.type === 'ai_signature_stack') {
        // If purple is declared in DESIGN.md or baseline as an intentional brand color:
        if (brandColors.size > 0 || intentionalPatterns.has('gradients')) {
          adjustedConfidence -= 0.20;
          fpContext.push('Brand palette or gradient is declared in project design specification.');
          falsePositiveNote = 'Gradients or brand accents are documented in project design guidelines.';
          if (pat.signals.length <= 3) {
            // If only 3 signals and brand justifies gradient, suppress to avoid false positive
            shouldReport = false;
          }
        }
      }

      if (pat.type === 'card_soup') {
        // If product is a dashboard or admin tool with dense tables/cards:
        if (
          meta?.productType === 'dashboard' ||
          (meta as any)?.expectedDensity === 'dense' ||
          meta?.expectedDensity === 'compact' ||
          intentionalPatterns.has('dense-layout') ||
          intentionalPatterns.has('metric-kpi-grid') ||
          intentionalPatterns.has('cards')
        ) {
          adjustedConfidence -= 0.25;
          fpContext.push('Cards / KPI grids are an intentional container pattern in project design specification.');
          falsePositiveNote = 'Card containers are part of the established layout pattern for this dashboard.';
          // Only report if cards are truly excessive (>=6) and identical
          if (pat.signals.length < 5 || meta?.productType === 'dashboard' || intentionalPatterns.has('metric-kpi-grid')) {
            shouldReport = false;
          }
        }
      }

      if (pat.type === 'generic_saas_hero') {
        // If product is an internal tool or dashboard, hero shouldn't even be there
        if (meta?.productType === 'application' && !doc.filePath.toLowerCase().includes('landing') && !doc.filePath.toLowerCase().includes('index')) {
          // Application surface with marketing hero is actually high priority to fix!
          adjustedSeverity = 'warning';
          adjustedConfidence += 0.05;
        } else if (meta?.productType === 'marketing') {
          // In marketing mode, a hero is expected, so check whether it has custom domain content
          if (pat.signals.length < 3) {
            shouldReport = false;
          }
        }
      }

      if (pat.type === 'trend_stacking') {
        if (intentionalPatterns.has('glass') && intentionalPatterns.has('gradients')) {
          adjustedConfidence -= 0.15;
          fpContext.push('Glassmorphism and gradients are documented in design specification.');
          falsePositiveNote = 'Aesthetic direction permits layered translucent materials.';
        }
      }

      // Check whether changing it improves usability, clarity, trust, or maintainability
      if (adjustedConfidence < 0.70) {
        shouldReport = false;
      }

      // Synthesize Finding if shouldReport
      let finding: Finding | undefined;
      if (shouldReport) {
        finding = ContextReasoner.createFindingFromPattern(
          pat,
          doc.filePath,
          topLocation,
          adjustedConfidence,
          adjustedSeverity,
          falsePositiveNote,
          fpContext
        );
      }

      results.push({
        pattern: pat,
        shouldReport,
        adjustedConfidence: Math.max(0.5, Math.min(0.99, adjustedConfidence)),
        adjustedSeverity,
        falsePositiveNote,
        falsePositiveContext: fpContext,
        finding,
      });
    }

    return results;
  }

  private static createFindingFromPattern(
    pat: Pattern,
    filePath: string,
    topLocation: SourceLocation,
    confidence: number,
    severity: 'error' | 'warning' | 'suggestion' | 'info',
    falsePositiveNote?: string,
    falsePositiveContext?: string[]
  ): Finding {
    const primarySignal = pat.signals[0];
    const loc = primarySignal?.location || topLocation;

    switch (pat.type) {
      case 'generic_saas_hero':
        return {
          id: 'pat-generic-saas-hero',
          ruleId: 'UI-015',
          problemTitle: 'Generic template-driven hero section',
          title: 'Generic template-driven hero section',
          message: 'The hero section combines multiple generic SaaS template patterns.',
          whatIsWrong: 'The hero uses centered oversized text, dual generic CTAs, and ambient glow without product-specific proof or objects.',
          summary: 'The hero uses centered oversized text, dual generic CTAs, and ambient glow without product-specific proof or objects.',
          whyItMatters: 'Template layouts reduce brand differentiation and fail to guide users directly toward concrete product value.',
          why: 'Template layouts reduce brand differentiation and fail to guide users directly toward concrete product value.',
          howToFix: 'Anchor the hero with real product UI, specific action-oriented CTA verbs, and clean typography instead of decorative aura.',
          recommendation: 'Anchor the hero with real product UI, specific action-oriented CTA verbs, and clean typography instead of decorative aura.',
          severity,
          confidence,
          location: loc,
          primaryLocation: loc,
          findingType: 'problem',
          category: 'hierarchy',
          clusterId: 'template-fingerprint',
          evidence: pat.evidence,
          verification: 'Verify that the hero headline speaks specifically to the user workflow and the primary CTA uses a concrete task verb.',
          falsePositiveNote,
          falsePositiveContext,
          supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
        };

      case 'card_soup':
        return {
          id: 'pat-card-soup',
          ruleId: 'CP-007',
          problemTitle: 'Everything is a card',
          title: 'Everything is a card',
          message: 'Repeated card containers dominate the layout, flattening visual hierarchy.',
          whatIsWrong: 'Information across multiple sections is uniformly boxed in identical card containers, giving equal visual importance to everything.',
          summary: 'Information across multiple sections is uniformly boxed in identical card containers, giving equal visual importance to everything.',
          whyItMatters: 'When everything is inside a card, nothing stands out. Users are forced to scan every box linearly instead of seeing clear visual anchors.',
          why: 'When everything is inside a card, nothing stands out. Users are forced to scan every box linearly instead of seeing clear visual anchors.',
          howToFix: 'Group related content with proximity, whitespace dividers, and typographic scale rather than wrapping each item in a card container.',
          recommendation: 'Group related content with proximity, whitespace dividers, and typographic scale rather than wrapping each item in a card container.',
          severity,
          confidence,
          location: loc,
          primaryLocation: loc,
          findingType: 'problem',
          category: 'hierarchy',
          clusterId: 'card-soup',
          evidence: pat.evidence,
          verification: 'Confirm visual hierarchy by checking if primary metrics are immediately distinguishable from supporting details without container borders.',
          falsePositiveNote,
          falsePositiveContext,
          supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
        };

      case 'ai_signature_stack':
        return {
          id: 'pat-ai-signature-stack',
          ruleId: 'UI-016',
          problemTitle: 'Strong template-like visual pattern',
          title: 'Strong template-like visual pattern',
          message: 'The interface exhibits a correlated stack of template-like decorative tropes.',
          whatIsWrong: 'Multiple decorative tropes (purple/indigo gradient, ambient glow, sparkle icons, pill cards, and generic CTAs) appear concurrently.',
          summary: 'Multiple decorative tropes (purple/indigo gradient, ambient glow, sparkle icons, pill cards, and generic CTAs) appear concurrently.',
          whyItMatters: 'Stacking these decorative tropes makes the application feel like an unverified prototype or scaffold rather than production software.',
          why: 'Stacking these decorative tropes makes the application feel like an unverified prototype or scaffold rather than production software.',
          howToFix: 'Strip cosmetic filler: remove the decorative glow and sparkle icons, replace generic gradients with solid surface tokens, and highlight real product content.',
          recommendation: 'Strip cosmetic filler: remove the decorative glow and sparkle icons, replace generic gradients with solid surface tokens, and highlight real product content.',
          severity,
          confidence,
          location: loc,
          primaryLocation: loc,
          findingType: 'problem',
          category: 'visual',
          clusterId: 'ai-pattern-stack',
          evidence: pat.evidence,
          verification: 'Inspect the view at 100% zoom: ensure surface backgrounds are calm and focused on typography and actionable controls.',
          falsePositiveNote,
          falsePositiveContext,
          supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
        };

      case 'visual_treatment_overload':
        return {
          id: 'pat-visual-treatment-overload',
          ruleId: 'UI-014',
          problemTitle: 'Visual treatment overload',
          title: 'Visual treatment overload',
          message: 'Components accumulate excessive simultaneous visual styling treatments.',
          whatIsWrong: 'Elements combine gradient, diffuse shadow, border, large border radius, glow, and status badges simultaneously.',
          summary: 'Elements combine gradient, diffuse shadow, border, large border radius, glow, and status badges simultaneously.',
          whyItMatters: 'Overloading components with simultaneous styling treatments creates visual competition and distracts from core task data.',
          why: 'Overloading components with simultaneous styling treatments creates visual competition and distracts from core task data.',
          howToFix: 'Simplify component styling: retain only the borders and background needed to distinguish the container.',
          recommendation: 'Simplify component styling: retain only the borders and background needed to distinguish the container.',
          severity,
          confidence,
          location: loc,
          primaryLocation: loc,
          findingType: 'problem',
          category: 'visual',
          clusterId: 'treatment-overload',
          evidence: pat.evidence,
          verification: 'Check that container borders and subtle elevation suffice to separate the component without ambient glow or multi-stop gradients.',
          falsePositiveNote,
          falsePositiveContext,
          supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
        };

      case 'trend_stacking':
        return {
          id: 'pat-trend-stacking',
          ruleId: 'UI-013',
          problemTitle: 'Trend stacking',
          title: 'Trend stacking',
          message: 'Several decorative visual trends are used together across the page.',
          whatIsWrong: 'Gradients, glows, glassmorphism, and diffuse shadows are applied simultaneously without functional rationale.',
          summary: 'Gradients, glows, glassmorphism, and diffuse shadows are applied simultaneously without functional rationale.',
          whyItMatters: 'Trend stacking over-decorates container surfaces, increasing visual noise and causing cognitive fatigue.',
          why: 'Trend stacking over-decorates container surfaces, increasing visual noise and causing cognitive fatigue.',
          howToFix: 'Pick one primary aesthetic treatment (e.g. clean neutral borders) and keep surfaces solid and calm.',
          recommendation: 'Pick one primary aesthetic treatment (e.g. clean neutral borders) and keep surfaces solid and calm.',
          severity,
          confidence,
          location: loc,
          primaryLocation: loc,
          findingType: 'problem',
          category: 'visual',
          clusterId: 'trend-stacking',
          evidence: pat.evidence,
          verification: 'Confirm that removing ambient glow and glassmorphism preserves or improves readability of text and controls.',
          falsePositiveNote,
          falsePositiveContext,
          supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
        };

      case 'weak_visual_hierarchy':
        return {
          id: 'pat-weak-hierarchy',
          ruleId: 'VH-008',
          problemTitle: 'Weak visual hierarchy',
          title: 'Weak visual hierarchy',
          message: 'The page gives similar visual prominence to primary and supporting content.',
          whatIsWrong: 'Headings, cards, and interactive actions share nearly identical visual weight, leaving users with no clear starting anchor.',
          summary: 'Headings, cards, and interactive actions share nearly identical visual weight, leaving users with no clear starting anchor.',
          whyItMatters: 'Users scan interfaces hierarchically: primary anchor → secondary grouping → supporting details. Equal visual weight forces linear reading.',
          why: 'Users scan interfaces hierarchically: primary anchor → secondary grouping → supporting details. Equal visual weight forces linear reading.',
          howToFix: 'Make the primary headline and action dominant; subdue secondary containers with muted text and subtle borders.',
          recommendation: 'Make the primary headline and action dominant; subdue secondary containers with muted text and subtle borders.',
          severity,
          confidence,
          location: loc,
          primaryLocation: loc,
          findingType: 'problem',
          category: 'hierarchy',
          clusterId: 'visual-hierarchy',
          evidence: pat.evidence,
          verification: 'Perform the squint test: is the single most important action and headline immediately obvious?',
          falsePositiveNote,
          falsePositiveContext,
          supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
        };

      case 'responsive_overflow':
        return {
          id: 'pat-responsive-overflow',
          ruleId: 'UI-022',
          problemTitle: 'Fixed container width breaks mobile viewport',
          title: 'Fixed container width breaks mobile viewport',
          message: 'Container specifies fixed pixel width without responsive constraints.',
          whatIsWrong: 'Container width is hardcoded to a fixed pixel size, causing horizontal scrollbars on smaller viewports.',
          summary: 'Container width is hardcoded to a fixed pixel size, causing horizontal scrollbars on smaller viewports.',
          whyItMatters: 'Horizontal scrolling on mobile and tablet screens disorients users and clips interactive controls.',
          why: 'Horizontal scrolling on mobile and tablet screens disorients users and clips interactive controls.',
          howToFix: 'Use max-width with fluid width: replace fixed pixel width with w-full max-w-5xl px-4.',
          recommendation: 'Use max-width with fluid width: replace fixed pixel width with w-full max-w-5xl px-4.',
          severity,
          confidence,
          location: loc,
          primaryLocation: loc,
          findingType: 'problem',
          category: 'css',
          clusterId: 'responsive-overflow',
          evidence: pat.evidence,
          verification: 'Resize the viewport to 375px width and verify that no horizontal scrollbar appears.',
          falsePositiveNote,
          falsePositiveContext,
          supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
        };

      default:
        return {
          id: pat.id,
          ruleId: typeof pat.type === 'string' && pat.type.trim() ? pat.type.trim().toUpperCase() : 'DESIGN-PATTERN',
          problemTitle: pat.description || 'Design pattern issue',
          title: pat.description || 'Design pattern issue',
          message: pat.description || 'Design pattern issue detected.',
          whatIsWrong: pat.description || 'Design pattern issue detected.',
          summary: pat.description || 'Design pattern issue detected.',
          whyItMatters: 'Addressing this pattern improves visual clarity, usability, and interface specificity.',
          why: 'Addressing this pattern improves visual clarity, usability, and interface specificity.',
          howToFix: 'Refactor this section according to product intent and design system standards.',
          recommendation: 'Refactor this section according to product intent and design system standards.',
          severity,
          confidence,
          location: loc,
          primaryLocation: loc,
          findingType: 'problem',
          category: 'ui',
          evidence: pat.evidence,
          verification: 'Confirm the improved layout aligns with product design standards.',
          falsePositiveNote,
          falsePositiveContext,
        };
    }
  }
}
