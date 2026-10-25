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
import { calculateHealthScore } from '../scoring/scoring.js';

export interface CategoryTemplate {
  category: string;
  items: {
    id: string;
    title: string;
    description: string;
    relevantRules: string[];
    relatedRuleIds?: string[];
    isApplicable: (ctx: ProjectContext) => { applicable: boolean; reason?: string };
  }[];
}

export const CHECKLIST_TEMPLATES: CategoryTemplate[] = [
  {
    category: 'Code Quality',
    items: [
      {
        id: 'cq-unused-deps',
        title: 'Dependencies & hygiene',
        description: 'Packages are vetted and necessary without unused or heavy bloat.',
        relevantRules: ['CD-041', 'CD-050'],
        isApplicable: ctx => ({
          applicable: Object.keys(ctx.dependencies || {}).length > 0,
          reason: 'Not detected in this project',
        }),
      },
      {
        id: 'cq-exceptions',
        title: 'Errors are handled clearly',
        description: 'Failures are handled, reported, or propagated instead of disappearing silently.',
        relevantRules: ['AP-008'],
        isApplicable: () => ({ applicable: true }),
      },
      {
        id: 'cq-types',
        title: 'TypeScript type safety',
        description: 'Strict type discipline without using any as a compiler escape hatch.',
        relevantRules: ['AP-014', 'CD-001'],
        isApplicable: ctx => ({
          applicable: ctx.hasTypeScript,
          reason: 'Not relevant — no TypeScript configured in this project',
        }),
      },
      {
        id: 'cq-component-size',
        title: 'Component size & modularity',
        description: 'Components remain cohesive without excessive responsibilities.',
        relevantRules: ['CD-023', 'CD-024'],
        isApplicable: ctx => ({
          applicable: !!ctx.framework,
          reason: 'Not relevant — no component framework configured',
        }),
      },
    ],
  },
  {
    category: 'Architecture & Boundaries',
    items: [
      {
        id: 'arch-imports',
        title: 'Clean architecture & import boundaries',
        description: 'No circular module dependencies or architectural layer bypassing.',
        relevantRules: ['CD-049', 'CD-050'],
        isApplicable: () => ({ applicable: true }),
      },
      {
        id: 'arch-design-tokens',
        title: 'Consistent spacing system',
        description: 'Component styling aligns with defined project spacing, radius, and color tokens.',
        relevantRules: ['CSS-018', 'CSS-020', 'CX-004', 'CX-005', 'UI-SPACING-01'],
        isApplicable: ctx => ({
          applicable: !!ctx.cssStrategy || (ctx.baseline && ctx.baseline.components && ctx.baseline.components.length > 0) || true,
          reason: 'Not detected in this project',
        }),
      },
    ],
  },
  {
    category: 'State & React Logic',
    items: [
      {
        id: 'state-effects',
        title: 'React state & derived values',
        description: 'Derived state is computed directly; effects are not chained in cascades.',
        relevantRules: ['CD-028', 'CD-031', 'AP-012', 'RE-001', 'ST-001', 'ST-002', 'ST-003'],
        isApplicable: ctx => ({
          applicable: ctx.framework === 'react' || ctx.framework === 'nextjs',
          reason: 'Not relevant — no React state found in this project',
        }),
      },
      {
        id: 'state-machines',
        title: 'Discrete state modeling',
        description: 'Avoids multiple conflicting booleans (e.g. isLoading && isError).',
        relevantRules: ['CD-032', 'CD-033'],
        isApplicable: ctx => ({
          applicable: !!ctx.framework,
          reason: 'Not relevant — no framework UI state found',
        }),
      },
    ],
  },
  {
    category: 'Accessibility (a11y)',
    items: [
      {
        id: 'a11y-interactive-semantics',
        title: 'Interactive elements are accessible',
        description: 'Click listeners are placed on native interactive elements or elements with role="button".',
        relevantRules: ['FN-015', 'AX-023', 'IX-002'],
        isApplicable: () => ({ applicable: true }),
      },
      {
        id: 'a11y-keyboard-nav',
        title: 'Keyboard accessibility',
        description: 'All clickable elements can be triggered via keyboard (Enter/Space).',
        relevantRules: ['FN-016', 'AX-024'],
        isApplicable: () => ({ applicable: true }),
      },
      {
        id: 'a11y-accessible-names',
        title: 'Accessible names on controls',
        description: 'Icon buttons and interactive controls provide aria-label or accessible text.',
        relevantRules: ['AX-012', 'AX-016'],
        isApplicable: () => ({ applicable: true }),
      },
      {
        id: 'a11y-contrast',
        title: 'Accessible color contrast',
        description: 'Text and interactive elements meet accessible contrast standards.',
        relevantRules: ['CL-001', 'AX-016'],
        isApplicable: () => ({ applicable: true }),
      },
    ],
  },
  {
    category: 'UX & Functional Integrity',
    items: [
      {
        id: 'ux-meaningful-actions',
        title: 'Buttons have clear affordances',
        description: 'Buttons and controls perform state changes, navigation, or submissions with clear visual affordances.',
        relevantRules: ['FN-012', 'ID-004', 'IX-006'],
        isApplicable: () => ({ applicable: true }),
      },
      {
        id: 'ux-no-placeholders',
        title: 'Absence of placeholder content',
        description: 'User-facing UI is free of Lorem Ipsum, John Doe, and visible TODOs.',
        relevantRules: ['PH-011', 'PH-012', 'PH-014', 'PH-027', 'CP-006'],
        isApplicable: () => ({ applicable: true }),
      },
    ],
  },
  {
    category: 'Styling & Layout Resilience',
    items: [
      {
        id: 'css-zindex',
        title: 'Structured z-index layering',
        description: 'Avoids magic escalation values (e.g. z-[999999]) to patch stacking contexts.',
        relevantRules: ['CSS-005'],
        isApplicable: () => ({ applicable: true }),
      },
      {
        id: 'css-layout-patches',
        title: 'Layout works without fragile CSS hacks',
        description: 'Layouts rely on flex/grid flow rather than negative margins or !important overrides.',
        relevantRules: ['CSS-006', 'CSS-009', 'AP-020'],
        isApplicable: () => ({ applicable: true }),
      },
      {
        id: 'layout-responsive',
        title: 'Responsive layout is handled',
        description: 'Responsive layout adapts across viewport sizes without horizontal clipping or broken grids.',
        relevantRules: ['LY-001', 'LY-002', 'UI-022'],
        isApplicable: () => ({ applicable: true }),
      },
    ],
  },
  {
    category: 'Visual & Hierarchy Quality',
    items: [
      {
        id: 'hier-cta',
        title: 'Clear CTA hierarchy',
        description: 'Views establish one unmistakable primary action without competing button weights.',
        relevantRules: ['VH-007', 'ID-004', 'CP-002'],
        isApplicable: () => ({ applicable: true }),
      },
      {
        id: 'hier-cards',
        title: 'Avoid excessive rounded cards',
        description: 'Information hierarchy avoids excessive identical card grids and card-inside-card nesting.',
        relevantRules: ['CP-007', 'CP-008', 'UI-006', 'CL-002', 'CL-003'],
        isApplicable: () => ({ applicable: true }),
      },
      {
        id: 'hier-purpose',
        title: 'Clear visual hierarchy',
        description: 'Operational views establish clear visual hierarchy, purposeful decoration, and avoid visual noise.',
        relevantRules: ['ID-001', 'ID-005', 'VH-008'],
        isApplicable: () => ({ applicable: true }),
      },
    ],
  },
  {
    category: 'Project Consistency & Tokens',
    items: [
      {
        id: 'conv-components',
        title: 'Component reuse',
        description: 'Standard project components are reused rather than re-implementing ad-hoc elements.',
        relevantRules: ['CX-013'],
        isApplicable: () => ({ applicable: true }),
      },
      {
        id: 'conv-tokens',
        title: 'Design token scale adherence',
        description: 'Component dimensions adhere to approved spacing and corner radius scales.',
        relevantRules: ['CX-004', 'CX-005'],
        isApplicable: () => ({ applicable: true }),
      },
    ],
  },
  {
    category: 'AI-Slop & Template Genericity',
    items: [
      {
        id: 'slop-template-cluster',
        title: 'Unique domain UI composition',
        description: 'Page structure avoids generic AI SaaS template boilerplate (hero + dual CTA + 3 feature cards).',
        relevantRules: ['AS-001', 'UI-017', 'UI-019', 'UI-020'],
        isApplicable: ctx => ({
          applicable: !!ctx.framework,
          reason: 'Not relevant — no component views found',
        }),
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
  const projectName = (projectContext?.rootPath ? projectContext.rootPath.split('/').pop() : (projectContext as any)?.projectName) || 'Workspace';

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
      const ruleIds = tpl.relatedRuleIds || tpl.relevantRules;
      const prevItem = previousChecklist?.items?.find(i => i.id === tpl.id);

      const applicability = tpl.isApplicable(projectContext);
      if (!applicability.applicable) {
        const checked = prevItem?.manualOverride ? prevItem.checked : false;
        items.push({
          id: tpl.id,
          category: group.category,
          title: tpl.title,
          description: tpl.description,
          status: 'not-applicable',
          notApplicableReason: applicability.reason || 'Not relevant to this project',
          statusLabel: applicability.reason || 'Not relevant to this project',
          checked,
          manualOverride: prevItem?.manualOverride || false,
          relatedRules: ruleIds,
          relatedRuleIds: ruleIds,
          lastChecked: Date.now(),
        });
        continue;
      }

      // Check if any active findings match this item's relevant rules
      const matchingFindings = findings.filter(f => ruleIds.includes(f.ruleId));

      let status: ChecklistItemStatus = 'passed';
      let evidence: string | undefined;

      if (matchingFindings.length > 0) {
        const hasErrors = matchingFindings.some(f => f.severity === 'blocker' || f.severity === 'error');
        status = hasErrors ? 'failed' : 'warning';

        // Group evidence by unique issue title/rule instead of repeating rule IDs
        const distinctRules = Array.from(new Set(matchingFindings.map(f => f.problemTitle || f.ruleId)));
        evidence = `${matchingFindings.length} issue(s) detected across ${distinctRules.join(', ')}`;
      }

      let checked = status === 'passed';
      let manualOverride = false;

      if (prevItem?.manualOverride) {
        if ((prevItem.findingCount ?? 0) === 0 && matchingFindings.length > 0) {
          checked = false;
          manualOverride = false;
        } else {
          checked = prevItem.checked;
          manualOverride = true;
          if (checked && status !== 'passed') {
            status = 'passed';
          } else if (!checked && status === 'passed') {
            status = 'failed';
          }
        }
      } else if (prevItem?.checked && matchingFindings.length === 0) {
        checked = true;
      }

      if (checked) {
        passedCount++;
      }

      const statusLabel =
        status === 'passed'
          ? 'Passed'
          : status === 'failed'
          ? 'Failed'
          : 'Warning';

      items.push({
        id: tpl.id,
        category: group.category,
        title: tpl.title,
        description: tpl.description,
        status,
        statusLabel,
        evidence,
        checked,
        manualOverride,
        relatedRules: ruleIds,
        relatedRuleIds: ruleIds,
        findingCount: matchingFindings.length,
        lastChecked: Date.now(),
      });
    }
  }

  const applicableItems = items.filter(i => i.status !== 'not-applicable');
  const { score: healthScore, grade: healthGrade, breakdown: healthExplanation } =
    calculateHealthScore(passedCount, applicableItems.length, errors, warnings, suggestions);

  const summary: MasterChecklistSummary = {
    errors,
    warnings,
    suggestions,
    passed: passedCount,
    total: applicableItems.length,
    healthScore,
    healthGrade,
    healthExplanation,
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
  const totalFindings = checklist.summary.errors + checklist.summary.warnings + checklist.summary.suggestions;
  const healthStatusText = checklist.summary.healthGrade || (checklist.summary.errors > 0 ? 'Needs Attention' : checklist.summary.warnings > 0 ? 'Needs Attention' : 'Healthy');

  const lines: string[] = [
    `# CraftLens Master Audit`,
    `────────────────────────────────────`,
    `**Project:** ${checklist.projectName}`,
    `**Last Audit:** ${dateStr} | **Level:** \`${typeof checklist.auditLevel === 'string' && checklist.auditLevel.trim() ? checklist.auditLevel.trim().toUpperCase() : 'MODERATE'}\``,
    `**Health:** ${checklist.summary.healthScore} / 100 (${healthStatusText})`,
    '',
    `## Checklist Status`,
    `${checklist.summary.passed} / ${checklist.summary.total} checks passed`,
    '',
    `## Findings`,
    `${totalFindings} issues found`,
    `• ${checklist.summary.errors} error(s)`,
    `• ${checklist.summary.warnings} warning(s)`,
    `• ${checklist.summary.suggestions} suggestion(s)`,
    '',
    `────────────────────────────────────`,
  ];

  const failedOrWarning = checklist.items.filter(i => !i.checked && (i.status === 'failed' || i.status === 'warning'));
  if (failedOrWarning.length > 0) {
    lines.push(`## Issues Needing Attention`);
    for (const item of failedOrWarning) {
      const itemStatus = typeof item.status === 'string' && item.status.trim() ? item.status.trim().toUpperCase() : 'OPEN';
      const statusBadge = `\`${itemStatus}\``;
      lines.push(`- [ ] **${item.title}** ${statusBadge} (${item.findingCount || 1} location${(item.findingCount || 1) > 1 ? 's' : ''})`);
      lines.push(`  > ${item.description}`);
      if (item.evidence) {
        lines.push(`  *${item.evidence}*`);
      }
      lines.push('');
    }
  }

  const passedItems = checklist.items.filter(i => (i.checked || i.status === 'passed') && i.status !== 'not-applicable');
  if (passedItems.length > 0) {
    lines.push(`## Passed Checks`);
    for (const item of passedItems) {
      lines.push(`- [x] **${item.title}** \`PASSED\``);
    }
    lines.push('');
  }

  const notApplicableItems = checklist.items.filter(i => i.status === 'not-applicable');
  if (notApplicableItems.length > 0) {
    lines.push(`## Not Relevant to This Project`);
    for (const item of notApplicableItems) {
      lines.push(`- [-] **${item.title}**: ${item.notApplicableReason || 'Not detected in this project'}`);
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
    architecture: calculatePillarScore(['CD-049', 'CD-050', 'CX-013']),
    ux: calculatePillarScore(['FN-', 'ID-004']),
    accessibility: calculatePillarScore(['AX-', 'FN-015', 'FN-016']),
    security: calculatePillarScore(['SEC-']),
    aiSlop: calculatePillarScore(['AP-', 'AS-']),
    design: calculatePillarScore(['VH-', 'CP-', 'CX-', 'ID-']),
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
    'CraftLens · Change Review',
    `${review.filesChanged.length} file(s) changed (+${review.linesAdded} / -${review.linesRemoved} lines)`,
    '',
    'New Findings:',
    `  ${errorCount} error(s)`,
    `  ${warningCount} warning(s)`,
    `  ${suggestionCount} suggestion(s)`,
    review.resolvedFindings.length > 0 ? `  ${review.resolvedFindings.length} issue(s) resolved` : '',
    '',
    'Quality Health:',
    `  Code Quality:    ${review.qualityScores.code}/100`,
    `  Architecture:    ${review.qualityScores.architecture}/100`,
    `  UX Integrity:    ${review.qualityScores.ux}/100`,
    `  Accessibility:   ${review.qualityScores.accessibility}/100`,
    `  Security:        ${review.qualityScores.security}/100`,
    `  AI-Slop Index:   ${review.qualityScores.aiSlop}/100`,
    review.qualityScores.design !== undefined ? `  Visual Design:   ${review.qualityScores.design}/100` : '',
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
