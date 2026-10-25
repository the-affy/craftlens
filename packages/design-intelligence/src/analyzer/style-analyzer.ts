import { UIElement, UIElementStyles } from '@craftlens/core';
import { ParsedUIDocument } from '@craftlens/parser';

export interface StyleAnalysisResult {
  colorPalette: Set<string>;
  gradients: { element: UIElement; gradient: string }[];
  radii: { element: UIElement; radius: number }[];
  shadows: { element: UIElement; shadow: string }[];
  spacings: { element: UIElement; spacing: string }[];
  glows: { element: UIElement; glow: string }[];
  backdropBlurs: { element: UIElement; blur: string }[];
  fontSizes: { element: UIElement; size: string }[];
  animations: { element: UIElement; animation: string }[];
  radiusMonoculture: boolean;
  predominantRadius?: number;
  hasExcessiveRadii: boolean;
  hasGenericAiPalette: boolean;
}

export class StyleAnalyzer {
  public static analyze(doc: ParsedUIDocument): StyleAnalysisResult {
    const colorPalette = new Set<string>();
    const gradients: { element: UIElement; gradient: string }[] = [];
    const radii: { element: UIElement; radius: number }[] = [];
    const shadows: { element: UIElement; shadow: string }[] = [];
    const spacings: { element: UIElement; spacing: string }[] = [];
    const glows: { element: UIElement; glow: string }[] = [];
    const backdropBlurs: { element: UIElement; blur: string }[] = [];
    const fontSizes: { element: UIElement; size: string }[] = [];
    const animations: { element: UIElement; animation: string }[] = [];

    const radiusCounts = new Map<number, number>();
    let aiColorHits = 0;

    for (const el of doc.all) {
      const styles = el.styles || {};
      const classStr = el.classes.join(' ').toLowerCase();

      // Gradients
      if (styles.gradient) {
        gradients.push({ element: el, gradient: styles.gradient });
      }

      // Border radius
      if (styles.radius !== undefined) {
        radii.push({ element: el, radius: styles.radius });
        radiusCounts.set(styles.radius, (radiusCounts.get(styles.radius) || 0) + 1);
      }

      // Shadows
      if (styles.shadow) {
        shadows.push({ element: el, shadow: styles.shadow });
      }

      // Spacing
      if (styles.padding) {
        spacings.push({ element: el, spacing: styles.padding });
      }
      if (styles.gap) {
        spacings.push({ element: el, spacing: styles.gap });
      }

      // Glows & blurs
      if (styles.backdropBlur || classStr.includes('blur-') || classStr.includes('shadow-[0_0_') || classStr.includes('drop-shadow(')) {
        const glow = styles.backdropBlur || styles.shadow || 'ambient-blur';
        glows.push({ element: el, glow });
      }
      if (styles.backdropBlur) {
        backdropBlurs.push({ element: el, blur: styles.backdropBlur });
      }

      // Font size
      if (styles.fontSize) {
        fontSizes.push({ element: el, size: styles.fontSize });
      }

      // Animation
      if (styles.animation) {
        animations.push({ element: el, animation: styles.animation });
      }

      // Colors & AI Palette tracking
      if (
        classStr.includes('purple') ||
        classStr.includes('violet') ||
        classStr.includes('indigo') ||
        classStr.includes('fuchsia') ||
        classStr.includes('cyan') ||
        (styles.background && /#8b5cf6|#6366f1|#a855f7|#06b6d4/i.test(styles.background))
      ) {
        aiColorHits++;
      }
    }

    // Radius monoculture check (e.g. 80%+ elements share the exact same radius, especially rounded-3xl or rounded-full)
    let radiusMonoculture = false;
    let predominantRadius: number | undefined;
    let maxRadiusCount = 0;
    for (const [r, count] of radiusCounts.entries()) {
      if (count > maxRadiusCount) {
        maxRadiusCount = count;
        predominantRadius = r;
      }
    }
    if (radii.length >= 6 && maxRadiusCount / radii.length >= 0.75) {
      radiusMonoculture = true;
    }

    const hasExcessiveRadii = radii.filter(r => r.radius >= 24).length >= 4;
    const hasGenericAiPalette = aiColorHits >= 3;

    return {
      colorPalette,
      gradients,
      radii,
      shadows,
      spacings,
      glows,
      backdropBlurs,
      fontSizes,
      animations,
      radiusMonoculture,
      predominantRadius,
      hasExcessiveRadii,
      hasGenericAiPalette,
    };
  }
}
