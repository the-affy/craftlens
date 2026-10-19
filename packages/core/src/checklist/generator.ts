import { AuditLevel } from '../types/audit-level.js';
import { Finding } from '../types/finding.js';
import { ProjectContext } from '../types/context.js';
import {
  ChecklistItem,
  ChecklistItemStatus,
  MasterChecklist,
  MasterChecklistSummary,
  ChangeReview,
} from '../types/checklist.js';

interface CategoryTemplate {
  category: string;
  items: {
    id: string;
    title: string;
    description: string;
    relevantRules: string[];
    isApplicable: (ctx: ProjectContext) => boolean;
  }[];
}

const CHECKLIST_TEMPLATES: CategoryTemplate[] = [
  {
    category: 'Code Quality',
    items: [
      {
        id: 'cq-unused-deps',
        title: 'Dependency hygiene & cleanliness',
        description: 'No unvetted or unused heavy packages introduced.',
        relevantRules: ['CD-041', 'CD-050'],
        isApplicable: ctx => Object.keys(ctx.dependencies).length > 0,
      },
      {
        id: 'cq-exceptions',
        title: 'Explicit error handling & exception propagation',
        description: 'Try/catch blocks provide recovery or user feedback without silent failure.',
        relevantRules: ['AP-008'],
        isApplicable: () => true,
      },
      {
        id: 'cq-types',
        title: 'TypeScript type safety & avoidance of any',
        description: 'Strict type discipline without using any as a compiler escape hatch.',
        relevantRules: ['AP-014'],
        isApplicable: ctx => ctx.hasTypeScript,
      },
      {
        id: 'cq-component-size',
        title: 'Component boundary & complexity limits',
        description: 'Components remain cohesive without excessive responsibilities.',
        relevantRules: ['CD-023', 'CD-024'],
        isApplicable: ctx => !!ctx.framework,
      },
    ],
  },
  {
    category: 'Architecture & Boundaries',
    items: [
      {
        id: 'arch-imports',
        title: 'Architectural layering & clean import boundaries',
        description: 'No circular module dependencies or architectural layer bypassing.',
        relevantRules: ['CD-049', 'CD-050'],
        isApplicable: () => true,
      },
      {
        id: 'arch-design-tokens',
        title: 'Consistent design system & token usage',
        description: 'Component styling aligns with defined project spacing, radius, and colors.',
        relevantRules: ['CSS-018', 'CSS-020'],
        isApplicable: ctx => !!ctx.cssStrategy,
      },
    ],
  },
  {
    category: 'State & React Logic',
    items: [
      {
        id: 'state-effects',
        title: 'Disciplined effect usage & state derivation',
        description: 'Derived state is computed directly; effects are not chained in cascades.',
        relevantRules: ['CD-028', 'CD-031', 'AP-012'],
        isApplicable: ctx => ctx.framework === 'react' || ctx.framework === 'nextjs',
      },
      {
        id: 'state-machines',
        title: 'Discrete state modeling & boolean sanity',
        description: 'Avoids multiple conflicting booleans (e.g. isLoading && isError).',
        relevantRules: ['CD-032', 'CD-033'],
        isApplicable: ctx => !!ctx.framework,
      },
    ],
  },
  {
    category: 'Accessibility (a11y)',
    items: [
      {
        id: 'a11y-interactive-semantics',
        title: 'Interactive element semantics & native buttons',
        description: 'Click listeners are placed on native interactive elements or elements with role="button".',
        relevantRules: ['FN-015', 'AX-023'],
        isApplicable: () => true,
      },
      {
        id: 'a11y-keyboard-nav',
        title: 'Keyboard accessibility & key listeners',
        description: 'All clickable elements can be triggered via keyboard (Enter/Space).',
        relevantRules: ['FN-016', 'AX-024'],
        isApplicable: () => true,
      },
      {
        id: 'a11y-accessible-names',
        title: 'Accessible names on icons and controls',
        description: 'Icon buttons and interactive controls provide aria-label or accessible text.',
        relevantRules: ['AX-012', 'AX-016'],
        isApplicable: () => true,
      },
    ],
  },
  {
    category: 'UX & Functional Integrity',
    items: [
      {
        id: 'ux-meaningful-actions',
        title: 'Interactive controls trigger observable outcomes',
        description: 'Buttons and controls perform state changes, navigation, or submissions.',
        relevantRules: ['FN-012'],
        isApplicable: () => true,
      },
      {
        id: 'ux-no-placeholders',
        title: 'Absence of placeholder text or fake mock data',
        description: 'User-facing UI is free of Lorem Ipsum, John Doe, and visible TODOs.',
        relevantRules: ['PH-011', 'PH-012', 'PH-014', 'PH-027'],
        isApplicable: () => true,
      },
    ],
  },
  {
    category: 'Styling & Layout Resilience',
    items: [
      {
        id: 'css-zindex',
        title: 'Structured z-index hierarchy',
        description: 'Avoids magic escalation values (e.g. z-[999999]) to patch stacking contexts.',
        relevantRules: ['CSS-005'],
        isApplicable: () => true,
      },
      {
        id: 'css-layout-patches',
        title: 'Resilient box model & negative margins',
        description: 'Layouts rely on flex/grid flow rather than negative margins or !important overrides.',
        relevantRules: ['CSS-006', 'CSS-009', 'AP-020'],
        isApplicable: () => true,
      },
    ],
  },
  {
    category: 'AI-Slop & Template Genericity',
    items: [
      {
        id: 'slop-template-cluster',
        title: 'Unique domain UI composition vs generic AI SaaS boilerplate',
        description: 'Page structure avoids the standard composite: centered hero + dual CTA + 3 feature cards + badge.',
        relevantRules: ['AS-001'],
        isApplicable: ctx => !!ctx.framework,
      },
    ],
  },
];

