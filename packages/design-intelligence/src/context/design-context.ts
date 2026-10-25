import * as fs from 'node:fs';
import * as path from 'node:path';
import { Finding, ProjectContext, UIElement } from '@craftlens/core';
import { ParsedUIDocument } from '@craftlens/parser';

export interface ComponentContext {
  tagName: string;
  className?: string;
  id?: string;
  role?: string;
  childCount?: number;
  textSummary?: string;
  snippet?: string;
}

export interface DesignContext {
  productType?: 'marketing' | 'dashboard' | 'settings' | 'ecommerce' | 'admin' | 'content' | string;
  pageType?: 'landing' | 'services' | 'pricing' | 'overview' | 'detail' | 'form' | 'settings' | 'catalog' | string;
  componentType?: string;
  purpose?: string;
  primaryTask?: string;
  contentType?: 'services' | 'metrics' | 'features' | 'form-controls' | 'products' | 'articles' | 'navigation' | string;
  contentCount?: number;
  interactionType?: 'informational' | 'actionable' | 'navigational' | 'form-entry' | 'data-monitoring' | string;
  existingDesignSystem?: {
    colors?: string[];
    typography?: string[];
    spacing?: string[];
    radii?: string[];
    components?: string[];
  };
  surroundingComponents?: ComponentContext[];
  siblingCount?: number;
  responsiveContext?: {
    desktop?: boolean;
    tablet?: boolean;
    mobile?: boolean;
  };
  visualPatterns?: string[];
  detectedSignals?: string[];
  framework?: string;
}

