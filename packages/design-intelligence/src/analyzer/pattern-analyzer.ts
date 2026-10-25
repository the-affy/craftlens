import { UIElement } from '@craftlens/core';
import { ParsedUIDocument } from '@craftlens/parser';

export interface ComponentVisualFingerprint {
  radius: string;
  padding: string;
  shadow: string;
  border: string;
  background: string;
  iconTreatment?: string;
  structure: string;
}

export interface CardGroup {
  parentContainer?: UIElement;
  cards: UIElement[];
  fingerprintGroups: Map<string, UIElement[]>;
  isVisuallyIdentical: boolean;
  hasNestedCards: boolean;
  nestedPairs: { outer: UIElement; inner: UIElement }[];
  contentDensity: 'sparse' | 'normal' | 'dense';
}

export interface ButtonAnalysis {
  allButtons: UIElement[];
  primaryButtons: UIElement[];
  gradientPillButtons: UIElement[];
  genericCtas: { element: UIElement; text: string }[];
  competingPrimaryCtas: UIElement[][];
}

export interface BadgeAnalysis {
  allBadges: UIElement[];
  decorativeBadges: { element: UIElement; text: string }[];
  isSaturated: boolean;
}

export interface IconAnalysis {
  allIcons: UIElement[];
  sparkleIcons: UIElement[];
  ambientDecorations: UIElement[];
}

export interface CopyAnalysis {
  genericHypePhrases: { phrase: string; element?: UIElement }[];
  unverifiedSocialProof: { text: string; element?: UIElement }[];
  hasInterEverywhere: boolean;
}

export interface PatternAnalysisResult {
  cards: CardGroup;
  buttons: ButtonAnalysis;
  badges: BadgeAnalysis;
  icons: IconAnalysis;
  copy: CopyAnalysis;
  heroSections: UIElement[];
  metricCards: UIElement[];
  sidebars: UIElement[];
  tables: UIElement[];
  charts: UIElement[];
}

export class PatternAnalyzer {
  private static readonly GENERIC_CTA_WORDS = [
    'get started',
    'learn more',
    'try now',
    'explore',
    'discover',
    'unlock now',
    'unlock your potential',
    'start for free',
    'start free trial',
    'join now',
    'sign up today',
  ];

  private static readonly DECORATIVE_BADGE_WORDS = [
    'new',
    'pro',
    'ai',
    'beta',
    'live',
    'popular',
    'featured',
    'smart',
    'fast',
  ];

  public static computeElementFingerprint(el: UIElement): ComponentVisualFingerprint {
    const styles = el.styles || {};
    const classes = el.classes || [];
    const radius = styles.radius !== undefined ? `${styles.radius}px` : (classes.find(c => c.startsWith('rounded')) || 'none');
    const padding = styles.padding || (classes.find(c => c.startsWith('p-') || c.startsWith('px-') || c.startsWith('py-')) || 'none');
    const shadow = styles.shadow || (classes.find(c => c.startsWith('shadow')) || 'none');
    const border = styles.border || (classes.find(c => c.startsWith('border')) || 'none');
    const background = styles.background || styles.gradient || (classes.find(c => c.startsWith('bg-')) || 'none');
    const hasIcon = el.children.some(c => c.type === 'icon') || classes.some(c => c.includes('icon'));
    const structure = `${el.tagName}:${el.children.map(c => c.type).join('-')}`;

    return {
      radius,
      padding,
      shadow,
      border,
      background,
      iconTreatment: hasIcon ? 'has-icon' : 'none',
      structure,
    };
  }