export function generateMasterChecklist(
  projectContext: ProjectContext,
  findings: Finding[],
  auditLevel: AuditLevel = 'moderate',
  previousChecklist?: MasterChecklist
): MasterChecklist {
  const items: ChecklistItem[] = [];
  const projectName = projectContext.rootPath.split('/').pop() || 'Workspace';

  let errors = 0;
  let warnings = 0;
  let suggestions = 0;
  let passedCount = 0;

  for (const f of findings) {
    if (f.severity === 'blocker' || f.severity === 'error') errors++;
    else if (f.severity === 'warning') warnings++;
    else if (f.severity === 'suggestion') suggestions++;
  }

  for (const group of CHECKLIST_TEMPLATES) {
    for (const tpl of group.items) {
      if (!tpl.isApplicable(projectContext)) {
        items.push({
          id: tpl.id,
          category: group.category,
          title: tpl.title,
          description: tpl.description,
          status: 'not-applicable',
          lastChecked: Date.now(),
        });
        continue;
      }

      // Check if any active findings match this item's relevant rules
      const matchingFindings = findings.filter(f => tpl.relevantRules.includes(f.ruleId));

      let status: ChecklistItemStatus = 'passed';
      let evidence: string | undefined;

      if (matchingFindings.length > 0) {
        const hasErrors = matchingFindings.some(f => f.severity === 'blocker' || f.severity === 'error');
        status = hasErrors ? 'failed' : 'warning';
        evidence = `${matchingFindings.length} issue(s) detected across ${matchingFindings.map(f => f.ruleId).join(', ')}`;
      } else {
        passedCount++;
      }

      items.push({
        id: tpl.id,
        category: group.category,
        title: tpl.title,
        description: tpl.description,
        status,
        evidence,
        relatedRules: tpl.relevantRules,
        findingCount: matchingFindings.length,
        lastChecked: Date.now(),
      });
    }
  }

  const applicableItems = items.filter(i => i.status !== 'not-applicable');
  const healthScore = applicableItems.length > 0
    ? Math.max(0, Math.round(((applicableItems.filter(i => i.status === 'passed').length) / applicableItems.length) * 100) - (errors * 10 + warnings * 3))
    : 100;

  const summary: MasterChecklistSummary = {
    errors,
    warnings,
    suggestions,
    passed: passedCount,
    total: applicableItems.length,
    healthScore: Math.max(0, Math.min(100, healthScore)),
  };

  return {
    projectName,
    lastAudit: Date.now(),
    auditLevel,
    summary,
    items,
  };
}

