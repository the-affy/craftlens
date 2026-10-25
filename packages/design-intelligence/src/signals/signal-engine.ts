import {
  Signal,
  SourceLocation,
  createLocation,
  astEvidence,
  regexEvidence,
} from '@craftlens/core';
import { ParsedUIDocument } from '@craftlens/parser';
import { StyleAnalyzer, StyleAnalysisResult } from '../analyzer/style-analyzer.js';
import { PatternAnalyzer, PatternAnalysisResult } from '../analyzer/pattern-analyzer.js';

export interface ExtractedSignalsResult {
  signals: Signal[];
  signalsByType: Map<string, Signal[]>;
  counts: Record<string, number>;
}

export class SignalEngine {
  public static extract(doc: ParsedUIDocument): ExtractedSignalsResult {
    const signals: Signal[] = [];
    const filePath = doc.filePath;
    const topLocation: SourceLocation = doc.roots[0]?.range || createLocation(filePath, 1, 1, 0, 1, 20, 0);

    const styles: StyleAnalysisResult = StyleAnalyzer.analyze(doc);
    const patterns: PatternAnalysisResult = PatternAnalyzer.analyze(doc);

    // ─────────────────────────────────────────────────────────────
    // 1. CARDS & CONTAINERS
    // ─────────────────────────────────────────────────────────────
    const allCards = patterns.cards.cards;
    if (allCards.length > 0) {
      signals.push({
        id: `sig-cards-count-${allCards.length}`,
        type: 'card_count',
        source: 'dom',
        filePath,
        location: allCards[0].range || topLocation,
        value: allCards.length,
        evidence: astEvidence(`Detected ${allCards.length} card container(s)`, allCards[0].range || topLocation),
      });
    }

    if (patterns.cards.isVisuallyIdentical && allCards.length >= 3) {
      signals.push({
        id: 'sig-cards-identical',
        type: 'identical_card_anatomy',
        source: 'style',
        filePath,
        location: allCards[0].range || topLocation,
        value: true,
        evidence: {
          type: 'rule',
          explanation: `${allCards.length} cards share identical border, radius, and elevation structure.`,
        },
      });
    }

    if (patterns.cards.hasNestedCards) {
      for (const pair of patterns.cards.nestedPairs) {
        signals.push({
          id: `sig-nested-card-${pair.inner.id}`,
          type: 'nested_card',
          source: 'dom',
          filePath,
          location: pair.inner.range || topLocation,
          value: { outer: pair.outer.id, inner: pair.inner.id },
          evidence: astEvidence('Card container nested inside another card container', pair.inner.range || topLocation),
        });
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 2. RADII, SHADOWS, GRADIENTS, GLOWS, GLASS
    // ─────────────────────────────────────────────────────────────
    for (const g of styles.gradients) {
      signals.push({
        id: `sig-gradient-${g.element.id}`,
        type: 'gradient_usage',
        source: 'style',
        filePath,
        location: g.element.range || topLocation,
        value: g.gradient,
        evidence: regexEvidence(`Gradient: ${g.gradient}`, g.element.range || topLocation),
      });
    }

    for (const gl of styles.glows) {
      signals.push({
        id: `sig-glow-${gl.element.id}`,
        type: 'glow_usage',
        source: 'style',
        filePath,
        location: gl.element.range || topLocation,
        value: gl.glow,
        evidence: regexEvidence(`Ambient glow/blur: ${gl.glow}`, gl.element.range || topLocation),
      });
    }

    for (const bb of styles.backdropBlurs) {
      signals.push({
        id: `sig-glass-${bb.element.id}`,
        type: 'glass_morphism',
        source: 'style',
        filePath,
        location: bb.element.range || topLocation,
        value: bb.blur,
        evidence: astEvidence(`Backdrop blur / glassmorphism: ${bb.blur}`, bb.element.range || topLocation),
      });
    }

    const largeRadii = styles.radii.filter(r => r.radius >= 16);
    if (largeRadii.length > 0) {
      signals.push({
        id: `sig-large-radii-${largeRadii.length}`,
        type: 'large_radius',
        source: 'style',
        filePath,
        location: largeRadii[0].element.range || topLocation,
        value: largeRadii.map(r => r.radius),
        evidence: astEvidence(`${largeRadii.length} elements use large border radius (>=16px / pill)`, largeRadii[0].element.range || topLocation),
      });
    }

    if (styles.hasGenericAiPalette) {
      signals.push({
        id: 'sig-generic-palette',
        type: 'purple_indigo_palette',
        source: 'style',
        filePath,
        location: topLocation,
        value: 'purple/indigo/cyan',
        evidence: {
          type: 'rule',
          explanation: 'Default purple/indigo or violet color aesthetic detected across multiple elements.',
        },
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 3. BUTTONS & CTAs
    // ─────────────────────────────────────────────────────────────
    if (patterns.buttons.primaryButtons.length > 1) {
      signals.push({
        id: `sig-primary-buttons-${patterns.buttons.primaryButtons.length}`,
        type: 'multiple_primary_buttons',
        source: 'dom',
        filePath,
        location: patterns.buttons.primaryButtons[0].range || topLocation,
        value: patterns.buttons.primaryButtons.length,
        evidence: astEvidence(`${patterns.buttons.primaryButtons.length} primary CTA buttons present in the view`, patterns.buttons.primaryButtons[0].range || topLocation),
      });
    }

    for (const cta of patterns.buttons.genericCtas) {
      signals.push({
        id: `sig-generic-cta-${cta.element.id}`,
        type: 'generic_cta_text',
        source: 'text',
        filePath,
        location: cta.element.range || topLocation,
        value: cta.text,
        evidence: astEvidence(`Generic CTA phrase: "${cta.text}"`, cta.element.range || topLocation),
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 4. TYPOGRAPHY & HEADING HIERARCHY
    // ─────────────────────────────────────────────────────────────
    const headings = doc.findElementsByType('heading');
    const heroElements = patterns.heroSections;
    const hasHero = heroElements.length > 0 || doc.rawSource.toLowerCase().includes('hero');

    if (headings.length > 0) {
      const firstHeading = headings[0];
      const hClass = firstHeading.classes.join(' ').toLowerCase();
      const styleText = (firstHeading.attributes['style'] || '').toLowerCase();
      const parentStyle = (firstHeading.parent?.attributes?.['style'] || '').toLowerCase();
      const parentClass = (firstHeading.parent?.classes?.join(' ') || '').toLowerCase();
      const isCentered =
        hClass.includes('text-center') ||
        parentClass.includes('text-center') ||
        firstHeading.styles?.textAlign === 'center' ||
        firstHeading.parent?.styles?.textAlign === 'center' ||
        styleText.includes('center') ||
        parentStyle.includes('center') ||
        doc.rawSource.toLowerCase().includes('text-center') ||
        doc.rawSource.toLowerCase().includes("textalign: 'center'");

      const fontSizeNum = parseInt(firstHeading.styles?.fontSize || '0', 10);
      const isOversized =
        hClass.includes('text-5xl') ||
        hClass.includes('text-6xl') ||
        hClass.includes('text-7xl') ||
        hClass.includes('text-4xl') ||
        fontSizeNum >= 36 ||
        styleText.includes('72px') ||
        styleText.includes('64px') ||
        styleText.includes('48px') ||
        styleText.includes('40px');

      if (isCentered && isOversized) {
        signals.push({
          id: `sig-centered-hero-heading-${firstHeading.id}`,
          type: 'centered_oversized_heading',
          source: 'style',
          filePath,
          location: firstHeading.range || topLocation,
          value: firstHeading.content || 'Heading',
          evidence: astEvidence(`Centered oversized headline: "${firstHeading.content?.trim().substring(0, 40)}"`, firstHeading.range || topLocation),
        });
      }

      // Check heading hierarchy sizes
      const sizes = headings.map(h => h.styles?.fontSize || '').filter(Boolean);
      if (sizes.length >= 3 && new Set(sizes).size <= 1) {
        signals.push({
          id: 'sig-monotone-headings',
          type: 'monotone_heading_scale',
          source: 'style',
          filePath,
          location: headings[0].range || topLocation,
          value: sizes[0],
          evidence: astEvidence(`All ${headings.length} headings share nearly identical typography size (${sizes[0]})`, headings[0].range || topLocation),
        });
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 5. ICONS, SPARKLES, BADGES
    // ─────────────────────────────────────────────────────────────
    for (const sp of patterns.icons.sparkleIcons) {
      signals.push({
        id: `sig-sparkle-${sp.id}`,
        type: 'ai_sparkle_icon',
        source: 'dom',
        filePath,
        location: sp.range || topLocation,
        value: sp.content || 'sparkle',
        evidence: astEvidence('AI sparkle/stars decorative icon used as visual ornament', sp.range || topLocation),
      });
    }

    if (patterns.badges.allBadges.length >= 4) {
      signals.push({
        id: `sig-badge-saturation-${patterns.badges.allBadges.length}`,
        type: 'badge_saturation',
        source: 'dom',
        filePath,
        location: patterns.badges.allBadges[0].range || topLocation,
        value: patterns.badges.allBadges.length,
        evidence: astEvidence(`${patterns.badges.allBadges.length} status badge/pill containers scattered across layout`, patterns.badges.allBadges[0].range || topLocation),
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 6. CODE QUALITY, ACCESSIBILITY, SEMANTICS SIGNALS
    // ─────────────────────────────────────────────────────────────
    for (const el of doc.all) {
      const tag = el.tagName.toLowerCase();
      const hasOnClick = !!(el.attributes['onclick'] || el.attributes['on_click']);

      // Clickable div/span without role/tabindex
      if ((tag === 'div' || tag === 'span' || tag === 'a') && hasOnClick) {
        const hasRole = !!el.attributes['role'];
        const hasTabIndex = !!el.attributes['tabindex'];
        if (!hasRole && !hasTabIndex) {
          signals.push({
            id: `sig-clickable-noninteractive-${el.id}`,
            type: 'clickable_non_interactive',
            source: 'ast',
            filePath,
            location: el.range || topLocation,
            value: tag,
            evidence: astEvidence(`Clickable <${tag}> without semantic role="button" or tabIndex`, el.range || topLocation),
          });
        }
      }

      // Input without label
      if (tag === 'input' && el.attributes['type'] !== 'hidden') {
        const hasLabel = !!(el.attributes['aria-label'] || el.attributes['aria-labelledby'] || el.attributes['id']);
        if (!hasLabel) {
          signals.push({
            id: `sig-missing-label-${el.id}`,
            type: 'missing_form_label',
            source: 'ast',
            filePath,
            location: el.range || topLocation,
            value: tag,
            evidence: astEvidence('Input field without programmatic label or aria-label', el.range || topLocation),
          });
        }
      }

      // Icon-only button without accessible text
      if (tag === 'button') {
        const text = (el.content || '').trim();
        const hasAria = !!el.attributes['aria-label'];
        const hasIconChild = el.children.some(c => c.type === 'icon' || c.tagName.toLowerCase().includes('svg') || c.tagName.toLowerCase().includes('icon'));
        if (!text && hasIconChild && !hasAria) {
          signals.push({
            id: `sig-icon-button-name-${el.id}`,
            type: 'icon_button_missing_name',
            source: 'ast',
            filePath,
            location: el.range || topLocation,
            value: el.id,
            evidence: astEvidence('Icon button without accessible text label or aria-label', el.range || topLocation),
          });
        }
      }

      // Excessive visual treatments
      if (el.visualTreatmentScore && el.visualTreatmentScore >= 5) {
        signals.push({
          id: `sig-treatment-overload-${el.id}`,
          type: 'visual_treatment_overload',
          source: 'style',
          filePath,
          location: el.range || topLocation,
          value: el.visualTreatmentScore,
          evidence: astEvidence(`Component <${el.tagName}> accumulates ${el.visualTreatmentScore}/9 simultaneous visual styling treatments`, el.range || topLocation),
        });
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 7. RESPONSIVE BREAKPOINT & OVERFLOW BEHAVIOR
    // ─────────────────────────────────────────────────────────────
    for (const el of doc.all) {
      const classStr = el.classes.join(' ').toLowerCase();
      const stylesObj = el.styles || {};
      const match = classStr.match(/\bw-\[(\d+)px\]/);
      let pxWidth = 0;
      if (match) pxWidth = parseInt(match[1], 10);
      else if (stylesObj.width && /^\d+px$/.test(stylesObj.width)) pxWidth = parseInt(stylesObj.width, 10);

      if (pxWidth >= 800) {
        const hasResponsive = classStr.includes('max-w-') || classStr.includes('w-full') || classStr.includes('sm:') || classStr.includes('md:');
        if (!hasResponsive) {
          signals.push({
            id: `sig-fixed-overflow-${el.id}`,
            type: 'fixed_container_overflow',
            source: 'render',
            filePath,
            location: el.range || topLocation,
            value: pxWidth,
            evidence: astEvidence(`Container specifies fixed width of ${pxWidth}px without responsive fallback`, el.range || topLocation),
          });
        }
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 8. TEXT & BOILERPLATE SIGNALS
    // ─────────────────────────────────────────────────────────────
    const rawLower = doc.rawSource.toLowerCase();

    // Fake product signals
    const fakeRegex = /\b(99\.9%|10,000\+\s*users|4\.9\/5|2M\+\s*transactions|pulsing\s*green|fake\s*terminal)\b/i;
    const hasLiveBadge = patterns.badges.decorativeBadges.some(b => b.text.toLowerCase().includes('live'));
    if (fakeRegex.test(rawLower) && hasLiveBadge) {
      signals.push({
        id: 'sig-fake-metrics',
        type: 'unverified_social_proof',
        source: 'text',
        filePath,
        location: topLocation,
        value: '99.9% / 10k users / live',
        evidence: regexEvidence('Static vanity metric and decorative LIVE badge detected without dynamic backing data', topLocation),
      });
    }

    // Swap test generic phrases
    const genericPhrases = [
      'unlock your potential',
      'supercharge your workflow',
      'everything you need',
      'built for modern teams',
      'revolutionize your',
      'the next generation',
      'all in one platform',
    ];
    for (const phrase of genericPhrases) {
      if (rawLower.includes(phrase)) {
        signals.push({
          id: `sig-boilerplate-phrase-${phrase.replace(/\s+/g, '-')}`,
          type: 'generic_marketing_copy',
          source: 'text',
          filePath,
          location: topLocation,
          value: phrase,
          evidence: regexEvidence(`Boilerplate template phrase: "${phrase}"`, topLocation),
        });
      }
    }

    // Build signals map & counts
    const signalsByType = new Map<string, Signal[]>();
    const counts: Record<string, number> = {};
    for (const s of signals) {
      const list = signalsByType.get(s.type) || [];
      list.push(s);
      signalsByType.set(s.type, list);
      counts[s.type] = (counts[s.type] || 0) + 1;
    }

    return {
      signals,
      signalsByType,
      counts,
    };
  }
}
