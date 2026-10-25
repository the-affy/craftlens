import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => {
  return {
    MarkdownString: class {
      value = '';
      isTrusted = false;
      supportHtml = false;
      appendMarkdown(str: string) {
        this.value += str;
      }
    },
    Uri: {
      file: (path: string) => ({ fsPath: path, toString: () => `file://${path}` }),
    },
    commands: {
      executeCommand: vi.fn(),
    },
  };
});

import { UIAnalyzer } from '../../packages/design-intelligence/src/analyzer/ui-analyzer.js';
import { CompositionAnalyzer } from '../../packages/design-intelligence/src/analyzer/composition-analyzer.js';
import { PatternAnalyzer } from '../../packages/design-intelligence/src/analyzer/pattern-analyzer.js';
import { DesignContextExtractor } from '../../packages/design-intelligence/src/context/design-context.js';
import { ProblemModelBuilder } from '../../packages/design-intelligence/src/problem-model/problem-model.js';
import { RecommendationPipeline } from '../../packages/design-intelligence/src/recommendation/recommendation-pipeline.js';
import { QualityFilter } from '../../packages/design-intelligence/src/validation/quality-filter.js';
import { normalizeFindingLocation, createDefaultProjectContext } from '../../packages/core/src/index.js';
import { createCompactFindingHover } from '../../apps/vscode-extension/src/hover/compact-hover.js';
import { CraftLensDetailViewProvider } from '../../apps/vscode-extension/src/sidebar/detail-panel-provider.js';

