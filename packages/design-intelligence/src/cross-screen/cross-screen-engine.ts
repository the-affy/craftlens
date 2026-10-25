import {
  Finding,
  SourceLocation,
  createLocation,
  astEvidence,
} from '@craftlens/core';
import { ParsedUIDocument } from '@craftlens/parser';
import { Pattern } from '@craftlens/core';

export interface ScreenDescriptor {
  filePath: string;
  route: string;
  isSettingsOrForm: boolean;
  sectionSequence: string[];
  visualRecipe: {
    hasHero: boolean;
    hasThreeCardGrid: boolean;
    hasGradient: boolean;
    hasGlow: boolean;
    hasDualCta: boolean;
    cardsCount: number;
  };
  primaryLocation: SourceLocation;
}

export class CrossScreenEngine {
  private static screenRegistry = new Map<string, ScreenDescriptor>();

  public static clear(): void {
    CrossScreenEngine.screenRegistry.clear();
  }

  public static registerScreen(doc: ParsedUIDocument, patterns: Pattern[]): ScreenDescriptor {
    const filePath = doc.filePath;
    const lower = doc.rawSource.toLowerCase();
    const topLoc = doc.roots[0]?.range || createLocation(filePath, 1, 1, 0, 1, 20, 0);

    // Determine route name
    let route = filePath.replace(/\\/g, '/');
    const routeMatch = route.match(/(?:pages|app|routes|views)\/(.+?)(?:\.[^.]+)?$/i);
    if (routeMatch) {
      route = '/' + routeMatch[1].replace(/\/index$|\/page$/, '');
    } else {
      route = '/' + (route.split('/').pop() || 'screen').replace(/\.[^.]+$/, '');
    }

    const isSettingsOrForm =
      lower.includes('setting') ||
      lower.includes('profile') ||
      lower.includes('account') ||
      lower.includes('preferences') ||
      lower.includes('form') ||
      doc.findElementsByType('input').length >= 3;

    const cardsCount = doc.findElementsByType('card').length;
    const hasHero = patterns.some(p => p.type === 'generic_saas_hero') || lower.includes('hero');
    const hasThreeCardGrid = cardsCount === 3 || patterns.some(p => p.type === 'template_fingerprint');
    const hasGradient = lower.includes('gradient');
    const hasGlow = lower.includes('glow') || lower.includes('blur-');
    const hasDualCta = patterns.some(p => p.type === 'generic_saas_hero' || p.signals.some(s => s.type === 'multiple_primary_buttons'));

    const sectionSequence: string[] = [];
    if (doc.findElementsByType('navigation').length > 0) sectionSequence.push('nav');
    if (hasHero) sectionSequence.push('hero');
    if (cardsCount > 0) sectionSequence.push(`${cardsCount}-cards`);
    if (lower.includes('cta') || lower.includes('call-to-action')) sectionSequence.push('cta');
    if (lower.includes('testimonial') || lower.includes('review')) sectionSequence.push('testimonials');

    const descriptor: ScreenDescriptor = {
      filePath,
      route,
      isSettingsOrForm,
      sectionSequence,
      visualRecipe: {
        hasHero,
        hasThreeCardGrid,
        hasGradient,
        hasGlow,
        hasDualCta,
        cardsCount,
      },
      primaryLocation: topLoc,
    };

    CrossScreenEngine.screenRegistry.set(filePath, descriptor);
    return descriptor;
  }

  public static detectCrossScreenConvergence(): Finding[] {
    const findings: Finding[] = [];
    const allScreens = Array.from(CrossScreenEngine.screenRegistry.values());

    if (allScreens.length < 2) {
      return findings;
    }

    // ─────────────────────────────────────────────────────────────
    // Check 1: Template Convergence Across Routes
    // Example: Landing, Pricing, About, Product all use Hero + 3 Cards + Dual CTA
    // ─────────────────────────────────────────────────────────────
    const templateConvergentScreens = allScreens.filter(s => {
      // Intentional design-system consistency: skip settings/form pages
      if (s.isSettingsOrForm) return false;
      const r = s.visualRecipe;
      return (r.hasHero && r.hasThreeCardGrid) || (r.hasGradient && r.hasGlow && r.cardsCount >= 3);
    });

    if (templateConvergentScreens.length >= 2) {
      const primary = templateConvergentScreens[0];
      const relatedLocations = templateConvergentScreens.map(s => s.primaryLocation);
      const affectedRoutes = templateConvergentScreens.map(s => s.route);
      const affectedFiles = templateConvergentScreens.map(s => s.filePath);

      findings.push({
        id: 'cross-screen-template-convergence',
        ruleId: 'UI-020',
        problemTitle: 'Template convergence across routes',
        title: 'Template convergence across routes',
        message: `${templateConvergentScreens.length} distinct screens repeat the identical template structure without content-specific variation.`,
        whatIsWrong: `Multiple routes (${affectedRoutes.join(', ')}) share the exact same template formula (Hero → 3 Feature Cards → CTA) rather than structuring each view around its specific user goal.`,
        summary: `Multiple routes (${affectedRoutes.join(', ')}) share the exact same template formula (Hero → 3 Feature Cards → CTA) rather than structuring each view around its specific user goal.`,
        whyItMatters: 'Applying the identical promotional template across distinct product screens creates visual monotony, blurs task boundaries, and signals low product specificity.',
        why: 'Applying the identical promotional template across distinct product screens creates visual monotony, blurs task boundaries, and signals low product specificity.',
        howToFix: 'Differentiate each screen by its unique task: allow pricing to emphasize tabular comparisons, product pages to showcase real workflows, and docs to prioritize rapid scanning.',
        recommendation: 'Differentiate each screen by its unique task: allow pricing to emphasize tabular comparisons, product pages to showcase real workflows, and docs to prioritize rapid scanning.',
        severity: 'warning',
        confidence: Math.min(0.96, 0.82 + templateConvergentScreens.length * 0.05),
        location: primary.primaryLocation,
        primaryLocation: primary.primaryLocation,
        relatedLocations,
        findingType: 'problem',
        category: 'hierarchy',
        clusterId: 'cross-screen-convergence',
        affectedFiles,
        route: affectedRoutes.join(', '),
        evidence: [
          astEvidence(`Repeated template anatomy detected across ${templateConvergentScreens.length} routes: ${affectedRoutes.join(', ')}`, primary.primaryLocation),
          {
            type: 'rule',
            explanation: `Routes share matching structure: ${primary.sectionSequence.join(' → ')}`,
          },
        ],
        verification: 'Verify that each route layout is tailored to its user task rather than repeating the boilerplate landing page grid.',
        falsePositiveNote: 'Legitimate design-system consistency (e.g. repeated form layout on settings pages) is preserved and not flagged.',
        supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
      });
    }

    return findings;
  }
}
