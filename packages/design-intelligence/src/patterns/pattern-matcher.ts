import { ProjectContext } from '@craftlens/core';

export interface VisualClusterEvidence {
  hasPurpleOrBlueGradient: boolean;
  hasFloatingCards: boolean;
  hasCenteredHero: boolean;
  hasGenericCta: boolean;
  hasIdenticalFeatureCards: boolean;
  isEstablishedBrandColor: boolean;
  matchedCount: number;
  evidenceItems: string[];
}

export class PatternMatcher {
  /**
   * Evaluates whether a component exhibits a generic template cluster
   * based on multiple correlated evidence points rather than a single stylistic choice.
   */
  public static evaluateGenericTemplatePattern(
    sourceText: string,
    projectContext: ProjectContext
  ): VisualClusterEvidence {
    const evidenceItems: string[] = [];

    // 1. Purple/Blue gradient
    const hasPurpleOrBlueGradient =
      /linear-gradient.*(?:#7c3aed|#8b5cf6|#6366f1|#3b82f6|violet|purple|indigo)/i.test(sourceText) ||
      /bg-gradient-to-[a-z]+.*(?:from-purple|from-indigo|from-violet)/i.test(sourceText);

    // Check if purple/violet is part of established brand colors
    const brandColors = projectContext.baseline.brandColors || projectContext.baseline.colors || [];
    const isEstablishedBrandColor = brandColors.some(c =>
      /purple|violet|indigo|#7c3aed|#6366f1/i.test(c)
    );

    if (hasPurpleOrBlueGradient && !isEstablishedBrandColor) {
      evidenceItems.push('Detected purple/indigo hero gradient without established brand token');
    }

    // 2. Repeated floating cards (e.g. shadow-2xl backdrop-blur rounded-2xl)
    const hasFloatingCards =
      /(?:shadow-2xl|shadow-xl).*(?:backdrop-blur|bg-white\/|bg-black\/|border-white\/)/i.test(sourceText);
    if (hasFloatingCards) {
      evidenceItems.push('Floating translucent cards with exaggerated shadow detected');
    }

    // 3. Centered hero pattern
    const hasCenteredHero =
      /(?:text-center|items-center justify-center).*(?:tracking-tight.*text-5xl|text-6xl|text-4xl)/i.test(sourceText) &&
      /(?:max-w-2xl|max-w-3xl|max-w-4xl)\s+mx-auto/i.test(sourceText);
    if (hasCenteredHero) {
      evidenceItems.push('Standard centered hero block layout detected');
    }

    // 4. Generic CTA copy (e.g. "Get Started Today", "Start your free trial", "Transform your workflow")
    const hasGenericCta =
      /(?:Get Started Today|Start your free trial|Transform your workflow|Unleash the power of|Next-generation platform)/i.test(sourceText);
    if (hasGenericCta) {
      evidenceItems.push('Generic boilerplate CTA copy detected');
    }

    // 5. Identical feature cards in 3-column grid
    const hasIdenticalFeatureCards =
      /grid\s+grid-cols-(?:1\s+md:grid-cols-)?3/i.test(sourceText) &&
      (sourceText.match(/<Card/g) || []).length >= 3;
    if (hasIdenticalFeatureCards) {
      evidenceItems.push('Uniform 3-column feature card cluster detected');
    }

    let matchedCount = 0;
    if (hasPurpleOrBlueGradient && !isEstablishedBrandColor) matchedCount++;
    if (hasFloatingCards) matchedCount++;
    if (hasCenteredHero) matchedCount++;
    if (hasGenericCta) matchedCount++;
    if (hasIdenticalFeatureCards) matchedCount++;

    return {
      hasPurpleOrBlueGradient,
      hasFloatingCards,
      hasCenteredHero,
      hasGenericCta,
      hasIdenticalFeatureCards,
      isEstablishedBrandColor,
      matchedCount,
      evidenceItems,
    };
  }
}
