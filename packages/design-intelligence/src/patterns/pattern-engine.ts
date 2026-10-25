import {
  Pattern,
  Signal,
  SourceLocation,
  Evidence,
  createLocation,
  astEvidence,
} from '@craftlens/core';
import { ParsedUIDocument } from '@craftlens/parser';
import { ExtractedSignalsResult } from '../signals/signal-engine.js';

export class PatternEngine {
  public static recognize(doc: ParsedUIDocument, signalResult: ExtractedSignalsResult): Pattern[] {
    const patterns: Pattern[] = [];
    const { signals, signalsByType } = signalResult;
    const filePath = doc.filePath;
    const topLocation: SourceLocation = doc.roots[0]?.range || createLocation(filePath, 1, 1, 0, 1, 20, 0);

    // Helpers to get signals
    const getSignals = (type: string): Signal[] => signalsByType.get(type) || [];
    const hasSignal = (type: string): boolean => (signalsByType.get(type)?.length || 0) > 0;

    // ─────────────────────────────────────────────────────────────
    // 1. GENERIC SAAS HERO PATTERN
    // ─────────────────────────────────────────────────────────────
    // Requires combination: centered oversized heading + (generic CTA or multiple primary) + (gradient or glow or pill)
    const heroHeadings = getSignals('centered_oversized_heading');
    const genericCtas = getSignals('generic_cta_text');
    const gradients = getSignals('gradient_usage');
    const glows = getSignals('glow_usage');
    const glass = getSignals('glass_morphism');
    const multipleCtas = getSignals('multiple_primary_buttons');
    const badges = getSignals('badge_saturation');

    const heroEvidenceSignals: Signal[] = [];
    if (heroHeadings.length > 0) heroEvidenceSignals.push(...heroHeadings);
    if (genericCtas.length > 0) heroEvidenceSignals.push(...genericCtas);
    if (gradients.length > 0) heroEvidenceSignals.push(gradients[0]);
    if (glows.length > 0) heroEvidenceSignals.push(glows[0]);
    if (multipleCtas.length > 0) heroEvidenceSignals.push(multipleCtas[0]);
    if (badges.length > 0) heroEvidenceSignals.push(badges[0]);

    // Do NOT flag because of 1 signal alone. Requires at least 3 corroborating signals:
    if (heroEvidenceSignals.length >= 3 && heroHeadings.length > 0) {
      patterns.push({
        id: 'pat-generic-saas-hero',
        type: 'generic_saas_hero',
        scope: 'section',
        confidence: Math.min(0.95, 0.70 + heroEvidenceSignals.length * 0.06),
        signals: heroEvidenceSignals,
        evidence: heroEvidenceSignals.map(s => s.evidence),
        description: 'Centered oversized headline combined with dual generic CTAs and ambient gradient/glow decorative styling.',
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 2. CARD SOUP PATTERN
    // ─────────────────────────────────────────────────────────────
    const cardCountSig = getSignals('card_count');
    const identicalCardsSig = getSignals('identical_card_anatomy');
    const nestedCardsSig = getSignals('nested_card');
    const cardCount = cardCountSig.length > 0 ? (cardCountSig[0].value as number) : 0;

    if (cardCount >= 4) {
      const cardSignals: Signal[] = [...cardCountSig];
      if (identicalCardsSig.length > 0) cardSignals.push(...identicalCardsSig);
      if (nestedCardsSig.length > 0) cardSignals.push(...nestedCardsSig);

      patterns.push({
        id: 'pat-card-soup',
        type: 'card_soup',
        scope: 'page',
        confidence: cardCount >= 6 ? 0.94 : 0.86,
        signals: cardSignals,
        evidence: cardSignals.map(s => s.evidence),
        description: `${cardCount} card containers dominate the layout, equalizing visual importance across different content types.`,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 3. VISUAL TREATMENT OVERLOAD PATTERN
    // ─────────────────────────────────────────────────────────────
    const overloadSignals = getSignals('visual_treatment_overload');
    if (overloadSignals.length > 0) {
      patterns.push({
        id: 'pat-visual-treatment-overload',
        type: 'visual_treatment_overload',
        scope: 'component',
        confidence: 0.89,
        signals: overloadSignals,
        evidence: overloadSignals.map(s => s.evidence),
        description: 'Components accumulate high counts of concurrent visual treatments (border + shadow + gradient + glow + radius + badge).',
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 4. TEMPLATE FINGERPRINT PATTERN
    // ─────────────────────────────────────────────────────────────
    // Detect combinations of Hero + 3-card grid + CTA
    const hasCards = cardCount >= 3;
    const hasGenericCta = genericCtas.length > 0;
    const hasHeroHeading = heroHeadings.length > 0 || doc.rawSource.toLowerCase().includes('hero');

    if (hasHeroHeading && hasCards && hasGenericCta) {
      const templateSignals: Signal[] = [];
      if (heroHeadings.length > 0) templateSignals.push(heroHeadings[0]);
      if (cardCountSig.length > 0) templateSignals.push(cardCountSig[0]);
      if (genericCtas.length > 0) templateSignals.push(genericCtas[0]);

      patterns.push({
        id: 'pat-template-fingerprint',
        type: 'template_fingerprint',
        scope: 'page',
        confidence: 0.92,
        signals: templateSignals,
        evidence: templateSignals.map(s => s.evidence),
        description: 'Page structure follows standard AI template layout sequence (Hero → 3 Feature Cards → Generic CTA).',
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 5. AI-STYLE VISUAL SIGNATURE PATTERN
    // ─────────────────────────────────────────────────────────────
    // Multiple visual hallmarks: purple/indigo, glow/aura, sparkles, repetitive cards, generic CTA
    const aiSignatureSignals: Signal[] = [];
    const purpleSig = getSignals('purple_indigo_palette');
    const sparkleSig = getSignals('ai_sparkle_icon');

    if (purpleSig.length > 0) aiSignatureSignals.push(purpleSig[0]);
    if (gradients.length > 0) aiSignatureSignals.push(gradients[0]);
    if (glows.length > 0) aiSignatureSignals.push(glows[0]);
    if (hasCards && cardCountSig.length > 0) aiSignatureSignals.push(cardCountSig[0]);
    if (genericCtas.length > 0) aiSignatureSignals.push(genericCtas[0]);
    if (sparkleSig.length > 0) aiSignatureSignals.push(sparkleSig[0]);

    if (aiSignatureSignals.length >= 3) {
      patterns.push({
        id: 'pat-ai-signature-stack',
        type: 'ai_signature_stack',
        scope: 'page',
        confidence: Math.min(0.96, 0.74 + aiSignatureSignals.length * 0.04),
        signals: aiSignatureSignals,
        evidence: aiSignatureSignals.map(s => s.evidence),
        // Requirement 4 & 7: MUST say "Strong template-like visual pattern", NOT "AI-generated"
        description: 'Strong template-like visual pattern combining ambient gradients, glowing aura, repetitive rounded containers, and generic calls-to-action.',
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 6. TREND STACKING PATTERN
    // ─────────────────────────────────────────────────────────────
    const trendFeatures: Signal[] = [];
    if (gradients.length > 0) trendFeatures.push(gradients[0]);
    if (glows.length > 0) trendFeatures.push(glows[0]);
    if (glass.length > 0) trendFeatures.push(glass[0]);
    const largeRadii = getSignals('large_radius');
    if (largeRadii.length > 0) trendFeatures.push(largeRadii[0]);

    if (trendFeatures.length >= 3) {
      patterns.push({
        id: 'pat-trend-stacking',
        type: 'trend_stacking',
        scope: 'page',
        confidence: 0.91,
        signals: trendFeatures,
        evidence: trendFeatures.map(s => s.evidence),
        description: 'Simultaneous accumulation of multiple decorative visual trends (gradients + glow + glassmorphism + large radius).',
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 7. WEAK VISUAL HIERARCHY PATTERN
    // ─────────────────────────────────────────────────────────────
    const monotoneHeadings = getSignals('monotone_heading_scale');
    if (cardCount >= 4 && (monotoneHeadings.length > 0 || multipleCtas.length > 0 || identicalCardsSig.length > 0)) {
      const hierarchySignals: Signal[] = [];
      if (cardCountSig.length > 0) hierarchySignals.push(cardCountSig[0]);
      if (monotoneHeadings.length > 0) hierarchySignals.push(monotoneHeadings[0]);
      if (multipleCtas.length > 0) hierarchySignals.push(multipleCtas[0]);

      patterns.push({
        id: 'pat-weak-hierarchy',
        type: 'weak_visual_hierarchy',
        scope: 'page',
        confidence: 0.90,
        signals: hierarchySignals,
        evidence: hierarchySignals.map(s => s.evidence),
        description: 'Primary headlines, supporting cards, and interactive actions share equal visual weight without clear focal anchors.',
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 8. RESPONSIVE OVERFLOW PATTERN
    // ─────────────────────────────────────────────────────────────
    const overflowSigs = getSignals('fixed_container_overflow');
    if (overflowSigs.length > 0) {
      patterns.push({
        id: 'pat-responsive-overflow',
        type: 'responsive_overflow',
        scope: 'component',
        confidence: 0.93,
        signals: overflowSigs,
        evidence: overflowSigs.map(s => s.evidence),
        description: 'Fixed container widths exceed mobile viewport boundaries without responsive fluid fallback.',
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 9. BADGE SATURATION PATTERN
    // ─────────────────────────────────────────────────────────────
    const badgeSigs = getSignals('badge_saturation');
    if (badgeSigs.length > 0) {
      patterns.push({
        id: 'pat-badge-saturation',
        type: 'badge_saturation',
        scope: 'page',
        confidence: 0.89,
        signals: badgeSigs,
        evidence: badgeSigs.map(s => s.evidence),
        description: 'High volume of status badges and pills dilutes user attention for actual critical system states.',
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 10. UNVERIFIED SOCIAL PROOF / FAKE PRODUCT SIGNALS
    // ─────────────────────────────────────────────────────────────
    const fakeMetricsSigs = getSignals('unverified_social_proof');
    if (fakeMetricsSigs.length > 0) {
      patterns.push({
        id: 'pat-fake-product-signals',
        type: 'fake_product_signals',
        scope: 'section',
        confidence: 0.85,
        signals: fakeMetricsSigs,
        evidence: fakeMetricsSigs.map(s => s.evidence),
        description: 'Static placeholder metrics and cosmetic LIVE indicators present without verifiable product backing.',
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 11. SWAP TEST PATTERN (GENERIC MARKETING COPY)
    // ─────────────────────────────────────────────────────────────
    const boilerplateCopySigs = getSignals('generic_marketing_copy');
    if (boilerplateCopySigs.length > 0 && (hasHeroHeading || hasCards) && hasGenericCta) {
      patterns.push({
        id: 'pat-swap-test-failure',
        type: 'swap_test_failure',
        scope: 'page',
        confidence: 0.87,
        signals: boilerplateCopySigs,
        evidence: boilerplateCopySigs.map(s => s.evidence),
        description: 'Marketing copy and page composition could be swapped for a generic competitor without requiring meaningful changes.',
      });
    }

    return patterns;
  }
}
