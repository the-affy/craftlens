import { describe, it, expect } from 'vitest';
import {
  Finding,
  FindingStore,
  categorizeFinding,
  clusterFindingsToSidebarFindings,
  RecommendationEngine,
  RECOMMENDATION_REGISTRY,
  normalizeFindingLocation,
} from '../../packages/core/src/index.js';

describe('CraftLens Sidekick: Product Design & Security Teammate', () => {
  it('1. Strict categorization into 3 primary boxes: UI/UX, Backend & Tech, Security', () => {
    const uiFinding: Finding = {
      ruleId: 'CP-007',
      message: 'Card-heavy layout',
      severity: 'warning',
      confidence: 0.85,
      location: {
        filePath: '/src/Dashboard.tsx',
        start: { line: 10, column: 1, offset: 0 },
        end: { line: 20, column: 1, offset: 100 },
      },
      evidence: [],
    };

    const secFinding: Finding = {
      ruleId: 'SEC-001',
      message: 'Exposed secret detected',
      severity: 'error',
      confidence: 0.95,
      location: {
        filePath: '/src/api/auth.ts',
        start: { line: 5, column: 1, offset: 0 },
        end: { line: 5, column: 40, offset: 40 },
      },
      evidence: [],
    };

    const backendFinding: Finding = {
      ruleId: 'AP-008',
      message: 'Exception swallowed',
      severity: 'warning',
      confidence: 0.9,
      location: {
        filePath: '/src/service.ts',
        start: { line: 30, column: 3, offset: 0 },
        end: { line: 35, column: 4, offset: 50 },
      },
      evidence: [],
    };

    expect(categorizeFinding(uiFinding)).toBe('ui');
    expect(categorizeFinding(secFinding)).toBe('security');
    expect(categorizeFinding(backendFinding)).toBe('backend');
  });

  it('2. Clustering of repeated findings and human language prioritization', () => {
    // 18 button findings with identical ruleId
    const buttonFindings: Finding[] = Array.from({ length: 18 }, (_, i) => ({
      ruleId: 'UI-004',
      problemTitle: 'Pill button overuse',
      message: 'Pill button radius used everywhere',
      severity: 'warning',
      confidence: 0.85,
      location: {
        filePath: `/src/components/Button_${i}.tsx`,
        start: { line: 12 + i, column: 5, offset: 0 },
        end: { line: 12 + i, column: 20, offset: 15 },
      },
      evidence: [],
    }));

    const clustered = clusterFindingsToSidebarFindings(buttonFindings);

    // Must be clustered into exactly ONE finding, not 18 findings
    expect(clustered.length).toBe(1);
    expect(clustered[0].title).toBe('Pill button overuse');
    expect(clustered[0].instances).toBe(18);
    expect(clustered[0].locations?.length).toBe(18);
    expect(clustered[0].location?.filePath).toBe('/src/components/Button_0.tsx');

    // Human language check: senior teammate tone, no linter acronyms
    expect(clustered[0].why).toBeDefined();
    expect(clustered[0].recommendation).toBeDefined();
    expect(clustered[0].summary).not.toContain('UI-004');
  });

  it('3. Prioritization formula: Impact x Confidence x Scope', () => {
    const lowSuggestion: Finding = {
      ruleId: 'ID-005',
      problemTitle: 'Minor label contrast',
      message: 'Label could have higher contrast',
      severity: 'suggestion',
      confidence: 0.6,
      location: {
        filePath: '/src/Form.tsx',
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 10, offset: 10 },
      },
      evidence: [],
    };

    const criticalSecret: Finding = {
      ruleId: 'SEC-001',
      problemTitle: 'Secret exposed in code',
      message: 'AWS secret key in frontend',
      severity: 'error',
      confidence: 0.95,
      location: {
        filePath: '/src/config.ts',
        start: { line: 10, column: 1, offset: 0 },
        end: { line: 10, column: 50, offset: 50 },
      },
      evidence: [],
    };

    const clustered = clusterFindingsToSidebarFindings([lowSuggestion, criticalSecret]);

    // Critical secret must rank ahead of low suggestion
    expect(clustered[0].title).toBe('Secret exposed in code');
    expect(clustered[1].title).toBe('Minor label contrast');
  });

  it('4. FindingStore: segregated categories and empty states', () => {
    const store = new FindingStore();

    // Empty store -> all 3 categories empty
    const emptyCats = store.getSidebarFindingsByCategory();
    expect(emptyCats.ui).toEqual([]);
    expect(emptyCats.backend).toEqual([]);
    expect(emptyCats.security).toEqual([]);

    // Add 1 UI finding
    store.setFindingsForFile('/src/Header.tsx', [
      {
        ruleId: 'VH-007',
        problemTitle: 'Competing primary buttons',
        message: 'Two primary CTAs in header',
        severity: 'warning',
        confidence: 0.9,
        location: {
          filePath: '/src/Header.tsx',
          start: { line: 15, column: 4, offset: 0 },
          end: { line: 18, column: 5, offset: 50 },
        },
        evidence: [],
      },
    ]);

    const populatedCats = store.getSidebarFindingsByCategory();
    expect(populatedCats.ui.length).toBe(1);
    expect(populatedCats.backend.length).toBe(0);
    expect(populatedCats.security.length).toBe(0);
  });

  it('5. Recommendation Engine: suggests capabilities (skills/MCPs) ranked by findings', () => {
    const engine = new RecommendationEngine();

    // Feed with UI card-heavy and hierarchy findings
    const findings = clusterFindingsToSidebarFindings([
      {
        ruleId: 'CP-007',
        problemTitle: 'Card-heavy layout',
        message: 'Too many cards',
        severity: 'warning',
        confidence: 0.9,
        location: {
          filePath: '/src/Dashboard.tsx',
          start: { line: 10, column: 1, offset: 0 },
          end: { line: 20, column: 1, offset: 100 },
        },
        evidence: [],
      },
      {
        ruleId: 'VH-008',
        problemTitle: 'Weak visual hierarchy',
        message: 'Weak hierarchy',
        severity: 'warning',
        confidence: 0.9,
        location: {
          filePath: '/src/Dashboard.tsx',
          start: { line: 25, column: 1, offset: 0 },
          end: { line: 30, column: 1, offset: 50 },
        },
        evidence: [],
      },
    ]);

    const recs = engine.getRecommendations(findings);

    // Returns top 2-4 recommendations
    expect(recs.length).toBeGreaterThanOrEqual(2);
    expect(recs.length).toBeLessThanOrEqual(4);

    // UI/UX Design skill must be recommended
    const uiRec = recs.find(r => r.id === 'ui-design-skill');
    expect(uiRec).toBeDefined();
    expect(uiRec?.recommendedCapability).toBe('UI/UX Design Skill');
    expect(uiRec?.type).toBe('skill');
    expect(uiRec?.description).toContain('hierarchy');
  });

  it('6. Defensive Location Handling: never throws on missing/stale locations', () => {
    // Malformed/stale finding objects
    expect(normalizeFindingLocation(null)).toBeUndefined();
    expect(normalizeFindingLocation(undefined)).toBeUndefined();
    expect(normalizeFindingLocation({})).toBeUndefined();
    expect(normalizeFindingLocation({ filePath: '' })).toBeUndefined();

    // Partial range
    const valid = normalizeFindingLocation({
      location: {
        filePath: '/src/App.tsx',
        start: { line: 5, column: 2 },
      },
    });
    expect(valid).toBeDefined();
    expect(valid?.filePath).toBe('/src/App.tsx');
    expect(valid?.range.startLine).toBe(5);
    expect(valid?.range.startColumn).toBe(2);
  });
});
