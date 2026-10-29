import { AuditLevel } from '../types/audit-level.js';
import { Finding } from '../types/finding.js';
import { ProjectContext } from '../types/context.js';
import {
  ChecklistItem,
  ChecklistItemStatus,
  MasterChecklist,
  MasterChecklistSummary,
  ChangeReview,
  UserChangeRecord,
} from '../types/checklist.js';
import { calculateHealthScore } from '../scoring/scoring.js';
import { Issue, findingToIssue } from '../types/issue.js';
import type { Change, ChangeManager } from '../changes/index.js';

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
  const rootPathStr = typeof projectContext?.rootPath === 'string' ? projectContext.rootPath : typeof (projectContext as any)?.rootPath?.fsPath === 'string' ? (projectContext as any).rootPath.fsPath : undefined;
  const projectName = (rootPathStr ? rootPathStr.split('/').pop() : (projectContext as any)?.projectName) || 'Workspace';

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

export function formatChecklistMarkdown(checklist: MasterChecklist, findings?: Finding[]): string {
  const dateStr = new Date(checklist.lastAudit || Date.now()).toISOString().split('T')[0];
  const totalFindings = (checklist.summary.errors || 0) + (checklist.summary.warnings || 0) + (checklist.summary.suggestions || 0);
  const healthStatusText = checklist.summary.healthGrade || (checklist.summary.errors > 0 ? 'Needs Attention' : checklist.summary.warnings > 0 ? 'Needs Attention' : 'Healthy');

  const lines: string[] = [
    `# CraftLens Master Audit Checklist`,
    `Generated: ${dateStr}`,
    `────────────────────────────────────`,
    `**Project:** ${checklist.projectName}`,
    `**Last Audit:** ${dateStr} | **Level:** \`${typeof checklist.auditLevel === 'string' && checklist.auditLevel.trim() ? checklist.auditLevel.trim().toUpperCase() : 'MODERATE'}\``,
    `**Health:** ${checklist.summary.healthScore} / 100 (${healthStatusText})`,
    `**Checks:** ${checklist.summary.passed} / ${checklist.summary.total} checks passed`,
    '',
  ];

  if (findings) {
    lines.push('## Checklist Status', '');
  }

  // Group items by category (UI / UX, Security, Accessibility, Code Quality, etc.)
  const categoryMap = new Map<string, ChecklistItem[]>();
  for (const item of checklist.items) {
    const rawCat = (item.category || 'General').toLowerCase();
    let catKey = 'Code Quality';
    if (rawCat.includes('ui') || rawCat.includes('ux') || rawCat.includes('visual')) catKey = 'UI / UX';
    else if (rawCat.includes('sec')) catKey = 'Security';
    else if (rawCat.includes('access') || rawCat.includes('a11y')) catKey = 'Accessibility';
    else if (rawCat.includes('perf')) catKey = 'Performance';
    else if (rawCat.includes('arch')) catKey = 'Architecture';
    else if (rawCat.includes('dep')) catKey = 'Dependencies';
    else if (rawCat.includes('state')) catKey = 'State & Framework';
    else if (rawCat.includes('code') || rawCat.includes('qual')) catKey = 'Code Quality';

    if (!categoryMap.has(catKey)) {
      categoryMap.set(catKey, []);
    }
    categoryMap.get(catKey)!.push(item);
  }

  for (const [catName, items] of categoryMap.entries()) {
    lines.push(`## ${catName}`);
    for (const item of items) {
      if (item.status === 'not-applicable') {
        lines.push(`- [-] **${item.title}**: ${item.notApplicableReason || 'Not detected in this project'}`);
      } else {
        const isChecked = item.checked || item.status === 'passed';
        const tag = isChecked ? ' `PASSED`' : '';
        lines.push(`- [${isChecked ? 'x' : ' '}] **${item.title}**${tag}`);
      }
    }
    lines.push('');
  }

  if (findings) {
    lines.push('## Findings', '');
    if (findings.length === 0) {
      lines.push('No active findings. All checks passing cleanly!', '');
    } else {
      for (const f of findings) {
        lines.push(`- **${f.ruleId || 'ISSUE'}**: ${f.message || f.title || 'Finding'}`);
      }
      lines.push('');
    }
  }

  lines.push('────────────────────────────────────');
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

function normalizeToIssues(findingsOrIssues: (Finding | Issue)[]): Issue[] {
  const issues: Issue[] = [];
  const seen = new Set<string>();

  for (const item of findingsOrIssues) {
    if (!item) continue;
    let issue: Issue;
    if ((item as any).fingerprint && (item as any).status && Array.isArray((item as any).locations)) {
      issue = item as Issue;
    } else {
      issue = findingToIssue(item as Finding);
    }
    const key = issue.fingerprint || issue.id;
    if (seen.has(key)) continue;
    seen.add(key);
    issues.push(issue);
  }
  return issues;
}

function formatCategoryName(category?: string, ruleId?: string): string {
  const c = (category || '').toLowerCase().trim();
  const r = (ruleId || '').toUpperCase().trim();
  if (c.includes('sec') || r.startsWith('SEC')) return 'Security';
  if (c.includes('access') || c.includes('a11y') || r.startsWith('AX')) return 'Accessibility';
  if (c.includes('perf') || r.startsWith('PERF') || r === 'CSS-005') return 'Performance';
  if (c.includes('backend') || c.includes('api') || r.startsWith('BE') || r.startsWith('API')) return 'Backend/Technology';
  if (c.includes('dep') || r.startsWith('DEP')) return 'Dependency';
  if (c.includes('ui') || c.includes('ux') || c.includes('visual') || r.startsWith('UI') || r.startsWith('UX') || r.startsWith('VH') || r.startsWith('CP') || r.startsWith('CL') || r.startsWith('ID') || r.startsWith('LY') || r.startsWith('CX')) return 'UI/UX';
  return 'Quality';
}

function formatSeverityName(sev?: string): string {
  const s = (sev || '').toLowerCase().trim();
  if (s === 'critical' || s === 'blocker') return 'Critical';
  if (s === 'high' || s === 'error') return 'High';
  if (s === 'medium' || s === 'warning' || s === 'moderate') return 'Medium';
  if (s === 'low' || s === 'info') return 'Low';
  if (s === 'suggestion' || s === 'hint') return 'Suggestion';
  return 'Medium';
}

function formatStatusName(status?: string): string {
  const s = (status || '').toLowerCase().trim();
  switch (s) {
    case 'open': return 'Open';
    case 'planned': return 'Planned';
    case 'proposed': return 'Proposed';
    case 'review': return 'In Review';
    case 'applied': return 'Applied';
    case 'verifying': return 'Verifying';
    case 'resolved': return 'Resolved';
    case 'rejected': return 'Rejected';
    case 'ignored': return 'Ignored';
    case 'accepted-risk': return 'Accepted Risk';
    case 'needs-revalidation': return 'Needs Revalidation';
    default: return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Open';
  }
}

export function formatIssuesMarkdown(
  findingsOrIssues: (Finding | Issue)[],
  projectName: string = 'Project'
): string {
  const allIssues = normalizeToIssues(findingsOrIssues);
  const dateStr = new Date().toISOString().split('T')[0];

  const resolvedStatuses = new Set(['resolved', 'applied', 'rejected', 'ignored', 'accepted-risk']);
  const openIssues = allIssues.filter(i => !resolvedStatuses.has((i.status || 'open').toLowerCase()));
  const resolvedIssues = allIssues.filter(i => resolvedStatuses.has((i.status || 'open').toLowerCase()));

  const lines: string[] = [
    '# CraftLens Issues',
    `Generated: ${dateStr}`,
    '',
    '## Open Issues',
    '',
  ];

  if (openIssues.length === 0) {
    lines.push('No open issues detected.', 'All quality, security, and architectural checks are currently passing!', '');
  } else {
    openIssues.forEach((issue, idx) => {
      const sev = formatSeverityName(issue.severity);
      const cat = formatCategoryName(issue.category, issue.ruleId);
      const status = formatStatusName(issue.status);

      lines.push(`### ${issue.title || issue.ruleId || 'Detected Issue'}`);
      if (issue.ruleId && issue.ruleId !== 'UNKNOWN') {
        lines.push(`- Rule: \`${issue.ruleId}\``);
      }
      lines.push(`- Severity: ${sev}`);
      lines.push(`- Category: ${cat}`);
      lines.push(`- Status: ${status}`);

      if (issue.locations && issue.locations.length > 1) {
        lines.push('Locations:');
        for (const loc of issue.locations) {
          const line = loc.range?.startLine || 1;
          lines.push(`- \`${loc.filePath}:${line}\``);
        }
      } else {
        const primaryLoc = issue.locations?.[0];
        const filePath = primaryLoc?.filePath || issue.filePath || 'unknown file';
        const line = primaryLoc?.range?.startLine || issue.startLine || 1;
        lines.push(`- Location: \`${filePath}:${line}\``);
      }

      if (typeof issue.confidence === 'number' && issue.confidence > 0) {
        lines.push(`- Confidence: ${Math.round(issue.confidence * 100)}%`);
      }

      lines.push('');
      lines.push('#### What is wrong');
      lines.push(issue.whatIsWrong || issue.summary || issue.message || 'Issue detected in active source file.');
      lines.push('');
      lines.push('#### Why it matters');
      lines.push(issue.whyItMatters || issue.why || 'Affects software reliability, maintainability, or design integrity.');
      lines.push('');
      lines.push('#### Suggested remediation');
      lines.push('See `suggestions.md`.');

      if (idx < openIssues.length - 1) {
        lines.push('', '---', '');
      } else {
        lines.push('');
      }
    });
  }

  if (resolvedIssues.length > 0) {
    lines.push('## Resolved Issues', '');
    resolvedIssues.forEach((issue, idx) => {
      const sev = formatSeverityName(issue.severity);
      const cat = formatCategoryName(issue.category, issue.ruleId);
      const status = formatStatusName(issue.status);

      lines.push(`### ${issue.title || issue.ruleId || 'Resolved Issue'}`);
      if (issue.ruleId && issue.ruleId !== 'UNKNOWN') {
        lines.push(`- Rule: \`${issue.ruleId}\``);
      }
      lines.push(`- Severity: ${sev}`);
      lines.push(`- Category: ${cat}`);
      lines.push(`- Status: ${status}`);

      if (issue.locations && issue.locations.length > 1) {
        lines.push('Locations:');
        for (const loc of issue.locations) {
          const line = loc.range?.startLine || 1;
          lines.push(`- \`${loc.filePath}:${line}\``);
        }
      } else {
        const primaryLoc = issue.locations?.[0];
        const filePath = primaryLoc?.filePath || issue.filePath || 'unknown file';
        const line = primaryLoc?.range?.startLine || issue.startLine || 1;
        lines.push(`- Location: \`${filePath}:${line}\``);
      }

      lines.push('');
      lines.push('#### What is wrong');
      lines.push(issue.whatIsWrong || issue.summary || issue.message || 'Previously detected issue.');
      lines.push('');
      lines.push('#### Why it matters');
      lines.push(issue.whyItMatters || issue.why || 'Resolved issue preserved for historical record.');

      if (idx < resolvedIssues.length - 1) {
        lines.push('', '---', '');
      } else {
        lines.push('');
      }
    });
  }

  return lines.join('\n') + '\n';
}

export function formatSuggestionsMarkdown(
  findingsOrIssues: (Finding | Issue)[],
  projectName: string = 'Project'
): string {
  const allIssues = normalizeToIssues(findingsOrIssues);
  const dateStr = new Date().toISOString().split('T')[0];

  const lines: string[] = [
    '# CraftLens Suggestions',
    `Generated: ${dateStr}`,
    '',
  ];

  if (allIssues.length === 0) {
    lines.push(
      '## Status',
      'No open suggestions at this time.',
      'Codebase adheres to current recommended design tokens, hierarchy, and coding conventions.'
    );
    return lines.join('\n') + '\n';
  }

  allIssues.forEach((issue, idx) => {
    const title = issue.title || issue.problemTitle || issue.ruleId || 'Quality Suggestion';
    const issueId = issue.id || issue.fingerprint || `issue-${idx + 1}`;

    lines.push(`## ${title}`);
    lines.push(`Issue ID: \`${issueId}\``);
    lines.push('');

    // Suggested Fix
    const suggestedFix =
      issue.recommendation ||
      issue.howToFix ||
      issue.fix?.title ||
      issue.designFix?.title ||
      'Address the underlying code pattern to align with project conventions.';
    lines.push('### Suggested Fix');
    lines.push(suggestedFix);
    lines.push('');

    // Why
    const why =
      issue.whyItMatters ||
      issue.why ||
      issue.summary ||
      'Improves codebase clarity, maintainability, and user experience.';
    lines.push('### Why');
    lines.push(why);
    lines.push('');

    // Skill or Source
    if (issue.skillId) {
      const cleanSkill = issue.skillId.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      lines.push('### Skill');
      lines.push(cleanSkill);
    } else {
      lines.push('### Source');
      lines.push('CraftLens built-in rule');
    }
    lines.push('');

    // Automatic Fix availability
    let autoFixStatus = 'Not available';
    if (issue.fix?.kind === 'safe' || issue.autoFixAvailable) {
      autoFixStatus = 'Automatic fix available';
    } else if (issue.skillId) {
      autoFixStatus = 'Skill-assisted fix available';
    } else {
      autoFixStatus = 'Recommendation only';
    }
    lines.push('### Automatic Fix');
    lines.push(autoFixStatus);
    lines.push('');

    // Recommended Approach
    const recommendedApproach =
      issue.howToFix ||
      (issue.suggestions && (issue.suggestions[0] as any)?.message) ||
      (issue.recommendations && (issue.recommendations[0] as any)?.action) ||
      'Use the existing design system tokens and components instead of introducing another visual treatment.';
    lines.push('### Recommended Approach');
    lines.push(recommendedApproach);

    if (idx < allIssues.length - 1) {
      lines.push('', '---', '');
    } else {
      lines.push('');
    }
  });

  return lines.join('\n') + '\n';
}

export function formatUserChangesMarkdown(
  changes: UserChangeRecord[],
  projectName: string = 'Project',
  changeManager?: ChangeManager
): string {
  const lines: string[] = [
    '# CraftLens Changes',
    '',
  ];

  if (changes.length > 0) {
    lines.push(`**Total Changes Recorded:** ${changes.length}`, '');
  }

  // Optional section: Changes Pending Review
  const proposedChanges = changeManager
    ? changeManager.getAllChanges().filter(c => c.status === 'proposed' || c.status === 'review' || c.status === 'approved')
    : [];

  if (proposedChanges.length > 0) {
    lines.push('## Changes Pending Review', '');
    proposedChanges.forEach(p => {
      const primaryFile = p.files?.[0]?.filePath || 'unknown file';
      const adds = p.files?.[0]?.additions || 0;
      const dels = p.files?.[0]?.deletions || 0;
      lines.push(`### Proposed: ${p.title}`);
      lines.push(`- Issue: \`${p.issueIds?.[0] || 'issue-pending'}\``);
      lines.push(`- Change: \`${p.id}\``);
      lines.push(`- File: \`${primaryFile}\``);
      lines.push(`- Status: Proposed`);
      lines.push(`- Lines changed: +${adds} / -${dels}`);
      lines.push('');
      lines.push('#### Why');
      lines.push(p.explanation || 'Proposed change awaiting user review and application.');
      lines.push('');
    });
  }

  if (changes.length === 0 && proposedChanges.length === 0) {
    lines.push(
      '## Change History',
      'No applied changes recorded yet.',
      'Active workspace modifications, editor saves, and applied quick fixes will appear here sequentially.'
    );
    return lines.join('\n') + '\n';
  }

  if (changes.length > 0) {
    // Group applied/reverted changes by date
    const dateMap = new Map<string, UserChangeRecord[]>();
    // Render most recent first
    const reversed = [...changes].reverse();
    for (const c of reversed) {
      const d = new Date(c.timestamp || Date.now()).toISOString().split('T')[0];
      if (!dateMap.has(d)) {
        dateMap.set(d, []);
      }
      dateMap.get(d)!.push(c);
    }

    for (const [dateStr, records] of dateMap.entries()) {
      lines.push(`## ${dateStr}`, '');
      for (const c of records) {
        const actionPrefix = c.status === 'reverted' ? 'Reverted' : (c.status === 'verified' ? 'Verified' : 'Applied');
        const summary = c.summary || `Applied change ${c.id}`;
        const primaryFile = c.filesChanged?.[0] || 'unknown file';
        const adds = c.linesAdded !== undefined ? c.linesAdded : 0;
        const dels = c.linesRemoved !== undefined ? c.linesRemoved : 0;
        const statusLabel = c.status === 'reverted' ? 'Reverted' : (c.status === 'verified' ? 'Verified' : 'Applied');
        const issueId = c.issueId || c.resolvedFindings?.[0]?.ruleId || 'issue-resolved';

        lines.push(`### ${actionPrefix}: ${summary}`);
        lines.push(`- Issue: \`${issueId}\``);
        lines.push(`- Change: \`${c.id}\``);
        lines.push(`- File: \`${primaryFile}\``);
        lines.push(`- Status: ${statusLabel}`);
        lines.push(`- Lines changed: +${adds} / -${dels}`);
        lines.push('');
        lines.push('#### Why');
        lines.push(c.summary || 'Applied approved improvement to satisfy project standards.');
        lines.push('');
        lines.push('#### Verification');
        const isVerPassed = c.verification?.status === 'passed' || c.status === 'verified';
        lines.push(`- CraftLens audit: ${isVerPassed ? 'Passed' : 'Pending'}`);
        lines.push(`- Relevant UI rule: ${isVerPassed ? 'Passed' : 'Pending'}`);
        lines.push('');
      }
    }
  }

  return lines.join('\n') + '\n';
}

// Backward-compatible aliases to maintain full interoperability
export const formatProblemsMarkdown = formatIssuesMarkdown;
export const formatSuggestionMarkdown = formatSuggestionsMarkdown;
export const formatSolutionsMarkdown = formatSuggestionsMarkdown;