export class DesignContextExtractor {
  public static extract(options: {
    doc?: ParsedUIDocument;
    projectContext?: ProjectContext;
    filePath?: string;
    sourceCode?: string;
    finding?: Finding;
    targetElement?: UIElement;
  }): DesignContext {
    const filePath = options.filePath || options.finding?.location?.filePath || options.doc?.filePath || '';
    const source = options.sourceCode || options.doc?.rawSource || '';
    const lowerSource = source.toLowerCase();
    const fileName = path.basename(filePath).toLowerCase();

    // 1. Read product context files if present in workspace
    let productDocContent = '';
    const rootPath = options.projectContext?.rootPath;
    if (rootPath) {
      const candidates = ['PRODUCT.md', 'DESIGN.md', 'README.md'];
      for (const cand of candidates) {
        const full = path.join(rootPath, cand);
        try {
          if (fs.existsSync(full)) {
            productDocContent += ' ' + fs.readFileSync(full, 'utf8').toLowerCase();
          }
        } catch {
          // Ignore read error
        }
      }
    }

    // 2. Infer productType & pageType
    let productType: DesignContext['productType'] = 'marketing';
    let pageType: DesignContext['pageType'] = 'landing';

    const hasServiceSign =
      fileName.includes('service') ||
      lowerSource.includes('service-box') ||
      lowerSource.includes('service-card') ||
      lowerSource.includes('services-section') ||
      lowerSource.includes('our services');

    const hasDashboardSign =
      /(dashboard|analytics|admin)/i.test(fileName) ||
      /(class=["'][^"']*(?:dashboard|metrics-grid|stat-card|kpi)[^"']*["'])/i.test(source);

    const hasSettingsSign =
      /(settings|preferences)/i.test(fileName) ||
      /(class=["'][^"']*(?:settings-pane|preference-group|account-settings)[^"']*["'])/i.test(source);

    const hasEcommerceSign =
      /(shop|cart|checkout|store|catalog|product)/i.test(fileName) ||
      /(class=["'][^"']*(?:product-grid|cart-items|checkout-form|pricing-table)[^"']*["'])/i.test(source);

    if (hasServiceSign) {
      productType = 'marketing';
      pageType = 'services';
    } else if (hasDashboardSign) {
      productType = 'dashboard';
      pageType = 'overview';
    } else if (hasSettingsSign) {
      productType = 'settings';
      pageType = 'settings';
    } else if (hasEcommerceSign) {
      productType = 'ecommerce';
      pageType = 'catalog';
    } else if (fileName.includes('price') || lowerSource.includes('pricing')) {
      productType = 'marketing';
      pageType = 'pricing';
    } else {
      productType = 'marketing';
      pageType = fileName.includes('landing') ? 'landing' : 'marketing';
    }

    // 3. Infer Component & Content Type
    let componentType = 'card';
    let contentType = 'features';
    if (fileName.includes('article') || fileName.includes('blog') || fileName.includes('post') || source.includes('<article')) {
      contentType = 'editorial';
    } else if (hasServiceSign) {
      contentType = 'services';
    } else if (productType === 'dashboard') {
      contentType = 'metrics';
    }
    let interactionType: DesignContext['interactionType'] = 'informational';
    let siblingCount = 1;
    let contentCount = 1;

    // Check DOM / elements from parsed document
    if (options.doc) {
      const allElements = options.doc.all;

      // Check for service boxes or card groups
      const serviceBoxes = allElements.filter(el => {
        const cls = el.classes.join(' ').toLowerCase();
        return cls.includes('service-box') || cls.includes('service_box') || cls.includes('service-card');
      });

      if (serviceBoxes.length > 0) {
        componentType = 'service-box';
        contentType = 'services';
        contentCount = serviceBoxes.length;
        siblingCount = serviceBoxes.length;

        // Check if actionable or informational
        const hasActionInside = serviceBoxes.some(b =>
          b.children.some(c => c.type === 'button' || c.tagName === 'a' || c.tagName === 'button')
        );
        interactionType = hasActionInside ? 'actionable' : 'informational';
      } else {
        const cards = options.doc.findElementsByType('card');
        if (cards.length > 0) {
          componentType = 'card';
          contentCount = cards.length;
          siblingCount = cards.length;
          contentType = productType === 'dashboard' ? 'metrics' : 'features';
          const hasButtons = cards.some(c => c.children.some(ch => ch.type === 'button'));
          interactionType = hasButtons ? 'actionable' : 'informational';
        }
      }
    } else {
      // RegEx fallback for raw HTML
      const serviceMatch = source.match(/class=["'][^"']*service-box[^"']*["']/g);
      if (serviceMatch && serviceMatch.length > 0) {
        componentType = 'service-box';
        contentType = 'services';
        contentCount = serviceMatch.length;
        siblingCount = serviceMatch.length;
        interactionType = 'informational';
      } else {
        const cardMatch = source.match(/class=["'][^"']*card[^"']*["']/g);
        if (cardMatch) {
          componentType = 'card';
          contentCount = cardMatch.length;
          siblingCount = cardMatch.length;
          contentType = productType === 'dashboard' ? 'metrics' : 'features';
        }
      }
    }

    const hasMultipleCtas = (source.match(/class=["'][^"']*\bbtn\b[^"']*["']|<button/gi) || []).length >= 2;
    if (hasMultipleCtas) {
      interactionType = 'cta';
    }

    // If finding has instances, use its count
    if (options.finding?.instances && options.finding.instances.length > 1) {
      siblingCount = options.finding.instances.length;
      contentCount = options.finding.instances.length;
    }

    // 4. Extract existing design system tokens
    const colors = new Set<string>();
    const typography = new Set<string>();
    const spacing = new Set<string>();
    const radii = new Set<string>();
    const components = new Set<string>();

    // Extract hex/rgb/hsl colors
    const colorMatches = source.match(/(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\))/g);
    if (colorMatches) {
      for (const c of colorMatches.slice(0, 10)) {
        colors.add(c);
      }
    }

    // Extract Tailwind or CSS classes
    const classMatches = source.match(/class(?:Name)?=["']([^"']+)["']/g);
    if (classMatches) {
      for (const m of classMatches) {
        const inner = m.replace(/^class(?:Name)?=["']|["']$/g, '');
        const tokens = inner.split(/\s+/);
        for (const t of tokens) {
          if (t.startsWith('rounded')) radii.add(t);
          if (t.startsWith('p-') || t.startsWith('px-') || t.startsWith('py-') || t.startsWith('gap-')) spacing.add(t);
          if (t.startsWith('text-') || t.startsWith('font-')) typography.add(t);
          if (t.startsWith('bg-') || t.startsWith('text-')) colors.add(t);
        }
      }
    }

    // 5. Framework detection
    let framework = 'html';
    if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) framework = 'react';
    else if (filePath.endsWith('.vue')) framework = 'vue';
    else if (filePath.endsWith('.svelte')) framework = 'svelte';

    return {
      productType,
      pageType,
      componentType,
      purpose: `${pageType} section presenting ${contentCount} ${contentType}`,
      primaryTask: interactionType === 'actionable' ? 'interact and choose options' : 'scan and understand informational content',
      contentType,
      contentCount,
      interactionType,
      siblingCount,
      existingDesignSystem: {
        colors: Array.from(colors),
        typography: Array.from(typography),
        spacing: Array.from(spacing),
        radii: Array.from(radii),
        components: Array.from(components),
      },
      responsiveContext: {
        desktop: true,
        tablet: true,
        mobile: source.includes('sm:') || source.includes('grid-cols-') || source.includes('@media'),
      },
      visualPatterns: [
        `${siblingCount} uniform ${componentType} containers`,
        `identical border and radius treatment`,
      ],
      detectedSignals: [
        `sibling-count:${siblingCount}`,
        `content-role:${contentType}`,
        `interaction-mode:${interactionType}`,
      ],
      framework,
    };
  }
}
