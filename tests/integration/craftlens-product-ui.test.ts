import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  FindingStore,
  clusterFindingsToSidebarFindings,
  normalizeFindingLocation,
  ProjectContext,
  Finding,
} from '@craftlens/core';
import { RecommendationEngine } from '@craftlens/core';
import { RuleRegistry, RuleEngine, registerDefaultRules } from '@craftlens/rule-engine';
import {
  UIAnalyzer,
  SignalEngine,
  PatternEngine,
  ContextReasoner,
  CrossScreenEngine,
  RenderAnalyzer,
  AiPromptBuilder,
  DesignModeSelector,
} from '@craftlens/design-intelligence';
import { UnifiedUIParser } from '@craftlens/parser';

describe('CraftLens Product UI Master Reasoning Integration (craftlens-product-ui-SKILL.md)', () => {
  let registry: RuleRegistry;
  let engine: RuleEngine;

  beforeEach(() => {
    registry = new RuleRegistry();
    registerDefaultRules(registry);
    engine = new RuleEngine(registry);
    UIAnalyzer.clearCache();
    CrossScreenEngine.clear();
  });

  describe('1. Non-Negotiable Anti-Pattern Policy: Isolated Signals Do NOT Produce Findings', () => {
    it('Purple alone does NOT produce a visual slop finding', () => {
      const code = `
        export function PurpleHero() {
          return (
            <div style={{ backgroundColor: '#8b5cf6', color: '#ffffff', padding: '32px' }}>
              <h1>Product Analytics Platform</h1>
              <p>Monitor your active system metrics in real-time.</p>
            </div>
          );
        }
      `;
      const doc = UnifiedUIParser.parse('/src/PurpleHero.tsx', code);
      const sigs = SignalEngine.extract(doc);
      const patterns = PatternEngine.recognize(doc, sigs);
      const evals = ContextReasoner.evaluate(doc, patterns);

      // Isolated purple does NOT produce any visual slop findings
      expect(evals.some(e => e.pattern.type === 'ai_signature_stack' && e.shouldReport)).toBe(false);
      expect(evals.some(e => e.pattern.type === 'visual_treatment_overload' && e.shouldReport)).toBe(false);
      expect(evals.filter(e => e.shouldReport).length).toBe(0);
    });

    it('Cards alone do NOT produce a finding when used purposefully', () => {
      const code = `
        export function UserProfile() {
          return (
            <div className="card border rounded-lg p-6 bg-white">
              <h2>Account Settings</h2>
              <p>Manage your account preferences and credentials.</p>
            </div>
          );
        }
      `;
      const doc = UnifiedUIParser.parse('/src/UserProfile.tsx', code);
      const sigs = SignalEngine.extract(doc);
      const patterns = PatternEngine.recognize(doc, sigs);
      const evals = ContextReasoner.evaluate(doc, patterns);

      expect(evals.some(e => e.pattern.type === 'card_soup' && e.shouldReport)).toBe(false);
    });

    it('Gradients alone do NOT produce a finding', () => {
      const code = `
        export function AccentBanner() {
          return (
            <div style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', padding: '24px', color: 'white' }}>
              <h2>Weekly Maintenance Window</h2>
              <p>Scheduled database indexing will occur on Sunday at 02:00 UTC.</p>
            </div>
          );
        }
      `;
      const doc = UnifiedUIParser.parse('/src/AccentBanner.tsx', code);
      const sigs = SignalEngine.extract(doc);
      const patterns = PatternEngine.recognize(doc, sigs);
      const evals = ContextReasoner.evaluate(doc, patterns);

      expect(evals.some(e => e.pattern.type === 'ai_signature_stack' && e.shouldReport)).toBe(false);
      expect(evals.some(e => e.pattern.type === 'visual_treatment_overload' && e.shouldReport)).toBe(false);
    });

    it('Inter / Geist font alone does NOT trigger a finding', () => {
      const code = `
        export function DocumentView() {
          return (
            <div style={{ fontFamily: 'Inter, sans-serif', padding: '16px' }}>
              <h1>System Audit Log</h1>
              <p>All recorded administrative events from the past 24 hours.</p>
            </div>
          );
        }
      `;
      const doc = UnifiedUIParser.parse('/src/DocumentView.tsx', code);
      const sigs = SignalEngine.extract(doc);
      const patterns = PatternEngine.recognize(doc, sigs);
      const evals = ContextReasoner.evaluate(doc, patterns);

      expect(evals.filter(e => e.shouldReport).length).toBe(0);
    });
  });

  describe('2. Multi-Signal Corroboration & Pattern Recognition', () => {
    it('Corroborating signals trigger Strong Template-Like Visual Pattern with high confidence', () => {
      const slopCode = `
        export function VibeCodedHero() {
          return (
            <div style={{ background: 'linear-gradient(to right, #8b5cf6, #ec4899)', padding: '80px 20px', textAlign: 'center' }}>
              <div style={{ boxShadow: '0 0 50px rgba(139, 92, 246, 0.5)' }}>
                <span className="pill">✨ AI-Powered Workflow</span>
                <h1 style={{ fontSize: '72px', fontWeight: 800, background: 'linear-gradient(to right, #ffffff, #c084fc)', WebkitBackgroundClip: 'text' }}>
                  Supercharge Your Productivity
                </h1>
                <p>The effortless, revolutionary, seamless solution for modern teams.</p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
                  <button className="rounded-full">Get Started</button>
                  <button className="rounded-full">Learn More</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginTop: '40px' }}>
                  <div className="card rounded-2xl border shadow-2xl p-6 backdrop-blur">
                    <span>⚡</span>
                    <h3>Lightning Fast</h3>
                    <p>Experience unmatched velocity with our next-gen tools.</p>
                  </div>
                  <div className="card rounded-2xl border shadow-2xl p-6 backdrop-blur">
                    <span>🔒</span>
                    <h3>Enterprise Security</h3>
                    <p>World-class protection with zero configuration needed.</p>
                  </div>
                  <div className="card rounded-2xl border shadow-2xl p-6 backdrop-blur">
                    <span>✨</span>
                    <h3>Magic Automation</h3>
                    <p>Automate everything seamlessly without touching a line of code.</p>
                  </div>
                </div>
              </div>
            </div>
          );
        }
      `;

      const report = UIAnalyzer.analyze('/src/VibeCodedHero.tsx', slopCode);

      // Verify signals extracted
      expect(report.signalsResult.signals.length).toBeGreaterThanOrEqual(5);

      // Verify patterns recognized
      const patternTypes = report.recognizedPatterns.map(p => p.type);
      expect(patternTypes).toContain('generic_saas_hero');
      expect(patternTypes).toContain('template_fingerprint');
      expect(patternTypes).toContain('ai_signature_stack');

      // Verify rule UI-016 finding details
      const ui016 = report.findings.find(f => f.ruleId === 'UI-016');
      expect(ui016).toBeDefined();

      // STRICT REQUIREMENT: Must say "Strong template-like visual pattern", NOT "AI-generated"
      expect(ui016?.problemTitle).toBe('Strong template-like visual pattern');
      expect(ui016?.problemTitle?.toLowerCase()).not.toContain('ai-generated');
      expect(ui016?.whatIsWrong?.toLowerCase()).not.toContain('ai-generated');

      // Confidence must be high due to multiple corroborating signals
      expect(ui016?.confidence).toBeGreaterThanOrEqual(0.85);

      // Verification criteria must be present
      expect(ui016?.verification).toBeDefined();
    });
  });

  describe('3. Layer 3: Product Context Reasoning & False-Positive Dampening', () => {
    it('Established brand color in DESIGN.md dampens or suppresses purple gradient findings', () => {
      const code = `
        export function BrandBanner() {
          return (
            <div style={{ background: 'linear-gradient(to right, #8b5cf6, #7c3aed)', padding: '40px', color: '#fff' }}>
              <h2>Team Collaboration Portal</h2>
              <p>Review active engineering specifications and RFC documents.</p>
              <button>Open RFC List</button>
            </div>
          );
        }
      `;

      // Context with brand color purple registered
      const brandContext: ProjectContext = {
        productMeta: {
          productType: 'application',
          expectedDensity: 'compact',
          brandColors: ['#8b5cf6', 'purple', 'violet'],
          intentionalPatterns: ['purple-brand-accent'],
        },
      };

      const doc = UnifiedUIParser.parse('/src/BrandBanner.tsx', code);
      const sigs = SignalEngine.extract(doc);
      const patterns = PatternEngine.recognize(doc, sigs);
      const evals = ContextReasoner.evaluate(doc, patterns, brandContext);

      // Findings should be dampened or suppressed with an explanatory falsePositiveNote
      const aiStack = evals.find(e => e.pattern.type === 'ai_signature_stack');
      if (aiStack) {
        expect(aiStack.shouldReport).toBe(false);
        expect(aiStack.falsePositiveNote).toContain('brand color');
      }
    });

    it('Dashboard product context justifies dense card grid', () => {
      const dashboardCode = `
        export function MetricsDashboard() {
          return (
            <div className="grid grid-cols-4 gap-4 p-4">
              <div className="metric-card border rounded p-3">
                <span className="text-xs">CPU Utilization</span>
                <span className="text-xl font-bold">42%</span>
              </div>
              <div className="metric-card border rounded p-3">
                <span className="text-xs">Memory Used</span>
                <span className="text-xl font-bold">3.2 GB</span>
              </div>
              <div className="metric-card border rounded p-3">
                <span className="text-xs">Active Connections</span>
                <span className="text-xl font-bold">1,420</span>
              </div>
              <div className="metric-card border rounded p-3">
                <span className="text-xs">Error Rate</span>
                <span className="text-xl font-bold">0.01%</span>
              </div>
            </div>
          );
        }
      `;

      const dashboardContext: ProjectContext = {
        productMeta: {
          productType: 'dashboard',
          expectedDensity: 'dense',
          intentionalPatterns: ['metric-kpi-grid'],
        },
      };

      const doc = UnifiedUIParser.parse('/src/MetricsDashboard.tsx', dashboardCode);
      const sigs = SignalEngine.extract(doc);
      const patterns = PatternEngine.recognize(doc, sigs);
      const evals = ContextReasoner.evaluate(doc, patterns, dashboardContext);

      // Card soup should be suppressed because KPI metrics cards are expected in a dashboard
      const cardSoup = evals.find(e => e.pattern.type === 'card_soup');
      if (cardSoup) {
        expect(cardSoup.shouldReport).toBe(false);
      }
    });
  });

  describe('4. Cross-Screen Reasoning & Convergence', () => {
    it('Detects template convergence across multiple routes and produces 1 aggregated finding with relatedLocations', () => {
      const screen1 = `
        export function LandingPage() {
          return (
            <section className="hero text-center py-20">
              <h1 className="text-5xl font-bold">Build Software Faster</h1>
              <p>Everything your team needs to ship today.</p>
              <div className="flex gap-4 justify-center">
                <button>Get Started</button>
                <button>Learn More</button>
              </div>
              <div className="grid grid-cols-3 gap-6 mt-12">
                <div className="card rounded-2xl border p-6"><h3>Feature 1</h3><p>Detail</p></div>
                <div className="card rounded-2xl border p-6"><h3>Feature 2</h3><p>Detail</p></div>
                <div className="card rounded-2xl border p-6"><h3>Feature 3</h3><p>Detail</p></div>
              </div>
            </section>
          );
        }
      `;

      const screen2 = `
        export function PricingPage() {
          return (
            <section className="hero text-center py-20">
              <h1 className="text-5xl font-bold">Simple, Transparent Pricing</h1>
              <p>Everything your team needs to ship today.</p>
              <div className="flex gap-4 justify-center">
                <button>Get Started</button>
                <button>Learn More</button>
              </div>
              <div className="grid grid-cols-3 gap-6 mt-12">
                <div className="card rounded-2xl border p-6"><h3>Tier 1</h3><p>Detail</p></div>
                <div className="card rounded-2xl border p-6"><h3>Tier 2</h3><p>Detail</p></div>
                <div className="card rounded-2xl border p-6"><h3>Tier 3</h3><p>Detail</p></div>
              </div>
            </section>
          );
        }
      `;

      const screen3 = `
        export function FeaturesPage() {
          return (
            <section className="hero text-center py-20">
              <h1 className="text-5xl font-bold">Unmatched Capabilities</h1>
              <p>Everything your team needs to ship today.</p>
              <div className="flex gap-4 justify-center">
                <button>Get Started</button>
                <button>Learn More</button>
              </div>
              <div className="grid grid-cols-3 gap-6 mt-12">
                <div className="card rounded-2xl border p-6"><h3>Capability 1</h3><p>Detail</p></div>
                <div className="card rounded-2xl border p-6"><h3>Capability 2</h3><p>Detail</p></div>
                <div className="card rounded-2xl border p-6"><h3>Capability 3</h3><p>Detail</p></div>
              </div>
            </section>
          );
        }
      `;

      const doc1 = UnifiedUIParser.parse('/src/routes/index.tsx', screen1);
      const doc2 = UnifiedUIParser.parse('/src/routes/pricing.tsx', screen2);
      const doc3 = UnifiedUIParser.parse('/src/routes/features.tsx', screen3);

      CrossScreenEngine.clear();
      CrossScreenEngine.registerScreen(doc1, PatternEngine.recognize(doc1, SignalEngine.extract(doc1)));
      CrossScreenEngine.registerScreen(doc2, PatternEngine.recognize(doc2, SignalEngine.extract(doc2)));
      CrossScreenEngine.registerScreen(doc3, PatternEngine.recognize(doc3, SignalEngine.extract(doc3)));

      const convergenceFindings = CrossScreenEngine.detectCrossScreenConvergence();

      // Exactly 1 aggregated finding, not 20 duplicate findings
      expect(convergenceFindings.length).toBe(1);
      const conv = convergenceFindings[0];
      expect(conv.ruleId).toBe('UI-020');
      expect(conv.problemTitle).toBe('Template convergence across routes');
      expect(conv.primaryLocation).toBeDefined();
      expect(conv.relatedLocations?.length).toBeGreaterThanOrEqual(2);
    });

    it('Preserves intentional design-system consistency across settings forms without flagging', () => {
      const settingsAccount = `
        export function AccountSettings() {
          return (
            <form className="settings-form max-w-xl space-y-4">
              <h2>Account Settings</h2>
              <div><label>Name</label><input type="text" /></div>
              <button type="submit">Save</button>
            </form>
          );
        }
      `;

      const settingsSecurity = `
        export function SecuritySettings() {
          return (
            <form className="settings-form max-w-xl space-y-4">
              <h2>Security Settings</h2>
              <div><label>Password</label><input type="password" /></div>
              <button type="submit">Update</button>
            </form>
          );
        }
      `;

      const doc1 = UnifiedUIParser.parse('/src/routes/settings/account.tsx', settingsAccount);
      const doc2 = UnifiedUIParser.parse('/src/routes/settings/security.tsx', settingsSecurity);

      CrossScreenEngine.clear();
      CrossScreenEngine.registerScreen(doc1, PatternEngine.recognize(doc1, SignalEngine.extract(doc1)));
      CrossScreenEngine.registerScreen(doc2, PatternEngine.recognize(doc2, SignalEngine.extract(doc2)));

      const convergenceFindings = CrossScreenEngine.detectCrossScreenConvergence();
      expect(convergenceFindings.length).toBe(0);
    });
  });

  describe('5. Render Analysis Capability: Honest Reporting', () => {
    it('Reports render analysis unavailable when rendering environment is absent without faking screenshots', () => {
      const code = `<div className="p-4"><h1>Static View</h1></div>`;
      const doc = UnifiedUIParser.parse('/src/StaticView.tsx', code);

      const renderReport = RenderAnalyzer.analyze(doc);
      expect(renderReport.isRenderAvailable).toBe(false);
      expect(renderReport.statusMessage).toContain('render analysis unavailable');
    });

    it('Detects fixed container width overflow risk during render analysis when enabled', () => {
      const overflowCode = `
        export function WideTableContainer() {
          return (
            <div style={{ width: '1280px', overflowX: 'hidden' }}>
              <table>
                <thead><tr><th>Col 1</th><th>Col 2</th><th>Col 3</th><th>Col 4</th></tr></thead>
                <tbody><tr><td>Data 1</td><td>Data 2</td><td>Data 3</td><td>Data 4</td></tr></tbody>
              </table>
            </div>
          );
        }
      `;

      const doc = UnifiedUIParser.parse('/src/WideTableContainer.tsx', overflowCode);
      const renderReport = RenderAnalyzer.analyze(doc, { isRenderAvailable: true, viewportWidth: 375 });

      expect(renderReport.isRenderAvailable).toBe(true);
      expect(renderReport.overflowRisks.length).toBeGreaterThan(0);
      expect(renderReport.findings.some(f => f.ruleId === 'UI-022')).toBe(true);
    });
  });

  describe('6. Recommendation Engine Grounding in Findings (Section 16)', () => {
    it('Recommends Responsive Layout Audit specifically when responsive overflow is detected', () => {
      const engine = new RecommendationEngine();
      const findings = clusterFindingsToSidebarFindings([
        {
          ruleId: 'UI-022',
          problemTitle: 'Responsive overflow risk',
          message: 'Table with fixed 1280px width overflows on mobile screens',
          severity: 'warning',
          confidence: 0.9,
          location: { filePath: '/src/Table.tsx', start: { line: 10, column: 1, offset: 0 }, end: { line: 20, column: 1, offset: 100 } },
          evidence: [],
        },
      ]);

      const recs = engine.getRecommendations(findings);
      expect(recs.some(r => r.id === 'responsive-layout-audit')).toBe(true);

      const respRec = recs.find(r => r.id === 'responsive-layout-audit');
      expect(respRec?.relevantTool).toBe('Browser/render inspection');
      expect(respRec?.recommendedCapability).toBe('Responsive UI Review');
    });

    it('Recommends Design System & Template Review when template convergence is detected', () => {
      const engine = new RecommendationEngine();
      const findings = clusterFindingsToSidebarFindings([
        {
          ruleId: 'UI-020',
          problemTitle: 'Template convergence across routes',
          message: 'Repeated identical hero and three-card grid across 4 pages',
          severity: 'warning',
          confidence: 0.92,
          location: { filePath: '/src/routes/index.tsx', start: { line: 5, column: 1, offset: 0 }, end: { line: 15, column: 1, offset: 50 } },
          evidence: [],
        },
      ]);

      const recs = engine.getRecommendations(findings);
      expect(recs.some(r => r.id === 'template-review-skill')).toBe(true);
      const tmplRec = recs.find(r => r.id === 'template-review-skill');
      expect(tmplRec?.relevantTool).toBe('Cross-screen & layout analyzer');
    });
  });

  describe('7. AI Prompt Builder (Section 26)', () => {
    it('Constructs a compact contextual prompt with required sections without dumping entire project', () => {
      const prompt = AiPromptBuilder.buildContextualPrompt({
        filePath: '/src/components/Hero.tsx',
        sourceSlice: `<div className="hero"><h1>Test</h1></div>`,
        productContext: {
          productMeta: {
            productType: 'dashboard',
            expectedDensity: 'dense',
            brandColors: ['#1e40af'],
          },
        },
        userTask: 'Audit & Polish',
        signals: [
          { id: 'sig-1', type: 'gradient', source: 'style', value: 'linear-gradient(to right, #1e40af, #3b82f6)', evidence: 'gradient' },
        ],
        patterns: [
          { id: 'pat-1', type: 'generic_saas_hero', signals: ['sig-1'], scope: 'component', confidence: 0.7, evidence: ['hero'] },
        ],
      });

      expect(prompt).toContain('## PRODUCT CONTEXT');
      expect(prompt).toContain('## DESIGN SYSTEM');
      expect(prompt).toContain('## USER TASK');
      expect(prompt).toContain('## RELEVANT SOURCE');
      expect(prompt).toContain('## EXTRACTED SIGNALS');
      expect(prompt).toContain('## DETECTED PATTERNS');
      expect(prompt).toContain('## REASONING INSTRUCTIONS');
      expect(prompt).toContain('Strong template-like visual pattern');
      expect(prompt).not.toContain('AI-generated');
    });
  });

  describe('8. Safe Source Navigation & Location Handling (Section 12)', () => {
    it('Safely handles missing or malformed locations without crashing', () => {
      expect(normalizeFindingLocation(undefined)).toBeUndefined();
      expect(normalizeFindingLocation(null)).toBeUndefined();
      expect(normalizeFindingLocation({})).toBeUndefined();
      expect(normalizeFindingLocation({ filePath: '' })).toBeUndefined();

      const validLoc = normalizeFindingLocation({
        location: {
          filePath: '/src/Button.tsx',
          start: { line: 14, column: 3 },
          end: { line: 14, column: 25 },
        },
      });
      expect(validLoc).toBeDefined();
      expect(validLoc?.filePath).toBe('/src/Button.tsx');
      expect(validLoc?.range.startLine).toBe(14);
    });
  });

  describe('9. Design Intelligence Modes (Section 15)', () => {
    it('Activates only the minimum requested design mode', () => {
      const auditSpec = DesignModeSelector.getModeSpecification('audit');
      expect(auditSpec.mode).toBe('audit');
      expect(auditSpec.maxFindings).toBe(3);

      const polishSpec = DesignModeSelector.getModeSpecification('polish');
      expect(polishSpec.mode).toBe('polish');
      expect(polishSpec.preservesScope).toBe(true);

      const distillSpec = DesignModeSelector.getModeSpecification('distill');
      expect(distillSpec.mode).toBe('distill');
    });
  });
});
