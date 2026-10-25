export type DesignMode =
  | 'teach'
  | 'document'
  | 'extract'
  | 'craft'
  | 'critique'
  | 'audit'
  | 'polish'
  | 'distill'
  | 'bolder'
  | 'quieter'
  | 'animate'
  | 'colorize'
  | 'harden'
  | 'optimize'
  | 'adapt';

export interface DesignModeDescriptor {
  mode: DesignMode;
  name: string;
  purpose: string;
  focusAreas: string[];
  suggestedAction: string;
}

export const DESIGN_MODES: Record<DesignMode, DesignModeDescriptor> = {
  teach: {
    mode: 'teach',
    name: 'Teach / Establish Context',
    purpose: 'Help create or refine PRODUCT.md and DESIGN.md guidelines grounded in product truth.',
    focusAreas: ['Audience', 'Jobs-to-be-done', 'Brand vs product lane', 'Design constraints'],
    suggestedAction: 'Create or update PRODUCT.md and DESIGN.md to establish project context.',
  },
  document: {
    mode: 'document',
    name: 'Document',
    purpose: 'Extract and record the active design system from real tokens, components, and CSS.',
    focusAreas: ['Spacing scale', 'Radius ramp', 'Color tokens', 'Typography scale'],
    suggestedAction: 'Audit existing CSS and Tailwind configuration to build a persistent token catalog.',
  },
  extract: {
    mode: 'extract',
    name: 'Extract Reusable System',
    purpose: 'Identify duplicate ad-hoc styling and extract shared components or tokens.',
    focusAreas: ['Component consolidation', 'Token deduplication', 'DRY styles'],
    suggestedAction: 'Consolidate repeated card and button styling into shared design tokens.',
  },
  craft: {
    mode: 'craft',
    name: 'Craft Feature',
    purpose: 'Shape and build a feature end-to-end with full interaction and error states.',
    focusAreas: ['Information hierarchy', 'Primary actions', 'Loading/error states', 'Responsive reflow'],
    suggestedAction: 'Implement all user states (empty, loading, error, success) for this feature.',
  },
  critique: {
    mode: 'critique',
    name: 'Critique & Evaluation',
    purpose: 'Evaluate hierarchy, clarity, cognitive load, and product specificity without modifying code.',
    focusAreas: ['Squint test', 'Focal anchors', 'Information density', 'Swap test'],
    suggestedAction: 'Review whether the primary action and headline immediately communicate product purpose.',
  },
  audit: {
    mode: 'audit',
    name: 'Comprehensive Audit',
    purpose: 'Inspect observable accessibility, responsive, interaction, and code issues.',
    focusAreas: ['Semantic HTML', 'WCAG contrast', 'Keyboard navigation', 'Responsive overflow'],
    suggestedAction: 'Run targeted audit across UI, backend, and security categories.',
  },
  polish: {
    mode: 'polish',
    name: 'Polish',
    purpose: 'Fix high-impact finish-quality defects without redesigning working areas.',
    focusAreas: ['Alignment', 'Spacing consistency', 'Hover feedback', 'Border refinements'],
    suggestedAction: 'Tidy inconsistent margin/padding and align component borders to the 4/8pt grid.',
  },
  distill: {
    mode: 'distill',
    name: 'Distill & Simplify',
    purpose: 'Remove redundant containers, decorative noise, and containers that do not clarify grouping.',
    focusAreas: ['Remove card soup', 'Eliminate decorative glow', 'Reduce competing CTAs'],
    suggestedAction: 'Replace card containers with whitespace dividers and remove decorative aura.',
  },
  bolder: {
    mode: 'bolder',
    name: 'Bolder & Distinctive',
    purpose: 'Increase visual distinctiveness when an interface is too bland or generic relative to brand intent.',
    focusAreas: ['Editorial typography', 'Brand-specific imagery', 'High-contrast focal points'],
    suggestedAction: 'Introduce strong typographic scale and replace stock placeholders with product imagery.',
  },
  quieter: {
    mode: 'quieter',
    name: 'Quieter & Restrained',
    purpose: 'Tone down overly aggressive gradients, intense glows, and visual noise in work surfaces.',
    focusAreas: ['Neutral backgrounds', 'Muted borders', 'Subtle status indicators'],
    suggestedAction: 'Replace bright decorative gradients with solid neutral surfaces.',
  },
  animate: {
    mode: 'animate',
    name: 'Purposeful Motion',
    purpose: 'Add motion solely to communicate state transitions, causality, or user feedback.',
    focusAreas: ['Micro-interactions', 'prefers-reduced-motion', 'State changes'],
    suggestedAction: 'Transition specific properties (opacity, transform) rather than blanket transition: all.',
  },
  colorize: {
    mode: 'colorize',
    name: 'Colorize & Semantic Tokens',
    purpose: 'Establish a coherent semantic palette with verified AA contrast in light and dark modes.',
    focusAreas: ['Semantic tokens', 'WCAG 4.5:1 contrast', 'Dark mode parity'],
    suggestedAction: 'Define semantic color roles (primary, surface, border, text, danger, success).',
  },
  harden: {
    mode: 'harden',
    name: 'Harden Edge Cases',
    purpose: 'Audit edge cases, error boundaries, long text wrapping, empty states, and permission denials.',
    focusAreas: ['Error recovery', 'Long text overflow', 'Offline states', 'Form validation'],
    suggestedAction: 'Add inline validation feedback and empty state handling for zero-data views.',
  },
  optimize: {
    mode: 'optimize',
    name: 'Performance Optimization',
    purpose: 'Address user-visible rendering lag, unnecessary re-renders, and heavy dependencies.',
    focusAreas: ['Re-render reduction', 'Image optimization', 'Clean hook lifecycles'],
    suggestedAction: 'Derive values during render instead of chaining useEffect and useState.',
  },
  adapt: {
    mode: 'adapt',
    name: 'Adapt & Responsive',
    purpose: 'Reflow layouts across desktop, tablet, and mobile; resolve horizontal scrollbars.',
    focusAreas: ['Fluid sizing', 'Breakpoints', 'Touch target sizing', 'Stacking orders'],
    suggestedAction: 'Replace fixed pixel widths with max-width and fluid percentage widths.',
  },
};