  public static analyze(doc: ParsedUIDocument): PatternAnalysisResult {
    const rawCards = doc.findElementsByType('card');
    const metricCards = doc.findElementsByType('metric');
    const classCards = doc.all.filter(el => {
      const cls = el.classes.join(' ').toLowerCase();
      return (cls.includes('card') || cls.includes('surface') || cls.includes('panel') || cls.includes('box')) && !rawCards.includes(el) && !metricCards.includes(el);
    });
    const allCards = Array.from(new Set([...rawCards, ...metricCards, ...classCards]));

    const allButtons = doc.findElementsByType('button');
    const allBadges = doc.findElementsByType('badge');
    const allIcons = doc.findElementsByType('icon');
    const heroSections = doc.findElementsByType('hero');
    const tables = doc.findElementsByType('table');
    const charts = doc.findElementsByType('chart');

    // Also detect hero by class/id or h1 + button container
    if (heroSections.length === 0) {
      for (const el of doc.all) {
        const classStr = el.classes.join(' ').toLowerCase();
        const id = (el.attributes['id'] || '').toLowerCase();
        if (classStr.includes('hero') || id.includes('hero') || (el.tagName.toLowerCase() === 'section' && el.depth <= 2 && classStr.includes('gradient'))) {
          heroSections.push(el);
        }
      }
    }

    // 1. Card fingerprinting and visual similarity
    const nestedPairs: { outer: UIElement; inner: UIElement }[] = [];
    const fingerprintGroups = new Map<string, UIElement[]>();

    for (const card of allCards) {
      let curr = card.parent;
      while (curr) {
        if (curr.type === 'card' || allCards.includes(curr)) {
          nestedPairs.push({ outer: curr, inner: card });
          break;
        }
        curr = curr.parent;
      }

      const fp = PatternAnalyzer.computeElementFingerprint(card);
      const key = `${fp.radius}|${fp.padding}|${fp.shadow}|${fp.border}|${fp.background}`;
      const list = fingerprintGroups.get(key) || [];
      list.push(card);
      fingerprintGroups.set(key, list);
    }

    let isVisuallyIdentical = false;
    for (const group of fingerprintGroups.values()) {
      if (group.length >= 3 && group.length / Math.max(1, allCards.length) >= 0.5) {
        isVisuallyIdentical = true;
        break;
      }
    }

    // Check card content density (e.g. only label + value)
    let sparseCards = 0;
    for (const c of allCards) {
      if (c.children.length <= 2 && (!c.content || c.content.length < 30)) {
        sparseCards++;
      }
    }
    const contentDensity = sparseCards / Math.max(1, allCards.length) >= 0.6 ? 'sparse' : 'normal';

    const cardGroup: CardGroup = {
      cards: allCards,
      fingerprintGroups,
      isVisuallyIdentical,
      hasNestedCards: nestedPairs.length > 0,
      nestedPairs,
      contentDensity,
    };

    // 2. Button & CTA Analysis
    const primaryButtons: UIElement[] = [];
    const gradientPillButtons: UIElement[] = [];
    const genericCtas: { element: UIElement; text: string }[] = [];

    for (const btn of allButtons) {
      const text = (btn.content || '').toLowerCase().trim();
      const classStr = btn.classes.join(' ').toLowerCase();

      const isPrimary =
        classStr.includes('btn-primary') ||
        classStr.includes('bg-primary') ||
        classStr.includes('bg-purple') ||
        classStr.includes('bg-blue') ||
        classStr.includes('bg-indigo') ||
        classStr.includes('bg-black') ||
        classStr.includes('bg-white') ||
        classStr.includes('bg-gradient');

      if (isPrimary) {
        primaryButtons.push(btn);
      }

      const isPill = classStr.includes('rounded-full') || classStr.includes('rounded-3xl');
      const isGradient = classStr.includes('gradient') || Boolean(btn.styles?.gradient);
      if (isPill && (isGradient || classStr.includes('shadow-'))) {
        gradientPillButtons.push(btn);
      }

      for (const phrase of PatternAnalyzer.GENERIC_CTA_WORDS) {
        if (text.includes(phrase)) {
          genericCtas.push({ element: btn, text: btn.content || phrase });
          break;
        }
      }
    }

    const competingPrimaryCtas: UIElement[][] = [];
    const buttonsByParent = new Map<string, UIElement[]>();
    for (const pb of primaryButtons) {
      const pid = pb.parentId || 'root';
      const list = buttonsByParent.get(pid) || [];
      list.push(pb);
      buttonsByParent.set(pid, list);
    }
    for (const group of buttonsByParent.values()) {
      if (group.length >= 2) {
        competingPrimaryCtas.push(group);
      }
    }

    // 3. Badges Analysis
    const decorativeBadges: { element: UIElement; text: string }[] = [];
    for (const b of allBadges) {
      const text = (b.content || '').toLowerCase().trim();
      for (const phrase of PatternAnalyzer.DECORATIVE_BADGE_WORDS) {
        if (text === phrase || text.includes(phrase)) {
          decorativeBadges.push({ element: b, text: b.content || phrase });
          break;
        }
      }
    }
    const isSaturated = allBadges.length >= 6;

    // 4. Icons & Sparkles
    const sparkleIcons: UIElement[] = [];
    const ambientDecorations: UIElement[] = [];
    for (const icon of allIcons) {
      const classStr = icon.classes.join(' ').toLowerCase();
      const content = (icon.content || '').toLowerCase();
      if (
        classStr.includes('sparkle') ||
        classStr.includes('star') ||
        classStr.includes('magic') ||
        classStr.includes('ai') ||
        content.includes('✨') ||
        content.includes('★') ||
        content.includes('⚡')
      ) {
        sparkleIcons.push(icon);
      }
      if (classStr.includes('ambient') || classStr.includes('glow') || classStr.includes('float')) {
        ambientDecorations.push(icon);
      }
    }

    for (const el of doc.all) {
      if (el.content && el.content.includes('✨') && !sparkleIcons.includes(el)) {
        sparkleIcons.push(el);
      }
    }

    // 5. Copy & Typography Monoculture
    const lowerRaw = doc.rawSource.toLowerCase();
    const genericHypeWords = [
      'supercharge',
      'unlock',
      'seamless',
      'revolutionize',
      'transform',
      'next-generation',
      'next-gen',
      'powerful',
      'game-changing',
      'built for modern teams',
      'built for the future',
      'all in one platform',
      'everything you need',
    ];
    const genericHypePhrases: { phrase: string; element?: UIElement }[] = [];
    const unverifiedSocialProof: { text: string; element?: UIElement }[] = [];

    for (const phrase of genericHypeWords) {
      // Check actual element text content to avoid false-matching CSS properties like text-transform
      const matchedEl = doc.all.find(el => {
        const text = (el.content || '').toLowerCase();
        if (phrase === 'transform') {
          return /\btransform(?:ing)?\s+(?:your|the|workflows?|teams?|business|how)\b/i.test(text);
        }
        return text.includes(phrase);
      });
      if (matchedEl) {
        genericHypePhrases.push({ phrase, element: matchedEl });
      }
    }

    if (lowerRaw.includes('trusted by') || lowerRaw.includes('users trust') || lowerRaw.includes('innovative enterprises')) {
      const matchedEl = doc.all.find(el => (el.content || '').toLowerCase().includes('trusted by'));
      unverifiedSocialProof.push({ text: 'Trusted by social proof strip', element: matchedEl });
    }

    const hasInterEverywhere = lowerRaw.includes('inter') || lowerRaw.includes('family=inter') || lowerRaw.includes("font-['inter']");

    const copyAnalysis: CopyAnalysis = {
      genericHypePhrases,
      unverifiedSocialProof,
      hasInterEverywhere,
    };

    // Sidebars
    const sidebars = doc.all.filter(
      el => el.tagName.toLowerCase() === 'aside' || el.classes.join(' ').toLowerCase().includes('sidebar')
    );

    return {
      cards: cardGroup,
      buttons: {
        allButtons,
        primaryButtons,
        gradientPillButtons,
        genericCtas,
        competingPrimaryCtas,
      },
      badges: {
        allBadges,
        decorativeBadges,
        isSaturated,
      },
      icons: {
        allIcons,
        sparkleIcons,
        ambientDecorations,
      },
      copy: copyAnalysis,
      heroSections,
      metricCards,
      sidebars,
      tables,
      charts,
    };
  }
}