export function formatChecklistMarkdown(checklist: MasterChecklist): string {
  const dateStr = new Date(checklist.lastAudit).toISOString().split('T')[0];
  const lines: string[] = [
    `# Anti-Slop Master Audit`,
    `**Project:** ${checklist.projectName}`,
    `**Last Audit:** ${dateStr} | **Level:** \`${checklist.auditLevel.toUpperCase()}\``,
    `**Health Score:** ${checklist.summary.healthScore}/100`,
    '',
    `## Summary`,
    `- **Status:** ${checklist.summary.errors > 0 ? '❌ Failing Requirements' : checklist.summary.warnings > 0 ? '⚠️ Needs Attention' : '✅ Healthy'}`,
    `- **Passed Items:** ${checklist.summary.passed} / ${checklist.summary.total}`,
    `- **Findings:** ${checklist.summary.errors} Error(s), ${checklist.summary.warnings} Warning(s), ${checklist.summary.suggestions} Suggestion(s)`,
    '',
    '---',
  ];

  // Group by category
  const categories = Array.from(new Set(checklist.items.map(i => i.category)));

  for (const cat of categories) {
    const catItems = checklist.items.filter(i => i.category === cat);
    lines.push(`## ${cat}`);

    for (const item of catItems) {
      let mark = '[ ]';
      let statusBadge = '';

      switch (item.status) {
        case 'passed':
          mark = '[x]';
          statusBadge = '`PASSED`';
          break;
        case 'warning':
          mark = '[ ]';
          statusBadge = '`WARNING`';
          break;
        case 'failed':
          mark = '[ ]';
          statusBadge = '`FAILED`';
          break;
        case 'needs-review':
          mark = '[ ]';
          statusBadge = '`NEEDS REVIEW`';
          break;
        case 'not-applicable':
          mark = '[-]';
          statusBadge = '`NOT APPLICABLE`';
          break;
        default:
          mark = '[ ]';
          statusBadge = `\`${item.status.toUpperCase()}\``;
      }

      const evidenceLine = item.evidence ? ` — *(${item.evidence})*` : '';
      lines.push(`- ${mark} **${item.title}** ${statusBadge}${evidenceLine}`);
      lines.push(`  > ${item.description}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function generateChangeReview(
  filesChanged: string[],
  previousFindings: Finding[],
  currentFindings: Finding[],
  linesAdded: number = 0,
  linesRemoved: number = 0
): ChangeReview {
  const prevMap = new Map<string, Finding>();
  for (const f of previousFindings) {
    const key = f.fingerprint || `${f.ruleId}:${f.location.filePath}:${f.location.start.line}`;
    prevMap.set(key, f);
  }

  const currMap = new Map<string, Finding>();
  for (const f of currentFindings) {
    const key = f.fingerprint || `${f.ruleId}:${f.location.filePath}:${f.location.start.line}`;
    currMap.set(key, f);
  }

  const newFindings: Finding[] = [];
  for (const [key, f] of currMap.entries()) {
    if (!prevMap.has(key)) {
      newFindings.push(f);
    }
  }

  const resolvedFindings: Finding[] = [];
  for (const [key, f] of prevMap.entries()) {
    if (!currMap.has(key)) {
      resolvedFindings.push(f);
    }
  }

  // Calculate Quality Scores from actual findings
  const calculatePillarScore = (categoryPrefixes: string[]): number => {
    const matching = currentFindings.filter(f => categoryPrefixes.some(p => f.ruleId.startsWith(p)));
    const penalty = matching.reduce((acc, f) => {
      if (f.severity === 'blocker' || f.severity === 'error') return acc + 15;
      if (f.severity === 'warning') return acc + 8;
      return acc + 3;
    }, 0);
    return Math.max(0, Math.min(100, 100 - penalty));
  };

  const qualityScores = {
    code: calculatePillarScore(['CD-']),
    architecture: calculatePillarScore(['CD-049', 'CD-050']),
    ux: calculatePillarScore(['FN-']),
    accessibility: calculatePillarScore(['AX-', 'FN-015', 'FN-016']),
    security: calculatePillarScore(['SEC-']),
    aiSlop: calculatePillarScore(['AP-', 'AS-']),
  };

  const potentialConcerns: string[] = [];
  for (const f of newFindings) {
    potentialConcerns.push(`${f.ruleId}: ${f.message}`);
  }

  return {
    timestamp: Date.now(),
    filesChanged,
    linesAdded,
    linesRemoved,
    newFindings,
    resolvedFindings,
    qualityScores,
    potentialConcerns,
  };
}

export function formatChangeReviewMarkdown(review: ChangeReview): string {
  const errorCount = review.newFindings.filter(f => f.severity === 'blocker' || f.severity === 'error').length;
  const warningCount = review.newFindings.filter(f => f.severity === 'warning').length;
  const suggestionCount = review.newFindings.filter(f => f.severity === 'suggestion').length;

  const lines = [
    '────────────────────────────────────',
    'Anti-Slop · Change Review',
    `${review.filesChanged.length} file(s) changed (+${review.linesAdded} / -${review.linesRemoved} lines)`,
    '',
    'New Findings:',
    `  ${errorCount} error(s)`,
    `  ${warningCount} warning(s)`,
    `  ${suggestionCount} suggestion(s)`,
    review.resolvedFindings.length > 0 ? `  ✓ ${review.resolvedFindings.length} issue(s) resolved` : '',
    '',
    'Quality Health:',
    `  Code Quality:    ${review.qualityScores.code}/100`,
    `  Architecture:    ${review.qualityScores.architecture}/100`,
    `  UX Integrity:    ${review.qualityScores.ux}/100`,
    `  Accessibility:   ${review.qualityScores.accessibility}/100`,
    `  Security:        ${review.qualityScores.security}/100`,
    `  AI-Slop Index:   ${review.qualityScores.aiSlop}/100`,
    '',
  ];

  if (review.potentialConcerns.length > 0) {
    lines.push('Potential Concerns Introduced by This Change:');
    for (const concern of review.potentialConcerns) {
      lines.push(`  • ${concern}`);
    }
  } else {
    lines.push('No new potential concerns introduced.');
  }

  lines.push('────────────────────────────────────');
  return lines.filter(Boolean).join('\n');
}