export function selectDesignMode(taskDescription: string): DesignModeDescriptor {
  const lower = taskDescription.toLowerCase();
  if (lower.includes('teach') || lower.includes('contract') || lower.includes('product.md')) return DESIGN_MODES.teach;
  if (lower.includes('document') || lower.includes('token') || lower.includes('design.md')) return DESIGN_MODES.document;
  if (lower.includes('extract') || lower.includes('reusable')) return DESIGN_MODES.extract;
  if (lower.includes('simplify') || lower.includes('distill') || lower.includes('card soup') || lower.includes('clutter')) return DESIGN_MODES.distill;
  if (lower.includes('polish') || lower.includes('refine') || lower.includes('spacing')) return DESIGN_MODES.polish;
  if (lower.includes('bolder') || lower.includes('distinctive')) return DESIGN_MODES.bolder;
  if (lower.includes('quieter') || lower.includes('loud') || lower.includes('tone down')) return DESIGN_MODES.quieter;
  if (lower.includes('motion') || lower.includes('animate') || lower.includes('transition')) return DESIGN_MODES.animate;
  if (lower.includes('color') || lower.includes('contrast') || lower.includes('palette')) return DESIGN_MODES.colorize;
  if (lower.includes('harden') || lower.includes('edge case') || lower.includes('error')) return DESIGN_MODES.harden;
  if (lower.includes('optimize') || lower.includes('performance') || lower.includes('render')) return DESIGN_MODES.optimize;
  if (lower.includes('responsive') || lower.includes('mobile') || lower.includes('overflow') || lower.includes('adapt')) return DESIGN_MODES.adapt;
  if (lower.includes('critique') || lower.includes('review')) return DESIGN_MODES.critique;
  if (lower.includes('craft') || lower.includes('build') || lower.includes('new')) return DESIGN_MODES.craft;
  return DESIGN_MODES.audit;
}

export class DesignModeSelector {
  public static getModeSpecification(mode: DesignMode) {
    const desc = DESIGN_MODES[mode] || DESIGN_MODES.audit;
    return {
      ...desc,
      maxFindings: mode === 'audit' ? 3 : undefined,
      preservesScope: mode === 'polish' || mode === 'distill',
    };
  }

  public static selectMode(taskDescription: string): DesignModeDescriptor {
    return selectDesignMode(taskDescription);
  }
}

