import { SkillManifest, SkillPackage, SkillVersion } from '../types/skill.js';
import { computeSkillContentHash } from './hasher.js';

export interface BuiltinSkillDefinition {
  manifest: SkillManifest;
  ruleIds: string[];
  guidance: { id: string; title: string; content: string; category?: string }[];
  recommendations: { summary: string; why: string; howToFix: string }[];
}

export const BUILTIN_SKILL_DEFINITIONS: BuiltinSkillDefinition[] = [
  {
    manifest: {
      name: 'craftlens-core',
      displayName: 'CraftLens Core',
      version: '1.0.0',
      description: 'Core code quality, exception handling, type integrity, and baseline quality rules',
      author: 'CraftLens Team',
      license: 'MIT',
      source: { type: 'builtin', id: 'craftlens-core' },
      engineCompatibility: '>=1.0.0',
      mode: 'augment',
    },
    ruleIds: ['AP-008', 'AP-014', 'FN-015', 'CD-001', 'PH-011'],
    guidance: [
      {
        id: 'core.clean-code',
        title: 'Core Code Quality Baseline',
        content: 'Handle errors explicitly, avoid loose type escapes like any, and avoid unhandled promises.',
        category: 'code',
      },
    ],
    recommendations: [
      {
        summary: 'Log or handle errors gracefully without silent catch blocks.',
        why: 'Swallowing errors hides failures and causes cascading state corruption.',
        howToFix: 'Add meaningful error logging or rethrow custom domain errors.',
      },
    ],
  },
  {
    manifest: {
      name: 'craftlens-product-ui',
      displayName: 'Product/UI Intelligence',
      version: '1.0.0',
      description: 'Senior designer reasoning, cross-screen coherence, intent validation, and non-generic product design',
      author: 'CraftLens Team',
      license: 'MIT',
      source: { type: 'builtin', id: 'craftlens-product-ui' },
      engineCompatibility: '>=1.0.0',
      mode: 'augment',
    },
    ruleIds: [
      'UI-013',
      'UI-014',
      'UI-015',
      'UI-016',
      'UI-017',
      'UI-019',
      'UI-020',
      'CP-007',
      'CP-008',
      'ID-001',
      'ID-004',
      'ID-005',
    ],
    guidance: [
      {
        id: 'product-ui.intent-first',
        title: 'Intent-First Product Design',
        content: 'Every element should serve a tangible user intent or decision. Avoid decorative filler cards.',
        category: 'ui',
      },
    ],
    recommendations: [
      {
        summary: 'Design around specific user workflows instead of generic template containers.',
        why: 'Statistically averaged templates make applications feel ungrounded and clone-like.',
        howToFix: 'Group data by functional relevance and choose appropriate visual containers.',
      },
    ],
  },
  {
    manifest: {
      name: 'anti-ai-ui',
      displayName: 'Anti-AI UI',
      version: '1.0.0',
      description: 'Detects telltale AI-generated interface patterns, gratuitous glows, purple gradient stacks, and emoji decorations',
      author: 'Vanszs',
      license: 'MIT',
      source: { type: 'builtin', id: 'anti-ai-ui' },
      repository: 'https://github.com/Vanszs/Anti-AI-UI',
      homepage: 'https://github.com/Vanszs/Anti-AI-UI',
      engineCompatibility: '>=1.0.0',
      mode: 'augment',
    },
    ruleIds: [
      'UI-001',
      'UI-002',
      'UI-003',
      'UI-004',
      'UI-005',
      'UI-009_BADGES',
      'UI-010_EMOJI',
    ],
    guidance: [
      {
        id: 'anti-ai.subtlety',
        title: 'Avoid AI Visual Clichés',
        content: 'Avoid purple-violet gradients, dark cards with glowing borders, and emoji icons in feature cards.',
        category: 'ui',
      },
    ],
    recommendations: [
      {
        summary: 'Use subtle background contrast and curated brand palettes instead of neon gradients.',
        why: 'Template-like gradients and decorative glows immediately signal unreviewed AI generated code.',
        howToFix: 'Replace bright multi-stop gradients with solid semantic tokens or subtle neutral shades.',
      },
    ],
  },
  {
    manifest: {
      name: 'ui-ux-pro-max',
      displayName: 'UI/UX Intelligence',
      version: '1.0.0',
      description: 'Hierarchy optimization, copy clarity, typography rhythm, and senior UX review criteria',
      author: 'CraftLens Team',
      license: 'MIT',
      source: { type: 'builtin', id: 'ui-ux-pro-max' },
      engineCompatibility: '>=1.0.0',
      mode: 'augment',
    },
    ruleIds: ['VH-007', 'VH-008', 'CP-002', 'CP-006', 'TY-001', 'TY-003'],
    guidance: [
      {
        id: 'ui-ux.hierarchy',
        title: 'Visual Hierarchy & Copy Clarity',
        content: 'Ensure each screen has a single primary action and copy that tells the user what happens next.',
        category: 'ux',
      },
    ],
    recommendations: [
      {
        summary: 'Ensure distinct hierarchy between primary, secondary, and tertiary actions.',
        why: 'Compromised visual hierarchy increases cognitive load and causes decision paralysis.',
        howToFix: 'Reserve primary solid buttons for the single main goal of the screen.',
      },
    ],
  },
  {
    manifest: {
      name: 'component-reference',
      displayName: 'Component Reference',
      version: '1.0.0',
      description: 'Design system compliance, component reuse, spacing scales, and radius consistency',
      author: 'CraftLens Team',
      license: 'MIT',
      source: { type: 'builtin', id: 'component-reference' },
      engineCompatibility: '>=1.0.0',
      mode: 'augment',
    },
    ruleIds: ['CX-013', 'CX-004', 'CX-005', 'UI-009'],
    guidance: [
      {
        id: 'component.system',
        title: 'Design System & Token Alignment',
        content: 'Always reuse shared component library tokens for spacing, corner radius, and layouts.',
        category: 'css',
      },
    ],
    recommendations: [
      {
        summary: 'Align ad-hoc spacing and radii with the design system tokens.',
        why: 'Arbitrary pixel values break consistency and complicate responsive adaptation.',
        howToFix: 'Use standard design token classes or CSS variables.',
      },
    ],
  },
  {
    manifest: {
      name: 'accessibility',
      displayName: 'Accessibility',
      version: '1.0.0',
      description: 'WCAG compliance, accessible labels, keyboard focus visibility, and inclusive navigation',
      author: 'CraftLens Team',
      license: 'MIT',
      source: { type: 'builtin', id: 'accessibility' },
      engineCompatibility: '>=1.0.0',
      mode: 'augment',
    },
    ruleIds: ['AX-016', 'UX-018', 'IX-002', 'IX-006'],
    guidance: [
      {
        id: 'a11y.wcag',
        title: 'WCAG 2.1 AA Compliance',
        content: 'All interactive elements must be keyboard focusable and have accessible names.',
        category: 'accessibility',
      },
    ],
    recommendations: [
      {
        summary: 'Provide accessible names for icon-only buttons via aria-label or screen-reader text.',
        why: 'Screen reader users cannot identify actions without accessible text.',
        howToFix: 'Add aria-label="Action Name" to icon buttons.',
      },
    ],
  },
  {
    manifest: {
      name: 'security',
      displayName: 'Security',
      version: '1.0.0',
      description: 'Exposed API credentials, XSS prevention, dangerous HTML injection, and insecure storage checks',
      author: 'CraftLens Team',
      license: 'MIT',
      source: { type: 'builtin', id: 'security' },
      engineCompatibility: '>=1.0.0',
      mode: 'augment',
    },
    ruleIds: ['SEC-001', 'SEC-002', 'SEC-003', 'SEC-B01', 'SEC-P01'],
    guidance: [
      {
        id: 'sec.owasp',
        title: 'Frontend Security Hygiene',
        content: 'Never hardcode secrets, sanitize user-rendered HTML, and avoid storing tokens insecurely.',
        category: 'security',
      },
    ],
    recommendations: [
      {
        summary: 'Move sensitive API credentials and keys to server-side environment variables.',
        why: 'Hardcoded frontend keys are publicly exposed to any client inspect.',
        howToFix: 'Store credentials in backend environments and call secured API proxy routes.',
      },
    ],
  },
  {
    manifest: {
      name: 'frontend-engineering',
      displayName: 'Frontend Engineering',
      version: '1.0.0',
      description: 'State completeness (loading, empty, error), React hooks correctness, and DOM validity',
      author: 'CraftLens Team',
      license: 'MIT',
      source: { type: 'builtin', id: 'frontend-engineering' },
      engineCompatibility: '>=1.0.0',
      mode: 'augment',
    },
    ruleIds: ['RE-001', 'UX-017', 'UX-019', 'UI-006', 'ST-001', 'ST-002', 'ST-003'],
    guidance: [
      {
        id: 'fe.state-coverage',
        title: 'State Completeness',
        content: 'Always provide explicit loading, empty, and error feedback for asynchronous interfaces.',
        category: 'react',
      },
    ],
    recommendations: [
      {
        summary: 'Handle empty and loading UI states explicitly.',
        why: 'Blank screens during fetch or empty datasets create confusion and perceived unresponsiveness.',
        howToFix: 'Render dedicated empty state and loading indicator components.',
      },
    ],
  },
  {
    manifest: {
      name: 'performance',
      displayName: 'Performance',
      version: '1.0.0',
      description: 'Responsive overflow detection, animation rendering cost, CSS transition performance, and z-index sprawl',
      author: 'CraftLens Team',
      license: 'MIT',
      source: { type: 'builtin', id: 'performance' },
      engineCompatibility: '>=1.0.0',
      mode: 'augment',
    },
    ruleIds: ['UI-022', 'CSS-005'],
    guidance: [
      {
        id: 'perf.css',
        title: 'Performant Layout & Styling',
        content: 'Avoid z-index wars, transition-all paint triggers, and fixed layout overflow.',
        category: 'css',
      },
    ],
    recommendations: [
      {
        summary: 'Manage layering with bounded stacking contexts and standard z-index scales.',
        why: 'Arbitrary high z-index numbers cause unpredictable layering bugs and stacking context leaks.',
        howToFix: 'Use a shared scale (e.g. z-10, z-20, z-50 for modals).',
      },
    ],
  },
];
