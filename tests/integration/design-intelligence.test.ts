import { describe, it, expect } from 'vitest';
import {
  inferDesignIntent,
  CssAnalyzer,
  PatternMatcher,
} from '../../packages/design-intelligence/src/index.js';
import { ProjectRuleGenerator } from '../../packages/rule-engine/src/index.js';
import { createDefaultProjectContext } from '../../packages/core/src/index.js';


describe('Integration: Design Intelligence Subsystem', () => {
  it('correctly infers design intent across varied surfaces', () => {
    // 1. Dashboard
    const dashIntent = inferDesignIntent({
      filePath: '/src/dashboard/Overview.tsx',
      sourceCode: `export function Overview() { return <div><MetricCard title="Sales" /></div>; }`,
    });
    expect(dashIntent.category).toBe('dashboard');

    // 2. Marketing
    const mktIntent = inferDesignIntent({
      filePath: '/src/marketing/landing.tsx',
      sourceCode: `export function Landing() { return <HeroSection />; }`,
    });
    expect(mktIntent.category).toBe('marketing');

    // 3. Authentication
    const authIntent = inferDesignIntent({
      filePath: '/src/auth/login.tsx',
      sourceCode: `export function Login() { return <form></form>; }`,
    });
    expect(authIntent.category).toBe('authentication');

    // 4. Form
    const formIntent = inferDesignIntent({
      filePath: '/src/components/UserForm.tsx',
      sourceCode: `export function UserForm() { return <form onSubmit={handleSubmit}><input /></form>; }`,
    });
    expect(formIntent.category).toBe('form');
  });

  it('CssAnalyzer accurately identifies non-standard spacing and finds nearest token', () => {
    const context = createDefaultProjectContext();
    context.baseline.spacing = [4, 8, 12, 16, 24, 32];

    const source = `
      <div className="p-[19px] m-[7px]">Content</div>
    `;

    const findings = CssAnalyzer.findNonStandardSpacing(source, context.baseline);
    expect(findings.length).toBe(2);
    expect(findings[0].value).toBe(19);
    expect(findings[0].nearestStandard).toBe(16); // 19 is closest to 16

    expect(findings[1].value).toBe(7);
    expect(findings[1].nearestStandard).toBe(8);
  });

  it('CssAnalyzer accurately identifies non-standard border radius', () => {
    const context = createDefaultProjectContext();
    context.baseline.radius = [4, 8, 12, 16];

    const source = `<div className="rounded-[22px]">Card</div>`;
    const findings = CssAnalyzer.findNonStandardRadius(source, context.baseline);
    expect(findings.length).toBe(1);
    expect(findings[0].value).toBe(22);
    expect(findings[0].nearestStandard).toBe(16);
  });

  it('PatternMatcher correlates multi-factor generic SaaS clusters without simplistic purple bans', () => {
    const context = createDefaultProjectContext();
    context.baseline.brandColors = ['#0f172a', '#3b82f6']; // Not purple

    // Case A: Generic cluster (purple gradient + centered hero + floating translucent cards + generic CTA copy + 3 cards)
    const genericCode = `
      export function SaaSBoilerplate() {
        return (
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-center mx-auto max-w-3xl text-5xl tracking-tight">
            <h1>Transform your workflow with Next-generation platform</h1>
            <button>Get Started Today</button>
            <div className="shadow-2xl backdrop-blur rounded-2xl bg-white/10">Floating Card</div>
            <div className="grid grid-cols-3">
              <Card>A</Card>
              <Card>B</Card>
              <Card>C</Card>
            </div>
          </div>
        );
      }
    `;

    const cluster = PatternMatcher.evaluateGenericTemplatePattern(genericCode, context);
    expect(cluster.matchedCount).toBeGreaterThanOrEqual(4);
    expect(cluster.evidenceItems.length).toBeGreaterThanOrEqual(4);

    // Case B: Clean product with intentional purple brand color
    const brandContext = createDefaultProjectContext();
    brandContext.baseline.brandColors = ['#7c3aed', '#6366f1']; // Project intentionally uses purple!
    const cleanBrandCode = `
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6">
        <h2>Analytics Overview</h2>
      </div>
    `;

    const brandCluster = PatternMatcher.evaluateGenericTemplatePattern(cleanBrandCode, brandContext);
    // Since purple is established in brandColors, it is not flagged as an unestablished gradient
    expect(brandCluster.matchedCount).toBe(0);
  });

  it('ProjectRuleGenerator detects project baseline conventions and generates declarative rules', () => {
    const context = createDefaultProjectContext('/virtual/project');
    context.baseline.spacing = [4, 8, 12, 16, 24, 32];
    context.baseline.radius = [8, 12, 16];
    context.baseline.components = ['Button', 'Modal', 'Card'];

    const summary = ProjectRuleGenerator.detectAndGenerateRules(context);
    expect(summary.conventions.length).toBeGreaterThanOrEqual(3);
    expect(summary.conventions.some(c => c.includes('spacing'))).toBe(true);
    expect(summary.conventions.some(c => c.includes('Button'))).toBe(true);

    const yaml = ProjectRuleGenerator.formatRulesYaml(summary.rules);
    expect(yaml).toContain('CONV-SPACING');
    expect(yaml).toContain('CONV-RADIUS');
    expect(yaml).toContain('CONV-REUSE-BUTTON');
  });
});
