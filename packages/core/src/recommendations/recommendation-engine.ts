import { SidebarFinding, Recommendation } from '../types/sidebar-finding.js';
import { ProjectContext } from '../types/context.js';

export const RECOMMENDATION_REGISTRY: Recommendation[] = [
  {
    id: 'ui-design-skill',
    title: 'UI/UX Design Skill',
    description:
      'Your interface has repeated card patterns and weak hierarchy. A UI design skill helps structure information, balance visual weight, and replace card soup with purposeful grouping.',
    category: 'ui',
    triggers: [
      'card-soup',
      'weak-hierarchy',
      'generic-layout',
      'design-system-drift',
      'CP-007',
      'CP-008',
      'VH-007',
      'VH-008',
      'UI-001',
      'UI-004',
      'UI-009',
    ],
    type: 'skill',
    relevanceScore: 0,
    recommendedCapability: 'UI/UX Design Skill',
    details: [
      'Visual hierarchy and scannability improvements',
      'Reducing nested card containers',
      'Primary vs supporting information balance',
      'Scannable dashboard and table layouts',
    ],
    actionLabel: 'View Skill',
  },
  {
    id: 'design-system-skill',
    title: 'Design System Skill',
    description:
      'Several components use slightly different spacing, radius, and button styles. A design system skill can establish consistent token scales and component patterns.',
    category: 'ui',
    triggers: [
      'CX-004',
      'CX-005',
      'CX-013',
      'design-system-drift',
      'spacing-scale',
      'radius-drift',
      'button-drift',
    ],
    type: 'skill',
    relevanceScore: 0,
    recommendedCapability: 'Design System Skill',
    details: [
      'Spacing scale consistency (4 / 8 / 12 / 16 / 24 / 32)',
      'Corner radius consolidation (4 / 8 / 12 / 16)',
      'Typography hierarchy and weight discipline',
      'Reusable Button, Card, and Input components',
    ],
    actionLabel: 'View Skill',
  },
  {
    id: 'responsive-layout-audit',
    title: 'Responsive Layout Audit',
    description:
      'A layout or component causes horizontal overflow or lacks a responsive adaptation strategy at narrow viewports.',
    category: 'ui',
    triggers: [
      'UI-022',
      'UI-009',
      'responsive-overflow',
      'overflow-behavior',
      'fixed-width',
      'table-overflow',
      'horizontal-scroll',
    ],
    type: 'skill',
    relevanceScore: 0,
    recommendedCapability: 'Responsive UI Review',
    relevantTool: 'Browser/render inspection',
    why: 'The detected table or container overflows at narrow widths or lacks a responsive adaptation strategy.',
    details: [
      'Audit table, grid, and container wrapping on narrow viewports',
      'Replace fixed pixel widths with fluid max-width constraints',
      'Verify touch target sizes and hidden overflow behavior',
    ],
    actionLabel: 'View Skill',
  },
  {
    id: 'template-review-skill',
    title: 'Design System & Template Review',
    description:
      'Template-like section repetition or visual treatment overload was detected across routes. Establish product-specific hierarchy and consolidated design tokens.',
    category: 'ui',
    triggers: [
      'UI-020',
      'UI-016',
      'UI-015',
      'UI-014',
      'UI-017',
      'template-fingerprint',
      'template-convergence',
      'ai-signature',
      'card-soup',
      'visual-overload',
      'generic-saas-hero',
    ],
    type: 'skill',
    relevanceScore: 0,
    recommendedCapability: 'Design System Review',
    relevantTool: 'Cross-screen & layout analyzer',
    why: 'Template-like section repetition or visual treatment overload detected across routes.',
    details: [
      'Replace repeated three-card grids with task-appropriate layouts',
      'Unify spacing, radii, and typography scales across screens',
      'Differentiate hero and feature presentation according to content',
    ],
    actionLabel: 'View Skill',
  },
  {
    id: 'frontend-security-review',
    title: 'Security Review Skill',
    description:
      'Your frontend handles authentication or sensitive credentials on the client. A security review skill helps verify token storage, authorization, and client/server trust boundaries.',
    category: 'security',
    triggers: [
      'SEC-001',
      'SEC-002',
      'SEC-003',
      'exposed-secret',
      'insecure-storage',
      'auth-client',
      'trust-boundary',
    ],
    type: 'skill',
    relevanceScore: 0,
    recommendedCapability: 'Security Review Skill',
    details: [
      'Secure token storage (HttpOnly cookies vs localStorage)',
      'Client and server trust boundaries',
      'Sensitive credential leak prevention',
      'Safe HTML rendering and sanitized output',
    ],
    actionLabel: 'View Skill',
  },
  {
    id: 'security-audit-mcp',
    title: 'Security Audit MCP',
    description:
      'Backend endpoints or server handlers may lack complete authorization checks. A security audit MCP can systematically test API route permissions and error leakage.',
    category: 'security',
    triggers: [
      'SEC-B01',
      'SEC-P01',
      'missing-auth',
      'idor',
      'error-leakage',
      'stack-trace',
    ],
    type: 'mcp',
    relevanceScore: 0,
    recommendedCapability: 'Security Audit MCP',
    details: [
      'Automated endpoint permission verification',
      'Parameter tampering and IDOR protection',
      'Error stack and internal trace sanitization',
    ],
    actionLabel: 'View MCP',
  },
  {
    id: 'backend-reliability-skill',
    title: 'Backend Reliability Skill',
    description:
      'Several operations silently swallow exceptions or rely on compiler escape hatches. A backend reliability skill can implement structured error reporting and robust typing.',
    category: 'backend',
    triggers: [
      'AP-008',
      'AP-014',
      'CD-001',
      'RE-001',
      'error-handling',
      'exception-swallowing',
      'compiler-escape',
      'fragile-state',
    ],
    type: 'skill',
    relevanceScore: 0,
    recommendedCapability: 'Backend Reliability Skill',
    details: [
      'Contextual error boundaries and logging',
      'Eliminating silent try/catch blocks',
      'Strict TypeScript contracts without any casts',
      'Predictable async and derived state flows',
    ],
    actionLabel: 'View Skill',
  },
  {
    id: 'visual-qa-skill',
    title: 'Visual QA & Accessibility Skill',
    description:
      'Interactive controls are missing accessible names or exhibit high visual noise in operational surfaces. A visual QA skill helps streamline contrast and keyboard navigation.',
    category: 'ui',
    triggers: [
      'AX-016',
      'UX-017',
      'UX-018',
      'UX-019',
      'ID-001',
      'UI-002',
      'UI-005',
      'UI-010',
    ],
    type: 'skill',
    relevanceScore: 0,
    recommendedCapability: 'Visual QA Skill',
    details: [
      'Accessible naming for icon buttons and inputs',
      'Focus indicators and keyboard operability',
      'Reducing gratuitous decorative glow effects',
    ],
    actionLabel: 'View Skill',
  },
];

