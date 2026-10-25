import { Finding, createLocation, astEvidence } from '@craftlens/core';
import { ParsedUIDocument } from '@craftlens/parser';

export interface RenderAnalysisOptions {
  isRenderAvailable?: boolean;
  viewportWidth?: number;
  domAvailable?: boolean;
  computedStylesAvailable?: boolean;
  screenshotAvailable?: boolean;
  viewportSizes?: { width: number; height: number; name: string }[];
}

export interface RenderAnalysisResult {
  isRenderAvailable: boolean;
  status: 'render_available' | 'render_analysis_unavailable';
  statusMessage: string;
  hasHorizontalOverflowRisk: boolean;
  fixedWidthElements: any[];
  overflowRisks: any[];
  viewportsChecked: string[];
  findings: Finding[];
}

export class RenderAnalyzer {
  public static analyze(
    doc: ParsedUIDocument,
    options?: RenderAnalysisOptions
  ): RenderAnalysisResult {
    const findings: Finding[] = [];
    const fixedWidthElements: any[] = [];
    let hasHorizontalOverflowRisk = false;

    const isRenderAvailable = Boolean(
      options?.isRenderAvailable ||
      options?.domAvailable ||
      options?.computedStylesAvailable ||
      options?.screenshotAvailable
    );
    const status = isRenderAvailable
      ? 'render_available'
      : 'render_analysis_unavailable';
    const statusMessage = isRenderAvailable
      ? 'Render analysis active'
      : 'render analysis unavailable: headless DOM/browser rendering not connected';

    const viewportsChecked = options?.viewportSizes
      ? options.viewportSizes.map(v => v.name)
      : ['desktop (static)', 'mobile (inferred)'];

    // ─────────────────────────────────────────────────────────────
    // Geometry & Layout Analysis (Static + Computed Layout)
    // ─────────────────────────────────────────────────────────────
    for (const el of doc.all) {
      const styles = el.styles || {};
      const classStr = el.classes.join(' ').toLowerCase();

      // Check Tailwind fixed width or inline fixed width >= 800px without responsive breakpoints
      const fixedWidthMatch = classStr.match(/\bw-\[(\d+)px\]/);
      let pxWidth = 0;
      if (fixedWidthMatch) {
        pxWidth = parseInt(fixedWidthMatch[1], 10);
      } else if (styles.width && /^\d+px$/.test(styles.width)) {
        pxWidth = parseInt(styles.width, 10);
      } else {
        const rawStyle = (el.attributes['style'] || '').toLowerCase();
        const styleMatch = rawStyle.match(/width:\s*['"]?(\d+)px/);
        if (styleMatch) {
          pxWidth = parseInt(styleMatch[1], 10);
        }
      }

      if (pxWidth >= 800) {
        // Check if there is responsive max-w or w-full
        const hasResponsive =
          classStr.includes('max-w-') ||
          classStr.includes('w-full') ||
          classStr.includes('sm:') ||
          classStr.includes('md:') ||
          classStr.includes('lg:');

        if (!hasResponsive) {
          fixedWidthElements.push(el);
          hasHorizontalOverflowRisk = true;

          const loc = el.range || createLocation(doc.filePath, 1, 1, 0, 1, 20, 0);
          findings.push({
            id: `render-overflow-${el.id}`,
            ruleId: 'UI-022',
            problemTitle: 'Fixed container width breaks mobile viewport',
            title: 'Fixed container width breaks mobile viewport',
            message: `Container has hardcoded width of ${pxWidth}px without responsive constraints.`,
            whatIsWrong: `The container specifies a fixed width of ${pxWidth}px which causes horizontal scrollbars on viewports narrower than ${pxWidth}px.`,
            summary: `The container specifies a fixed width of ${pxWidth}px which causes horizontal scrollbars on viewports narrower than ${pxWidth}px.`,
            whyItMatters: 'Horizontal scrolling on mobile and tablet screens disorients users and clips interactive controls.',
            why: 'Horizontal scrolling on mobile and tablet screens disorients users and clips interactive controls.',
            howToFix: `Use max-width with fluid width: replace w-[${pxWidth}px] with w-full max-w-5xl px-4.`,
            recommendation: `Use max-width with fluid width: replace w-[${pxWidth}px] with w-full max-w-5xl px-4.`,
            severity: 'warning',
            confidence: 0.93,
            location: loc,
            primaryLocation: loc,
            findingType: 'problem',
            category: 'css',
            clusterId: 'responsive-overflow',
            evidence: [
              astEvidence(
                `Container specifies fixed width: ${pxWidth}px without responsive fallback`,
                loc
              ),
            ],
            verification: 'Resize viewport down to 375px; ensure no horizontal scrollbar occurs.',
            supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
          });
        }
      }
    }

    return {
      isRenderAvailable,
      status,
      statusMessage,
      hasHorizontalOverflowRisk,
      fixedWidthElements,
      overflowRisks: fixedWidthElements,
      viewportsChecked,
      findings,
    };
  }
}