describe('Contextual Design Recommendation Engine', () => {
  const screenshotFixtureHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Services - Modern SaaS</title>
  <style>
    .service-box {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 24px;
      background: #ffffff;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
  </style>
</head>
<body>
  <section class="services-section">
    <div class="service-box">
      <i class="fa fa-magic"></i>
      <h3>AI Did Everything</h3>
      <p>Why understand your own code when AI can hallucinate it for you.</p>
    </div>
    <div class="service-box">
      <i class="fa fa-bolt"></i>
      <h3>Instant Deployment</h3>
      <p>Ship directly to production without testing.</p>
    </div>
    <div class="service-box">
      <i class="fa fa-cloud"></i>
      <h3>Serverless Forever</h3>
      <p>Scale from zero to bankruptcy in seconds.</p>
    </div>
    <div class="service-box">
      <i class="fa fa-shield"></i>
      <h3>Security by Obscurity</h3>
      <p>No one can hack what no one can understand.</p>
    </div>
    <div class="service-box">
      <i class="fa fa-cogs"></i>
      <h3>Zero Configuration</h3>
      <p>Because you cannot configure what has no settings.</p>
    </div>
    <div class="service-box">
      <i class="fa fa-rocket"></i>
      <h3>Blazing Fast</h3>
      <p>Written in Rust, runs in 100MB of JavaScript.</p>
    </div>
  </section>
</body>
</html>
  `.trim();

  it('Section 25: analyzes exact screenshot case, produces CP-007 with 6 instances and affected elements', () => {
    const report = UIAnalyzer.analyze('/app/services.html', screenshotFixtureHtml);
    const cp007 = report.findings.find(f => f.ruleId === 'CP-007');

    expect(cp007).toBeDefined();
    expect(cp007?.title).toBe('Repeated Card Treatment');
    expect(cp007?.severity).toBe('moderate');
    expect(cp007?.confidence).toBeGreaterThanOrEqual(0.9);

    // Instances must not be collapsed into 1 (Requirement 17 & 18)
    expect(cp007?.instances?.length).toBe(6);
    expect(cp007?.affectedElements?.length).toBe(6);
    expect(cp007?.affectedElements?.[0].selector).toBe('.service-box');

    // Each instance has its line recorded
    for (let i = 0; i < cp007!.instances!.length; i++) {
      expect(cp007!.instances![i].line).toBeGreaterThan(0);
      expect(cp007!.instances![i].id).toBe(`cp007_card_${i + 1}`);
    }
  });

  it('Section 2: generates compact hover with WHY IT MATTERS, EVIDENCE bullets, Severity and Confidence', () => {
    const report = UIAnalyzer.analyze('/app/services.html', screenshotFixtureHtml);
    const cp007 = report.findings.find(f => f.ruleId === 'CP-007')!;
    const hover = createCompactFindingHover(cp007);
    const text = hover.value;

    expect(text).toContain('Repeated Card Treatment');
    expect(text).toContain('6 similar cards detected in this section.');
    expect(text).toContain('**WHY IT MATTERS**');
    expect(text).toContain('All six cards use the same container, spacing, border, radius and visual hierarchy.');
    expect(text).toContain('**EVIDENCE**');
    expect(text).toContain('• 6 sibling cards');
    expect(text).toContain('• same radius');
    expect(text).toContain('• same padding');
    expect(text).toContain('• same border');
    expect(text).toContain('• same heading/body structure');
    expect(text).toContain('**Severity**  Moderate');
    expect(text).toContain('**Confidence** 94%');
    expect(text).toContain('[ Suggest Better Design ]');
  });

  it('Section 3 & 4: RecommendationPipeline produces contextual design recommendations rather than generic dashboard metrics', async () => {
    const report = UIAnalyzer.analyze('/app/services.html', screenshotFixtureHtml);
    const cp007 = report.findings.find(f => f.ruleId === 'CP-007')!;

    const recommendations = await RecommendationPipeline.run({
      finding: cp007,
      filePath: '/app/services.html',
      sourceCode: screenshotFixtureHtml,
      projectContext: createDefaultProjectContext(),
    });

    expect(recommendations.length).toBeGreaterThanOrEqual(2);

    // MUST NOT return generic dashboard metrics
    for (const rec of recommendations) {
      expect(rec.title.toLowerCase()).not.toContain('primary metrics');
      expect(rec.title.toLowerCase()).not.toContain('grouped metric');
      expect(rec.title.toLowerCase()).not.toContain('data table');
      expect(rec.title.toLowerCase()).not.toContain('dense data table');

      // Must have whyItFits, tradeoff, affectedElements, confidence
      expect(rec.whyItFits.length).toBeGreaterThan(0);
      expect(rec.tradeoff).toBeDefined();
      expect(rec.confidence).toBeGreaterThan(0.7);
      expect(rec.affectedElements.length).toBeGreaterThan(0);
    }

    // Must propose genuine contextual directions (Requirement 13)
    const titles = recommendations.map(r => r.title);
    expect(titles.some(t => t.includes('FEATURE') || t.includes('LIST'))).toBe(true);
    expect(titles.some(t => t.includes('EDITORIAL') || t.includes('GRID'))).toBe(true);
  });

  it('Section 5 & 6: DesignContext and ProblemModel accurately model the screenshot case', () => {
    const report = UIAnalyzer.analyze('/app/services.html', screenshotFixtureHtml);
    const cp007 = report.findings.find(f => f.ruleId === 'CP-007')!;

    const context = DesignContextExtractor.extract({
      filePath: '/app/services.html',
      sourceCode: screenshotFixtureHtml,
    });

    expect(context.productType).toBe('marketing');
    expect(context.pageType).toBe('services');
    expect(context.componentType).toBe('service-box');
    expect(context.contentCount).toBe(6);

    const problem = ProblemModelBuilder.build(cp007, context);
    expect(problem.category).toBe('visual-repetition');
    expect(problem.affectedElements).toContain('.service-box');
    expect(problem.constraints).toContain('preserve service content');
    expect(problem.constraints).toContain('do not introduce unrelated dashboard patterns');
  });

  it('Section 11: QualityFilter bans generic boilerplate and irrelevant dashboard patterns on marketing pages', () => {
    const filter = new QualityFilter();
    const context = DesignContextExtractor.extract({
      filePath: '/app/services.html',
      sourceCode: screenshotFixtureHtml,
    });
    const problem = ProblemModelBuilder.build(
      { ruleId: 'CP-007', message: '6 cards', location: { filePath: '/app/services.html', line: 1 }, severity: 'moderate', confidence: 0.94 } as any,
      context
    );

    // Banned generic phrase test
    const genericCandidate = {
      id: 'gen-1',
      title: 'Use a clean layout',
      transformation: 'polish' as const,
      description: 'Improve visual hierarchy with modern design.',
      whyItFits: ['It looks better.'],
      evidence: ['cards exist'],
      tradeoff: 'None',
      affectedElements: ['.service-box'],
      confidence: 0.5,
      scope: 'component' as const,
    };
    const resGeneric = filter.validate(genericCandidate, context, problem);
    expect(resGeneric.valid).toBe(false);
    expect(resGeneric.reason).toContain('banned boilerplate');

    // Dashboard pattern on marketing page test
    const dashboardCandidate = {
      id: 'dash-1',
      title: 'Dense Data Table of Metrics',
      transformation: 'distill' as const,
      description: 'Render the services in a dashboard data table with KPI numbers.',
      whyItFits: ['High density data.'],
      evidence: ['6 items'],
      tradeoff: 'Less visual flair',
      affectedElements: ['.service-box'],
      confidence: 0.8,
      scope: 'component' as const,
    };
    const resDash = filter.validate(dashboardCandidate, context, problem);
    expect(resDash.valid).toBe(false);
    expect(resDash.reason).toContain('dashboard data tables');
  });

  it('Section 26: evaluates other finding types (color, typography, button, copy)', () => {
    // 1. Button CTA conflict
    const buttonHtml = `
      <section>
        <h1>Welcome to our Product</h1>
        <button class="btn btn-primary">Start Free Trial</button>
        <button class="btn btn-primary">Buy Enterprise Now</button>
        <button class="btn btn-primary">Book a Demo</button>
      </section>
    `;
    const btnContext = DesignContextExtractor.extract({
      filePath: '/app/landing.html',
      sourceCode: buttonHtml,
    });
    expect(btnContext.productType).toBe('marketing');
    expect(btnContext.pageType).toBe('landing');
    expect(btnContext.interactionType).toBe('cta');

    // 2. Weak type hierarchy
    const typoHtml = `
      <div style="font-size: 15px; font-weight: normal;">
        <h1 style="font-size: 15px; font-weight: normal;">Title</h1>
        <h2 style="font-size: 15px; font-weight: normal;">Subtitle</h2>
        <p style="font-size: 15px; font-weight: normal;">Body text goes here.</p>
      </div>
    `;
    const typoContext = DesignContextExtractor.extract({
      filePath: '/app/article.html',
      sourceCode: typoHtml,
    });
    expect(typoContext.contentType).toBe('editorial');

    // 3. Generic AI Marketing Copy
    const copyFinding = {
      ruleId: 'CX-013',
      category: 'content',
      title: 'Generic AI-Style Marketing Copy',
      problemTitle: 'Generic AI-Style Marketing Copy',
      message: 'Unsubstantiated hyperbole and generic AI marketing clichés detected.',
      severity: 'warning' as const,
      confidence: 0.88,
      location: { filePath: '/app/index.html', line: 12 },
      evidence: [{ explanation: 'Matches "Next-gen AI powerhouse"' }],
    };
    const copyProblem = ProblemModelBuilder.build(copyFinding as any, { pageType: 'marketing' });
    expect(copyProblem.category).toBe('content');
    expect(copyProblem.constraints).toContain('preserve factual information');
  });

  it('Section 28: error safety for locations — normalizeFindingLocation never throws on undefined or malformed input', () => {
    expect(() => normalizeFindingLocation(undefined)).not.toThrow();
    expect(() => normalizeFindingLocation(null)).not.toThrow();
    expect(() => normalizeFindingLocation({} as any)).not.toThrow();
    expect(() => normalizeFindingLocation({ filePath: undefined } as any)).not.toThrow();
    expect(() => normalizeFindingLocation({ location: undefined } as any)).not.toThrow();
    expect(() => normalizeFindingLocation('random-string' as any)).not.toThrow();
    expect(() => normalizeFindingLocation({ id: 'test', ruleId: 'CP-007' } as any)).not.toThrow();

    const norm = normalizeFindingLocation(undefined);
    expect(norm).toBeUndefined();
  });

  it('Section 30: CraftLens self-audits its own detail view UI and produces zero critical/high slop findings', () => {
    const provider = new CraftLensDetailViewProvider({ fsPath: '/ext' } as any);
    provider.showBetterDesign(
      {
        id: 'CP-007',
        ruleId: 'CP-007',
        title: 'Repeated Card Treatment',
        severity: 'moderate',
        confidence: 0.94,
        location: { filePath: '/app/services.html', line: 10 },
        evidence: [{ explanation: '6 sibling cards' }],
        instances: [
          { id: '1', line: 10, location: { filePath: '/app/services.html', line: 10 } },
          { id: '2', line: 20, location: { filePath: '/app/services.html', line: 20 } },
        ],
      } as any,
      [
        {
          id: 'rec-1',
          title: '01  FEATURE + SECONDARY LIST',
          transformation: 'hierarchize',
          description: 'Make one service the visual anchor and turn the remaining services into a compact list.',
          whyItFits: ['The current cards all have identical visual weight, but the content does not require equal emphasis.'],
          evidence: ['6 sibling cards'],
          tradeoff: 'Less uniformity, stronger hierarchy.',
          affectedElements: ['.service-box'],
          confidence: 0.91,
          scope: 'section',
        },
      ]
    );

    const html = (provider as any).renderHtml();
    expect(html).toContain('BETTER DESIGN');
    expect(html).toContain('FEATURE + SECONDARY LIST');
    const report = UIAnalyzer.analyze('/craftlens-detail-view.html', html);
    expect(report.findings.filter(f => f.severity === 'critical' || f.severity === 'high')).toHaveLength(0);
  });
});
