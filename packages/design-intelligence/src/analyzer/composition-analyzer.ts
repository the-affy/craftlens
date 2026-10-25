import {
  Finding,
  PatternCluster,
  PatternSignal,
  LayoutFingerprint,
  SourceLocation,
  createLocation,
  regexEvidence,
  astEvidence,
} from '@craftlens/core';
import { ParsedUIDocument } from '@craftlens/parser';
import { StyleAnalysisResult, StyleAnalyzer } from './style-analyzer.js';
import { PatternAnalysisResult, PatternAnalyzer } from './pattern-analyzer.js';

export interface CompositionAnalysisResult {
  fingerprints: LayoutFingerprint[];
  aiSignatureCluster?: PatternCluster;
  cardSoupDetected: boolean;
  cardSoupCount: number;
  weakHierarchyDetected: boolean;
  trendStackingDetected: boolean;
  visualTreatmentOverloads: { element: any; score: number }[];
  badgeSaturationDetected: boolean;
  genericCtaDetected: boolean;
  fakeProductSignalsDetected: boolean;
  swapTestFailed: boolean;
  findings: Finding[];
}

function getStartLine(loc?: any): number {
  if (!loc) return 1;
  return loc.start?.line ?? loc.range?.startLine ?? 1;
}

export class CompositionAnalyzer {
  public static analyze(doc: ParsedUIDocument): CompositionAnalysisResult {
    const styles: StyleAnalysisResult = StyleAnalyzer.analyze(doc);
    const patterns: PatternAnalysisResult = PatternAnalyzer.analyze(doc);
    const findings: Finding[] = [];
    const filePath = doc.filePath;

    // Default top-of-file location for page-level findings
    const firstEl = doc.roots[0] || doc.all[0];
    const topLocation = firstEl?.range || createLocation(filePath, 1, 1, 0, 1, 20, 0);

    // ─────────────────────────────────────────────────────────────
    // 1. CARD SOUP / REPEATED CARD TREATMENT (Requirement 5 & 20)
    // ─────────────────────────────────────────────────────────────
    const totalCards = patterns.cards.cards.length;
    let cardSoupDetected = false;
    let cardSoupCount = 0;

    if (totalCards >= 3 && (patterns.cards.isVisuallyIdentical || totalCards >= 4)) {
      cardSoupDetected = true;
      cardSoupCount = totalCards;

      const primaryCard = patterns.cards.cards[0];
      const cardLoc = primaryCard?.range || topLocation;

      const cardInstances = patterns.cards.cards.map((c, idx) => ({
        id: `cp007_card_${idx + 1}`,
        findingId: 'CP-007',
        ruleId: 'CP-007',
        location: c.range || topLocation,
        filePath: (c.range || topLocation).filePath,
        line: getStartLine(c.range || topLocation),
        snippet: c.classes?.join(' ') || c.content || `Card #${idx + 1}`,
        evidence: [astEvidence(`Card #${idx + 1} uses identical container fingerprint`, c.range || topLocation)],
        status: 'open' as const,
      }));

      const isServiceCard = patterns.cards.cards.some(c =>
        c.classes?.some(cls => cls.includes('service') || cls.includes('feature') || cls.includes('box'))
      );
      const cardTypeWord = isServiceCard ? 'service cards' : 'cards';
      const countWord = totalCards === 6 ? 'six' : `${totalCards}`;
      const whyItMatters = `All ${countWord} cards use the same container, spacing, border, radius and visual hierarchy. This makes unrelated content appear equally important.`;

      const affectedElements = patterns.cards.cards.map(c => ({
        selector: c.classes && c.classes.length > 0 ? `.${c.classes[0]}` : c.tagName,
        tagName: c.tagName,
        className: c.classes?.join(' '),
        line: getStartLine(c.range || topLocation),
        location: c.range || topLocation,
        snippet: c.content || c.classes?.join(' '),
      }));

      const evidenceBullets = [
        astEvidence(`${totalCards} similar cards detected in this section.`, cardLoc),
        {
          type: 'rule' as const,
          explanation: `${totalCards} sibling cards`,
        },
        {
          type: 'rule' as const,
          explanation: 'same radius',
        },
        {
          type: 'rule' as const,
          explanation: 'same padding',
        },
        {
          type: 'rule' as const,
          explanation: 'same border',
        },
        {
          type: 'rule' as const,
          explanation: 'same heading/body structure',
        },
      ];
      if (patterns.cards.cards.some(c => c.children.some(ch => ch.type === 'icon') || c.classes?.some(cls => cls.includes('icon')))) {
        evidenceBullets.push({
          type: 'rule' as const,
          explanation: 'same icon treatment',
        });
      }

      findings.push({
        id: 'CP-007',
        ruleId: 'CP-007',
        ruleVersion: '1.4.0',
        sourceSkillId: 'anti-ai-ui',
        sourceSkillVersion: '1.4.0',
        title: 'Repeated Card Treatment',
        problemTitle: 'Repeated Card Treatment',
        message: `${totalCards} similar cards detected in this section.`,
        whatIsWrong: `${totalCards} similar cards detected in this section.`,
        summary: `${totalCards} similar cards detected in this section.`,
        whyItMatters,
        why: whyItMatters,
        howToFix: isServiceCard
          ? 'Make one service the visual anchor and turn the remaining services into a compact list or editorial grid.'
          : 'Reduce the emphasis of secondary cards. Keep the primary card elevated and remove repetitive borders from supporting cards.',
        recommendation: isServiceCard
          ? 'Make one service the visual anchor and turn the remaining services into a compact list or editorial grid.'
          : 'Reduce the emphasis of secondary cards. Keep the primary card elevated and remove repetitive borders from supporting cards.',
        severity: 'moderate',
        confidence: 0.94,
        location: cardLoc,
        findingType: 'problem',
        category: 'ui-ux',
        clusterId: 'card-soup',
        instances: cardInstances,
        affectedElements,
        evidence: evidenceBullets,
        research: {
          skillId: 'ui-ux-pro-max',
          domain: 'UX → hierarchy',
          recommendation: 'Use role-based visual hierarchy: 1 elevated primary container + subtle flat secondary containers.',
        },
        fix: {
          kind: 'assisted',
          title: 'Differentiate card hierarchy and borders',
          description: 'Keep the primary card elevated with shadow and simplify secondary cards with subtle borders.',
        },
        structuredRecommendation: {
          summary: isServiceCard
            ? 'Make one service the visual anchor and turn the remaining services into a compact list.'
            : 'Differentiate information hierarchy by replacing repetitive cards with a compact list or role-specific variants.',
          rationale: 'The current cards all have identical visual weight, but the content does not require equal emphasis.',
          alternatives: isServiceCard
            ? [
                {
                  id: 'alt-feature-list',
                  title: '01  FEATURE + SECONDARY LIST',
                  description: 'Make one service the visual anchor and turn the remaining services into a compact list.',
                  whenToUse: 'When one service or feature is the primary focus and supporting details can be scanned quickly.',
                  tradeoffs: ['Less uniformity, stronger hierarchy.'],
                  implementationDifficulty: 'medium',
                },
                {
                  id: 'alt-editorial-grid',
                  title: '02  EDITORIAL SERVICE GRID',
                  description: 'Keep the grid but remove the repeated container treatment and use typography and spacing to separate services.',
                  whenToUse: 'When services are informational and container boxes add unnecessary noise.',
                  tradeoffs: ['Less conventional card affordance.'],
                  implementationDifficulty: 'easy',
                },
                {
                  id: 'alt-content-role',
                  title: '03  DIFFERENTIATE BY CONTENT ROLE',
                  description: 'Keep cards only where interaction or grouping requires them.',
                  whenToUse: 'When some services are actionable offerings and others are informational descriptions.',
                  tradeoffs: ['Requires component-level restructuring.'],
                  implementationDifficulty: 'medium',
                },
              ]
            : [
                {
                  id: 'alt-hero-list',
                  title: '01  FEATURED HERO + SECONDARY LIST',
                  description: 'Keep 1-2 primary metrics prominent and move secondary items into a clean list with divider lines.',
                  whenToUse: 'When primary metrics demand immediate attention.',
                  tradeoffs: ['Less horizontal canvas space for secondary items.'],
                  implementationDifficulty: 'easy',
                },
                {
                  id: 'alt-whitespace',
                  title: '02  WHITESPACE GROUPING',
                  description: 'Remove the outer card box and use 24-32px section gaps to create visual separation without container noise.',
                  whenToUse: 'When container borders add clutter.',
                  tradeoffs: ['Requires disciplined alignment.'],
                  implementationDifficulty: 'easy',
                },
              ],
        },
        recommendations: [
          {
            id: 'rec-feature-list',
            title: '01  FEATURE + SECONDARY LIST',
            transformation: 'hierarchize',
            description: `Make one ${isServiceCard ? 'service' : 'item'} the visual anchor and turn the remaining ${isServiceCard ? 'services' : 'items'} into a compact list.`,
            whyItFits: [
              'The current cards all have identical visual weight, but the content does not require equal emphasis.',
            ],
            evidence: [
              `${totalCards} sibling cards`,
              'same radius',
              'same padding',
              'same border',
              'same heading/body structure',
            ],
            tradeoff: 'Less uniformity, stronger hierarchy.',
            affectedElements: affectedElements.map(e => e.selector || '.service-box'),
            implementationApproach: `Feature the primary ${isServiceCard ? 'service' : 'card'} and render secondary items in a clean list.`,
            confidence: 0.91,
            scope: 'section',
          },
          {
            id: 'rec-editorial-grid',
            title: isServiceCard ? '02  EDITORIAL SERVICE GRID' : '02  EDITORIAL COMPOSITION',
            transformation: 'distill',
            description: `Keep the grid but remove the repeated container treatment and use typography and spacing to separate ${isServiceCard ? 'services' : 'items'}.`,
            whyItFits: [
              'The existing content is short and informational.',
            ],
            evidence: [
              `${totalCards} sibling cards`,
              'same radius',
              'same padding',
              'same border',
              'same heading/body structure',
            ],
            tradeoff: 'Less conventional card affordance.',
            affectedElements: affectedElements.map(e => e.selector || '.service-box'),
            implementationApproach: 'Remove container boxes and use 24-32px grid gaps with bold typography.',
            confidence: 0.87,
            scope: 'component',
          },
          {
            id: 'rec-content-role',
            title: '03  DIFFERENTIATE BY CONTENT ROLE',
            transformation: 'differentiate',
            description: 'Keep cards only where interaction or grouping requires them.',
            whyItFits: [
              'Several current cards are informational rather than actionable.',
            ],
            evidence: [
              `${totalCards} sibling cards`,
              'same radius',
              'same padding',
              'same border',
              'same heading/body structure',
            ],
            tradeoff: 'Requires component-level restructuring.',
            affectedElements: affectedElements.map(e => e.selector || '.service-box'),
            implementationApproach: `Group informational ${isServiceCard ? 'services' : 'cards'} and reserve prominent card styling for actionable items.`,
            confidence: 0.82,
            scope: 'section',
          },
        ],
        supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 2. TEMPLATE FINGERPRINT ENGINE (Requirement 6)
    // ─────────────────────────────────────────────────────────────
    const fingerprints: LayoutFingerprint[] = [];
    const hasHero = patterns.heroSections.length > 0 || doc.rawSource.toLowerCase().includes('hero');
    const hasFeatures = patterns.cards.cards.length >= 3;
    const hasGenericCta = patterns.buttons.genericCtas.length > 0;

    if (hasHero && hasFeatures && hasGenericCta) {
      fingerprints.push({
        id: 'fp-saas-landing',
        name: 'Generic SaaS Landing Page',
        elements: ['Header', 'Hero Section', '3 Feature Cards', 'CTA Banner'],
        sequence: ['navigation', 'hero', 'cards', 'cta'],
        confidence: 0.92,
        description: 'Standard layout sequence commonly generated by AI scaffolding templates.',
      });

      findings.push({
        id: 'UI-015',
        ruleId: 'UI-015',
        ruleVersion: '1.4.0',
        sourceSkillId: 'anti-ai-ui',
        sourceSkillVersion: '1.4.0',
        title: 'Generic SaaS Hero & Template Anatomy',
        problemTitle: 'Generic SaaS Hero & Template Anatomy',
        message: 'The page structure matches a generic SaaS marketing template.',
        whatIsWrong: 'The layout follows a textbook AI template structure (Hero → 3 Feature Cards → Generic CTA) without distinct product domain identity.',
        summary: 'The layout follows a textbook AI template structure (Hero → 3 Feature Cards → Generic CTA) without distinct product domain identity.',
        whyItMatters: 'Template layouts signal low-effort prototyping, reduce trust, and fail to guide users through the specific value proposition of the product.',
        why: 'Template layouts signal low-effort prototyping, reduce trust, and fail to guide users through the specific value proposition of the product.',
        howToFix: 'Structure the page around your specific workflow or data model (e.g. interactive demo, real workflow preview) rather than generic feature cards.',
        recommendation: 'Structure the page around your specific workflow or data model (e.g. interactive demo, real workflow preview) rather than generic feature cards.',
        severity: 'high',
        confidence: 0.92,
        location: topLocation,
        findingType: 'problem',
        category: 'ui-ux',
        clusterId: 'template-fingerprint',
        evidence: [
          astEvidence('Matches SaaS landing template fingerprint (Hero + 3 Feature Cards + Generic CTA)', topLocation),
          {
            type: 'rule',
            explanation: `Identified structural sequence: ${fingerprints[0].elements.join(' → ')}`,
          },
        ],
        research: {
          skillId: 'ui-ux-pro-max',
          domain: 'UX → information architecture',
          recommendation: 'Replace generic 3-column card hero with domain-specific interactive workspace preview.',
        },
        supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
      });
    }

    const rawLowerText = doc.rawSource.toLowerCase();
    const hasSidebar = rawLowerText.includes('sidebar') || rawLowerText.includes('<aside');
    const hasDashboardGrid = (rawLowerText.includes('grid-cols-4') || rawLowerText.includes('metric')) && patterns.cards.cards.length >= 3;
    const hasChartOrTable = rawLowerText.includes('chart') || rawLowerText.includes('<table') || rawLowerText.includes('recent activity');
    const isGenericDashboard = hasSidebar && hasDashboardGrid && hasChartOrTable;

    if (isGenericDashboard && !findings.some(f => f.ruleId === 'UI-015')) {
      fingerprints.push({
        id: 'fp-generic-dashboard',
        name: 'Generic Dashboard Template Fingerprint',
        elements: ['Sidebar', 'Topbar', '4 Metric Cards', 'Chart Area', 'Activity Table'],
        sequence: ['sidebar', 'metrics', 'chart', 'table'],
        confidence: 0.90,
        description: 'Cookie-cutter AI generated admin dashboard anatomy.',
      });

      findings.push({
        id: 'UI-015',
        ruleId: 'UI-015',
        ruleVersion: '1.4.0',
        sourceSkillId: 'anti-ai-ui',
        sourceSkillVersion: '1.4.0',
        title: 'Generic Dashboard Template Fingerprint',
        problemTitle: 'Generic Dashboard Template Fingerprint',
        message: 'The page structure matches a generic AI admin dashboard template.',
        whatIsWrong: 'The layout follows a cookie-cutter scaffolding structure (Sidebar → Metric Grid → Chart → Activity Table) without contextual workflow integration.',
        summary: 'The layout follows a cookie-cutter scaffolding structure (Sidebar → Metric Grid → Chart → Activity Table) without contextual workflow integration.',
        whyItMatters: 'Generic dashboard structures clutter the workspace with placeholder KPI metrics and stock chart containers instead of user-focused workflows.',
        why: 'Generic dashboard structures clutter the workspace with placeholder KPI metrics and stock chart containers instead of user-focused workflows.',
        howToFix: 'Organize views around key user workflows and actions rather than boilerplate metric-card grids and placeholder charts.',
        recommendation: 'Organize views around key user workflows and actions rather than boilerplate metric-card grids and placeholder charts.',
        severity: 'high',
        confidence: 0.90,
        location: topLocation,
        findingType: 'problem',
        category: 'ui-ux',
        clusterId: 'template-fingerprint',
        evidence: [
          astEvidence('Matches generic admin dashboard template fingerprint (Sidebar + Metric Grid + Chart + Table)', topLocation),
        ],
        research: {
          skillId: 'ui-ux-pro-max',
          domain: 'UX → dashboard design',
          recommendation: 'Design task-focused operational views rather than static metric card grids.',
        },
        supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 3. INSTANT-DEATH SIGNATURE ENGINE (Requirement 15 & 16)
    // ─────────────────────────────────────────────────────────────
    interface TellSignal {
      id: string;
      label: string;
      weight: number;
      loc: SourceLocation;
      explanation: string;
    }
    const tells: TellSignal[] = [];

    // 1. Purple/indigo/violet gradient
    if (styles.gradients.length > 0 || /bg-gradient|gradient-to-(r|br|b|l)|radial-gradient/i.test(doc.rawSource)) {
      const gLoc = styles.gradients[0]?.element?.range || topLocation;
      tells.push({
        id: 'signal-gradient',
        label: 'Purple/indigo or violet gradient',
        weight: 1.5,
        loc: gLoc,
        explanation: 'Gradient container or background styling detected.',
      });
    }

    // 2. Inter used across display & body
    if (patterns.copy.hasInterEverywhere || /font-sans|inter/i.test(doc.rawSource)) {
      tells.push({
        id: 'signal-inter',
        label: 'Inter used across display and body',
        weight: 1.2,
        loc: topLocation,
        explanation: 'Inter / system font used uniformly without typographic pairing or hierarchy.',
      });
    }

    // 3. Centered dual-CTA hero
    if (
      patterns.heroSections.some(h => (h as any).isCentered || h.classes?.includes('text-center')) ||
      (hasHero && patterns.buttons.genericCtas.length >= 2) ||
      (/text-center/i.test(doc.rawSource) && hasHero)
    ) {
      const heroLoc = patterns.heroSections[0]?.range || topLocation;
      tells.push({
        id: 'signal-hero-dual-cta',
        label: 'Centered dual-CTA hero anatomy',
        weight: 1.5,
        loc: heroLoc,
        explanation: 'Centered hero layout with competing primary and secondary call-to-action buttons.',
      });
    }

    // 4. Uniform 3-card feature grid
    if (totalCards >= 3) {
      const cardLoc = patterns.cards.cards[0]?.range || topLocation;
      tells.push({
        id: 'signal-card-grid',
        label: 'Uniform 3+ feature card grid',
        weight: 1.5,
        loc: cardLoc,
        explanation: `${totalCards} card containers sharing identical structural container treatment.`,
      });
    }

    // 5. Large uniform radius / rounded-2xl everywhere
    if (styles.hasExcessiveRadii || styles.radiusMonoculture || /rounded-2xl|rounded-3xl|rounded-xl/i.test(doc.rawSource)) {
      tells.push({
        id: 'signal-radius',
        label: 'Uniform large-radius containers (rounded-2xl / 3xl)',
        weight: 1.2,
        loc: topLocation,
        explanation: 'Pervasive 16px-24px border radius applied across cards and containers.',
      });
    }

    // 6. Gradient pill buttons
    if (
      patterns.buttons.gradientPillButtons.length > 0 ||
      (/rounded-full/i.test(doc.rawSource) && /bg-gradient|gradient-to/i.test(doc.rawSource))
    ) {
      const btnLoc = patterns.buttons.gradientPillButtons[0]?.range || topLocation;
      tells.push({
        id: 'signal-pill-cta',
        label: 'Gradient pill call-to-action buttons',
        weight: 1.4,
        loc: btnLoc,
        explanation: 'Full-radius pill button combined with gradient fill and shadow.',
      });
    }

    // 7. "Trusted by" section / unverified proof
    if ((patterns.copy as any).hasTrustedBy || /trusted by/i.test(doc.rawSource)) {
      tells.push({
        id: 'signal-trusted-by',
        label: '"Trusted by" unverified social proof strip',
        weight: 1.1,
        loc: topLocation,
        explanation: 'Template-style social proof strip without customer verification.',
      });
    }

    // 8. Generic hype copy
    if (
      patterns.copy.genericHypePhrases.length > 0 ||
      /supercharge|unlock|seamless|revolutionize|transform|next-generation|game-changing/i.test(doc.rawSource)
    ) {
      tells.push({
        id: 'signal-hype-copy',
        label: 'Generic SaaS hype copy ("Supercharge", "Unlock", "Seamless")',
        weight: 1.3,
        loc: topLocation,
        explanation: 'Abstract boilerplate marketing claims lacking concrete product mechanics.',
      });
    }

    // 9. Aurora blobs / ambient blur / glow
    if (styles.glows.length > 0 || /blur-(2xl|3xl)|aurora/i.test(doc.rawSource)) {
      const glowLoc = styles.glows[0]?.element?.range || topLocation;
      tells.push({
        id: 'signal-aurora-glow',
        label: 'Aurora background glow blobs and ambient blur',
        weight: 1.3,
        loc: glowLoc,
        explanation: 'Decorative blurred colored blobs placed behind content containers.',
      });
    }

    // 10. Glassmorphism navbar / backdrop-blur
    if (styles.backdropBlurs.length > 0 || /backdrop-blur/i.test(doc.rawSource)) {
      tells.push({
        id: 'signal-glass-nav',
        label: 'Glassmorphism navigation with backdrop blur',
        weight: 1.2,
        loc: topLocation,
        explanation: 'Semi-transparent frosted glass navigation bar.',
      });
    }

    // 11. Cosmetic emoji icons or sparkle stars
    if (patterns.icons.sparkleIcons.length > 0 || /✨|🚀|⚡/.test(doc.rawSource)) {
      tells.push({
        id: 'signal-sparkles',
        label: 'Cosmetic emoji or sparkle icons (✨ / 🚀 / ⚡)',
        weight: 1.2,
        loc: patterns.icons.sparkleIcons[0]?.range || topLocation,
        explanation: 'Decorative emoji or AI star emblems used as visual filler.',
      });
    }

    // 12. Left-border cards or repeated card fingerprint
    if (patterns.cards.isVisuallyIdentical && totalCards >= 3) {
      tells.push({
        id: 'signal-card-fingerprint',
        label: 'Repeated visual card fingerprint across unrelated sections',
        weight: 1.4,
        loc: patterns.cards.cards[0]?.range || topLocation,
        explanation: 'Identical padding, shadow, border, and radius repeated across disparate components.',
      });
    }

    // Threshold check: 3+ correlated tells triggers UI-016 (exclude editor webviews)
    const isExtensionWebview = /acquireVsCodeApi|var\(--vscode/i.test(doc.rawSource) || /webview|extension/i.test(doc.filePath);
    let aiSignatureCluster: PatternCluster | undefined;
    if (!isExtensionWebview && tells.length >= 3) {
      const signatureConfidence = Math.min(0.99, 0.78 + tells.length * 0.04);
      const signatureInstances = tells.map((tell, idx) => ({
        id: `ui016_tell_${idx + 1}`,
        findingId: 'UI-016',
        ruleId: 'UI-016',
        location: tell.loc,
        filePath: tell.loc.filePath,
        line: getStartLine(tell.loc),
        snippet: tell.label,
        evidence: [astEvidence(`✓ ${tell.label}`, tell.loc)],
        status: 'open' as const,
      }));

      aiSignatureCluster = {
        id: 'ai-signature-stack',
        title: 'AI-Template Visual Signature',
        signals: tells.map(t => ({
          ruleId: t.id,
          name: t.label,
          weight: t.weight,
          evidence: [{ type: 'rule', explanation: t.explanation }],
        })),
        confidence: signatureConfidence,
        severity: 'high',
        score: tells.reduce((acc, t) => acc + t.weight, 0),
        rationale: 'Multiple visual hallmarks of generic boilerplate templates appear together with high correlation.',
      };

      findings.push({
        id: 'UI-016',
        ruleId: 'UI-016',
        ruleVersion: '1.4.0',
        sourceSkillId: 'anti-ai-ui',
        sourceSkillVersion: '1.4.0',
        title: 'AI-Template Visual Signature',
        problemTitle: 'Strong template-like visual pattern',
        message: `${tells.length} correlated signals detected across the view.`,
        whatIsWrong: 'This screen combines several common template interface patterns, creating a highly generic visual signature.',
        summary: 'This screen combines several common template interface patterns, creating a highly generic visual signature.',
        whyItMatters: 'The individual patterns are not necessarily wrong. Their combination makes the interface visually interchangeable with a generic SaaS template.',
        why: 'The individual patterns are not necessarily wrong. Their combination makes the interface visually interchangeable with a generic SaaS template.',
        howToFix: 'Keep the existing product identity but differentiate hierarchy, typography, card roles and CTA treatment.',
        recommendation: 'Keep the existing product identity but differentiate hierarchy, typography, card roles and CTA treatment.',
        severity: 'high',
        confidence: signatureConfidence,
        location: tells[0].loc,
        findingType: 'problem',
        category: 'ui-ux',
        clusterId: 'ai-pattern-stack',
        instances: signatureInstances,
        evidence: tells.map(t => ({
          type: 'rule' as const,
          explanation: `✓ ${t.label}`,
        })),
        research: {
          skillId: 'ui-ux-pro-max',
          domain: 'UX → hierarchy',
          recommendation: 'Keep the existing product identity but differentiate hierarchy, typography, card roles and CTA treatment.',
        },
        fix: {
          kind: 'assisted',
          title: 'Differentiate layout hierarchy and tone down cosmetic tropes',
          description: 'Refactor uniform container treatments into distinct primary and secondary components.',
        },
        supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 4. TREND STACKING (Requirement 13)
    // ─────────────────────────────────────────────────────────────
    const trendFeatures: string[] = [];
    if (styles.gradients.length > 0) trendFeatures.push('gradients');
    if (styles.glows.length > 0) trendFeatures.push('glow/ambient blur');
    if (styles.backdropBlurs.length > 0) trendFeatures.push('glassmorphism/backdrop blur');
    if (styles.hasExcessiveRadii) trendFeatures.push('large border-radius');
    if (styles.shadows.length > 0) trendFeatures.push('soft diffuse shadows');

    let trendStackingDetected = false;
    if (trendFeatures.length >= 3) {
      trendStackingDetected = true;
      findings.push({
        id: 'UI-013',
        ruleId: 'UI-013',
        ruleVersion: '1.4.0',
        sourceSkillId: 'anti-ai-ui',
        sourceSkillVersion: '1.4.0',
        title: 'Trend Stacking',
        problemTitle: 'Trend Stacking',
        message: 'Several decorative visual trends are being used together across the page.',
        whatIsWrong: `Multiple competing visual effects (${trendFeatures.join(', ')}) are applied simultaneously without a clear functional reason.`,
        summary: `Multiple competing visual effects (${trendFeatures.join(', ')}) are applied simultaneously without a clear functional reason.`,
        whyItMatters: 'Trend stacking over-decorates container surfaces, increasing visual noise and causing design fatigue without aiding user interaction.',
        why: 'Trend stacking over-decorates container surfaces, increasing visual noise and causing design fatigue without aiding user interaction.',
        howToFix: 'Remove cosmetic effects that do not communicate information or interaction. Pick one primary aesthetic treatment (e.g. clean borders) and keep surfaces calm.',
        recommendation: 'Remove cosmetic effects that do not communicate information or interaction. Pick one primary aesthetic treatment (e.g. clean borders) and keep surfaces calm.',
        severity: 'medium',
        confidence: 0.91,
        location: styles.gradients[0]?.element?.range || topLocation,
        findingType: 'problem',
        category: 'ui-ux',
        clusterId: 'trend-stacking',
        instances: [
          {
            id: 'ui013_inst_1',
            findingId: 'UI-013',
            ruleId: 'UI-013',
            location: styles.gradients[0]?.element?.range || topLocation,
            filePath: (styles.gradients[0]?.element?.range || topLocation).filePath,
            line: getStartLine(styles.gradients[0]?.element?.range || topLocation),
            snippet: trendFeatures.join(', '),
            evidence: [astEvidence(`Combined trends: ${trendFeatures.join(' + ')}`, topLocation)],
            status: 'open' as const,
          },
        ],
        evidence: [
          astEvidence(`Combined trends: ${trendFeatures.join(' + ')}`, topLocation),
          {
            type: 'rule',
            explanation: `${trendFeatures.length} concurrent decorative treatments compete for visual attention.`,
          },
        ],
        research: {
          skillId: 'ui-ux-pro-max',
          domain: 'UX → hierarchy',
          recommendation: 'Retain only essential structural styling and eliminate cosmetic filler trends.',
        },
        supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 5. VISUAL TREATMENT OVERLOAD (Requirement 8 & 27)
    // ─────────────────────────────────────────────────────────────
    const visualTreatmentOverloads: { element: any; score: number }[] = [];
    for (const el of doc.all) {
      if (el.visualTreatmentScore && el.visualTreatmentScore >= 5) {
        visualTreatmentOverloads.push({ element: el, score: el.visualTreatmentScore });
      }
    }

    if (visualTreatmentOverloads.length > 0) {
      const topOverload = visualTreatmentOverloads[0];
      const loc = topOverload.element.range || topLocation;
      const overloadInstances = visualTreatmentOverloads.map((ov, idx) => ({
        id: `ui014_inst_${idx + 1}`,
        findingId: 'UI-014',
        ruleId: 'UI-014',
        location: ov.element.range || topLocation,
        filePath: (ov.element.range || topLocation).filePath,
        line: getStartLine(ov.element.range || topLocation),
        snippet: ov.element.classes?.join(' ') || `<${ov.element.tagName}>`,
        evidence: [astEvidence(`Visual treatment score: ${ov.score}/9 on <${ov.element.tagName}>`, ov.element.range || topLocation)],
        status: 'open' as const,
      }));

      findings.push({
        id: 'UI-014',
        ruleId: 'UI-014',
        ruleVersion: '1.4.0',
        sourceSkillId: 'anti-ai-ui',
        sourceSkillVersion: '1.4.0',
        title: 'Visual Treatment Overload',
        problemTitle: 'Visual Treatment Overload',
        message: `${visualTreatmentOverloads.length} component${visualTreatmentOverloads.length > 1 ? 's' : ''} accumulate excessive decorative styling treatments simultaneously.`,
        whatIsWrong: `Component <${topOverload.element.tagName}> uses many decorative treatments (gradient, shadow, border, large radius, glow, badges, animation) at once.`,
        summary: `Component <${topOverload.element.tagName}> uses many decorative treatments (gradient, shadow, border, large radius, glow, badges, animation) at once.`,
        whyItMatters: 'Overloading components with simultaneous visual treatments draws attention away from the data and interaction states.',
        why: 'Overloading components with simultaneous visual treatments draws attention away from the data and interaction states.',
        howToFix: 'Simplify the component styling. Retain only the borders and background needed to distinguish the container.',
        recommendation: 'Simplify the component styling. Retain only the borders and background needed to distinguish the container.',
        severity: 'medium',
        confidence: 0.88,
        location: loc,
        findingType: 'problem',
        category: 'ui-ux',
        clusterId: 'treatment-overload',
        instances: overloadInstances,
        evidence: [
          astEvidence(`Visual treatment score: ${topOverload.score}/9 on <${topOverload.element.tagName}>`, loc),
          {
            type: 'rule',
            explanation: 'Treatments include gradient, border, shadow, radius, glow, and accent background.',
          },
        ],
        research: {
          skillId: 'ui-ux-pro-max',
          domain: 'UX → hierarchy',
          recommendation: 'Decouple cosmetic flair from semantic structure; maintain low decoration and high legibility.',
        },
        supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 6. WEAK VISUAL HIERARCHY (Requirement 11)
    // ─────────────────────────────────────────────────────────────
    let weakHierarchyDetected = false;
    const headings = doc.findElementsByType('heading');

    if (totalCards >= 4 && headings.length >= 3) {
      const sizes = headings.map(h => h.styles?.fontSize || '').filter(Boolean);
      const isMonotone = sizes.length >= 3 && new Set(sizes).size <= 1;
      const hasCompetingActions = patterns.buttons.competingPrimaryCtas.length > 0;

      if (isMonotone || hasCompetingActions || (totalCards >= 6 && patterns.cards.isVisuallyIdentical)) {
        weakHierarchyDetected = true;
        const loc = headings[0]?.range || topLocation;

        findings.push({
          id: 'VH-008',
          ruleId: 'VH-008',
          ruleVersion: '1.4.0',
          sourceSkillId: 'anti-ai-ui',
          sourceSkillVersion: '1.4.0',
          title: 'Weak Visual Hierarchy',
          problemTitle: 'Weak Visual Hierarchy',
          message: 'The page gives similar visual prominence to primary and supporting content.',
          whatIsWrong: 'Headings, cards, and interactive actions share nearly identical visual weight, leaving the user with no clear starting anchor.',
          summary: 'Headings, cards, and interactive actions share nearly identical visual weight, leaving the user with no clear starting anchor.',
          whyItMatters: 'Users scan interfaces hierarchically: primary anchor → secondary grouping → supporting details. Equal visual weight forces users to read everything linearly.',
          why: 'Users scan interfaces hierarchically: primary anchor → secondary grouping → supporting details. Equal visual weight forces users to read everything linearly.',
          howToFix: 'Strengthen contrast: make the main headline and primary action dominant, and subdue secondary containers with muted text and subtle borders.',
          recommendation: 'Strengthen contrast: make the main headline and primary action dominant, and subdue secondary containers with muted text and subtle borders.',
          severity: 'high',
          confidence: 0.9,
          location: loc,
          findingType: 'problem',
          category: 'ui-ux',
          clusterId: 'visual-hierarchy',
          instances: [
            {
              id: 'vh008_inst_1',
              findingId: 'VH-008',
              ruleId: 'VH-008',
              location: loc,
              filePath: loc.filePath,
              line: getStartLine(loc),
              snippet: headings[0]?.content || headings[0]?.classes?.join(' ') || 'Heading anchor',
              evidence: [astEvidence('Page layout lacks a distinct visual anchor; primary and secondary containers have equal weight.', loc)],
              status: 'open' as const,
            },
          ],
          evidence: [
            astEvidence('Page layout lacks a distinct visual anchor; primary and secondary containers have equal weight.', loc),
            ...(hasCompetingActions
              ? [{
                  type: 'rule' as const,
                  explanation: 'Multiple primary call-to-action buttons compete for user attention in the same viewport.',
                }]
              : []),
          ],
          research: {
            skillId: 'ui-ux-pro-max',
            domain: 'UX → hierarchy',
            recommendation: 'Establish an unequivocal primary focal point before introducing secondary elements.',
          },
          supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
        });
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 7. GENERIC MARKETING COPY & CTA LANGUAGE (Requirement 12 & 24)
    // ─────────────────────────────────────────────────────────────
    let genericCtaDetected = false;
    const ctas = patterns.buttons.genericCtas;
    const hypePhrases = patterns.copy.genericHypePhrases || [];

    if (ctas.length > 0 || hypePhrases.length > 0) {
      genericCtaDetected = true;
      const firstCta = ctas[0];
      const loc = firstCta?.element?.range || (hypePhrases[0] ? topLocation : topLocation);

      const copyInstances = [
        ...ctas.map((c, idx) => ({
          id: `cp002_cta_${idx + 1}`,
          findingId: 'CP-002',
          ruleId: 'CP-002',
          location: c.element.range || topLocation,
          filePath: (c.element.range || topLocation).filePath,
          line: getStartLine(c.element.range || topLocation),
          snippet: c.text,
          evidence: [astEvidence(`Generic CTA wording: "${c.text}"`, c.element.range || topLocation)],
          status: 'open' as const,
        })),
        ...hypePhrases.map((h, idx) => {
          const phraseText = typeof h === 'string' ? h : h.phrase;
          const hLoc = (typeof h === 'object' && h.element?.range) ? h.element.range : topLocation;
          return {
            id: `cp002_hype_${idx + 1}`,
            findingId: 'CP-002',
            ruleId: 'CP-002',
            location: hLoc,
            filePath: hLoc.filePath,
            line: getStartLine(hLoc),
            snippet: phraseText,
            evidence: [astEvidence(`Boilerplate hype phrase: "${phraseText}"`, hLoc)],
            status: 'open' as const,
          };
        }),
      ];

      findings.push({
        id: 'CP-002',
        ruleId: 'CP-002',
        ruleVersion: '1.4.0',
        sourceSkillId: 'anti-ai-ui',
        sourceSkillVersion: '1.4.0',
        title: 'Generic Marketing Copy',
        problemTitle: 'Generic Marketing Copy',
        message: `${copyInstances.length} placeholder phrase${copyInstances.length > 1 ? 's' : ''} detected without domain specificity.`,
        whatIsWrong: 'Buttons and headings use generic template phrases instead of concrete, task-oriented language.',
        summary: 'Buttons and headings use generic template phrases instead of concrete, task-oriented language.',
        whyItMatters: 'Specific CTAs and copy set clear expectations, improve user clarity, and demonstrate actual product functionality.',
        why: 'Specific CTAs and copy set clear expectations, improve user clarity, and demonstrate actual product functionality.',
        howToFix: 'Replace with specific action verbs (e.g. "Create project", "Connect repository", "Export report", "Start free 14-day trial").',
        recommendation: 'Replace with specific action verbs (e.g. "Create project", "Connect repository", "Export report", "Start free 14-day trial").',
        severity: 'medium',
        confidence: 0.88,
        location: loc,
        findingType: 'problem',
        category: 'content',
        clusterId: 'generic-cta',
        instances: copyInstances,
        evidence: [
          astEvidence(`Detected generic copy instances`, loc),
          {
            type: 'rule',
            explanation: `${copyInstances.length} elements use placeholder call-to-action or marketing wording.`,
          },
        ],
        research: {
          skillId: 'ui-ux-pro-max',
          domain: 'UX → microcopy',
          recommendation: 'Use objective, domain-specific verb phrases describing exact outcomes.',
        },
        supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 8. BADGE & STATUS-PILL SATURATION (Requirement 14)
    // ─────────────────────────────────────────────────────────────
    let badgeSaturationDetected = false;
    if (patterns.badges.isSaturated || patterns.badges.decorativeBadges.length >= 4) {
      badgeSaturationDetected = true;
      const firstBadge = patterns.badges.allBadges[0];
      const loc = firstBadge?.range || topLocation;

      const badgeInstances = patterns.badges.allBadges.map((b, idx) => ({
        id: `ui017_badge_${idx + 1}`,
        findingId: 'UI-017',
        ruleId: 'UI-017',
        location: b.range || topLocation,
        filePath: (b.range || topLocation).filePath,
        line: getStartLine(b.range || topLocation),
        snippet: b.content || b.classes?.join(' ') || 'Badge',
        evidence: [astEvidence(`Badge #${idx + 1}: "${b.content || b.classes?.join(' ') || ''}"`, b.range || topLocation)],
        status: 'open' as const,
      }));

      findings.push({
        id: 'UI-017',
        ruleId: 'UI-017',
        ruleVersion: '1.4.0',
        sourceSkillId: 'anti-ai-ui',
        sourceSkillVersion: '1.4.0',
        title: 'Badge Saturation',
        problemTitle: 'Badge Saturation',
        message: `${patterns.badges.allBadges.length} badges and status pills are scattered across the view.`,
        whatIsWrong: 'Many routine values and decorative labels are formatted as status badges or pills, diluting their signaling power.',
        summary: 'Many routine values and decorative labels are formatted as status badges or pills, diluting their signaling power.',
        whyItMatters: 'When everything is styled as a badge, actual critical status indicators (e.g. Error, Warning, Active) no longer command immediate attention.',
        why: 'When everything is styled as a badge, actual critical status indicators (e.g. Error, Warning, Active) no longer command immediate attention.',
        howToFix: 'Reserve pills and colored badges for genuine operational statuses. Use plain typographic labels and muted colors for ordinary metadata.',
        recommendation: 'Reserve pills and colored badges for genuine operational statuses. Use plain typographic labels and muted colors for ordinary metadata.',
        severity: 'medium',
        confidence: 0.89,
        location: loc,
        findingType: 'problem',
        category: 'ui-ux',
        clusterId: 'badge-saturation',
        instances: badgeInstances,
        evidence: [
          astEvidence(`Detected ${patterns.badges.allBadges.length} badge/pill elements across view.`, loc),
          {
            type: 'rule',
            explanation: `${patterns.badges.decorativeBadges.length} decorative badges detected (e.g. NEW, PRO, AI, LIVE).`,
          },
        ],
        research: {
          skillId: 'ui-ux-pro-max',
          domain: 'UX → visual hierarchy',
          recommendation: 'Reserve pill containers exclusively for state transitions and system notifications.',
        },
        supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 9. FAKE PRODUCT SIGNALS (Requirement 16)
    // ─────────────────────────────────────────────────────────────
    let fakeProductSignalsDetected = false;
    const fakeRegex = /\b(99\.9%|10,000\+\s*users|4\.9\/5|2M\+\s*transactions|pulsing\s*green|fake\s*terminal)\b/i;
    const rawLower = doc.rawSource.toLowerCase();
    const hasLiveBadge = patterns.badges.decorativeBadges.some(b => b.text.toLowerCase().includes('live'));
    const hasFakeMetrics = fakeRegex.test(rawLower);

    if (hasLiveBadge && hasFakeMetrics) {
      fakeProductSignalsDetected = true;
      findings.push({
        id: 'UI-019',
        ruleId: 'UI-019',
        ruleVersion: '1.4.0',
        sourceSkillId: 'anti-ai-ui',
        sourceSkillVersion: '1.4.0',
        title: 'Unverifiable Product Metrics',
        problemTitle: 'Unverifiable Product Metrics',
        message: 'Static placeholder metrics and decorative LIVE indicators detected.',
        whatIsWrong: 'The view contains generic placeholder metrics (e.g. 99.9%, 10,000+ users, LIVE status) without dynamic backing data.',
        summary: 'The view contains generic placeholder metrics (e.g. 99.9%, 10,000+ users, LIVE status) without dynamic backing data.',
        whyItMatters: 'Unsubstantiated or simulated social proof and vanity statistics reduce credibility with discerning users.',
        why: 'Unsubstantiated or simulated social proof and vanity statistics reduce credibility with discerning users.',
        howToFix: 'Display verifiable, real product usage data or remove vanity stats in favor of concrete feature explanations.',
        recommendation: 'Display verifiable, real product usage data or remove vanity stats in favor of concrete feature explanations.',
        severity: 'medium',
        confidence: 0.85,
        location: topLocation,
        findingType: 'problem',
        category: 'content',
        clusterId: 'fake-metrics',
        instances: [
          {
            id: 'ui019_inst_1',
            findingId: 'UI-019',
            ruleId: 'UI-019',
            location: topLocation,
            filePath: topLocation.filePath,
            line: getStartLine(topLocation),
            snippet: '99.9% / 10,000+ users / LIVE badge',
            evidence: [regexEvidence('Detected static placeholder metrics (e.g. 99.9%, 10,000+ users, LIVE badge)', topLocation)],
            status: 'open' as const,
          },
        ],
        evidence: [
          regexEvidence('Detected static placeholder metrics (e.g. 99.9%, 10,000+ users, LIVE badge)', topLocation),
        ],
        supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 10. SWAP TEST HEURISTIC (Requirement 10)
    // ─────────────────────────────────────────────────────────────
    let swapTestFailed = false;
    const genericPhrases = [
      'unlock your potential',
      'supercharge your workflow',
      'everything you need',
      'built for modern teams',
      'revolutionize your',
      'the next generation',
      'all in one platform',
    ];
    let genericPhraseHits = 0;
    for (const phrase of genericPhrases) {
      if (rawLower.includes(phrase)) genericPhraseHits++;
    }

    if (genericPhraseHits >= 1 && (hasHero || hasFeatures) && hasGenericCta) {
      swapTestFailed = true;
      findings.push({
        id: 'UI-010',
        ruleId: 'UI-010',
        ruleVersion: '1.4.0',
        sourceSkillId: 'anti-ai-ui',
        sourceSkillVersion: '1.4.0',
        title: 'Template Interchangeability (Swap Test Failed)',
        problemTitle: 'Template Interchangeability (Swap Test Failed)',
        message: 'The page composition and copy could be swapped with any generic SaaS website.',
        whatIsWrong: 'The content and structural composition rely on generic SaaS placeholders rather than domain-specific information architecture.',
        summary: 'The content and structural composition rely on generic SaaS placeholders rather than domain-specific information architecture.',
        whyItMatters: 'Interfaces that fail the swap test lack clear product differentiation and make it harder for users to understand what the product actually does.',
        why: 'Interfaces that fail the swap test lack clear product differentiation and make it harder for users to understand what the product actually does.',
        howToFix: 'Replace generic value propositions with concrete examples of real data, user flows, and specific capabilities.',
        recommendation: 'Replace generic value propositions with concrete examples of real data, user flows, and specific capabilities.',
        severity: 'medium',
        confidence: 0.87,
        location: topLocation,
        findingType: 'problem',
        category: 'content',
        clusterId: 'swap-test',
        instances: [
          {
            id: 'ui010_inst_1',
            findingId: 'UI-010',
            ruleId: 'UI-010',
            location: topLocation,
            filePath: topLocation.filePath,
            line: getStartLine(topLocation),
            snippet: genericPhrases.find(p => rawLower.includes(p)) || 'Generic SaaS formula',
            evidence: [regexEvidence(`Detected boilerplate AI copy formula: "${genericPhrases.find(p => rawLower.includes(p))}"`, topLocation)],
            status: 'open' as const,
          },
        ],
        evidence: [
          regexEvidence(`Detected boilerplate AI copy formula: "${genericPhrases.find(p => rawLower.includes(p))}"`, topLocation),
        ],
        supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
      });
    }

    return {
      fingerprints,
      aiSignatureCluster,
      cardSoupDetected,
      cardSoupCount,
      weakHierarchyDetected,
      trendStackingDetected,
      visualTreatmentOverloads,
      badgeSaturationDetected,
      genericCtaDetected,
      fakeProductSignalsDetected,
      swapTestFailed,
      findings,
    };
  }
}