export class RecommendationEngine {
  private registry: Recommendation[];

  constructor(customRegistry?: Recommendation[]) {
    this.registry = customRegistry || [...RECOMMENDATION_REGISTRY];
  }

  /**
   * Generates ranked recommendations based on detected findings and project context.
   * Returns between 2 and 4 recommendations (Section 27).
   */
  public getRecommendations(
    findings: SidebarFinding[],
    _context?: ProjectContext
  ): Recommendation[] {
    const scored: Recommendation[] = this.registry.map(rec => ({
      ...rec,
      relevanceScore: 0,
    }));

    // Find trigger matches in findings
    for (const f of findings) {
      const findingKeys = [
        f.ruleId || '',
        f.id || '',
        f.title.toLowerCase().replace(/\s+/g, '-'),
        f.category,
      ];

      for (const rec of scored) {
        let matchCount = 0;
        for (const trig of rec.triggers) {
          if (findingKeys.some(k => k.toLowerCase().includes(trig.toLowerCase()))) {
            matchCount++;
          }
        }

        if (matchCount > 0) {
          // Weight by finding severity and instances
          const weight = f.severity === 'critical' ? 4 : f.severity === 'high' ? 3 : f.severity === 'medium' ? 2 : 1;
          rec.relevanceScore += matchCount * weight * (1 + 0.2 * Math.min(f.instances, 10));
        }
      }
    }

    // Filter to those with positive scores
    const active = scored.filter(r => r.relevanceScore > 0);

    // If we have active matches, sort descending by relevance score
    if (active.length >= 2) {
      active.sort((a, b) => b.relevanceScore - a.relevanceScore);
      return active.slice(0, 4);
    } else if (active.length === 1) {
      // Complement with a secondary recommendation from the registry
      const first = active[0];
      const secondary =
        this.registry.find(r => r.id !== first.id && r.category === first.category) ||
        this.registry.find(r => r.id !== first.id);
      return secondary ? [first, secondary] : [first];
    }

    // Default sensible recommendations if no specific triggers fired
    return [
      {
        ...this.registry[0],
        description: 'Keep your interface hierarchy clear and scannable across all views.',
        relevanceScore: 1,
      },
      {
        ...this.registry[2],
        description: 'Regularly audit authentication flows and client storage safety.',
        relevanceScore: 1,
      },
    ];
  }
}
