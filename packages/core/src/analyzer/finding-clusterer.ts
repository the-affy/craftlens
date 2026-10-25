import { Finding } from '../types/finding.js';
import { normalizeFindingLocation, FindingLocation } from '../types/location.js';
import {
  SidebarFinding,
  SidebarFindingCategory as FindingCategory,
  SidebarSeverity,
} from '../types/sidebar-finding.js';

/**
 * Maps a finding to one of the 3 primary categories: UI / UX, Backend & Tech, or Security.
 * Security findings are never mixed into UI or general score.
 */
export function categorizeFinding(finding: Finding): FindingCategory {
  const ruleId = (finding.ruleId || '').toUpperCase();
  const cat = String((finding as any).category || '').toLowerCase();
  const clusterId = String(finding.clusterId || '').toLowerCase();

  // 1. Security (Strict separation)
  if (ruleId.startsWith('SEC-') || cat === 'security' || clusterId.includes('security')) {
    return 'security';
  }

  // 2. UI / UX Design
  if (
    ruleId.startsWith('UI-') ||
    ruleId.startsWith('UX-') ||
    ruleId.startsWith('VH-') ||
    ruleId.startsWith('CP-') ||
    ruleId.startsWith('CX-') ||
    ruleId.startsWith('ID-') ||
    ruleId.startsWith('TY-') ||
    ruleId.startsWith('LY-') ||
    ruleId.startsWith('IX-') ||
    ruleId.startsWith('ST-') ||
    ruleId.startsWith('AS-') ||
    ruleId.startsWith('CSS-') ||
    ruleId.startsWith('AX-') ||
    ruleId.startsWith('PH-') ||
    [
      'visual',
      'hierarchy',
      'css',
      'ux',
      'accessibility',
      'copy',
      'placeholder',
      'layout',
      'typography',
      'interaction',
      'design',
    ].includes(cat) ||
    ['visual-hierarchy', 'card-soup', 'gradient', 'rounded'].includes(clusterId)
  ) {
    return 'ui';
  }

  // 3. Backend & Tech (Code quality, error handling, state, architecture)
  return 'backend';
}

export function mapSeverityToSidebar(severity: string): SidebarSeverity {
  switch (severity) {
    case 'blocker':
      return 'critical';
    case 'error':
      return 'high';
    case 'warning':
      return 'medium';
    case 'info':
      return 'low';
    case 'suggestion':
    default:
      return 'suggestion';
  }
}

function getImpactWeight(severity: SidebarSeverity): number {
  switch (severity) {
    case 'critical':
      return 4.0;
    case 'high':
      return 3.0;
    case 'medium':
      return 2.0;
    case 'low':
      return 1.2;
    case 'suggestion':
      return 0.8;
  }
}

/**
 * Humanizes titles to avoid technical linter jargon in the sidebar.
 */
function humanizeTitle(finding: Finding): string {
  if (finding.problemTitle) return finding.problemTitle;
  if (finding.title && !finding.title.includes('-')) return finding.title;

  const ruleId = (finding.ruleId || '').toUpperCase();
  switch (ruleId) {
    case 'CP-007':
      return 'Card-heavy layout';
    case 'CP-008':
      return 'Nested card containers';
    case 'VH-007':
      return 'Competing primary actions';
    case 'VH-008':
      return 'Weak visual hierarchy';
    case 'UI-001':
      return 'Generic gradient';
    case 'UI-002':
      return 'Decorative glow overlay';
    case 'UI-004':
      return 'Excessive rounded corners';
    case 'UI-009':
      return 'Excessive badge containers';
    case 'ID-001':
      return 'Decorative element without purpose';
    case 'CX-004':
      return 'Spacing scale inconsistency';
    case 'CX-005':
      return 'Corner radius drift';
    case 'CX-013':
      return 'Design system drift';
    case 'AX-016':
      return 'Icon button missing name';
    case 'UX-017':
      return 'Nested interactive elements';
    case 'UX-018':
      return 'Form field missing label';
    case 'UX-019':
      return 'Button missing explicit type';
    case 'UI-013':
      return 'Trend stacking';
    case 'UI-014':
      return 'Visual treatment overload';
    case 'UI-015':
      return 'Template-like page structure';
    case 'UI-016':
      return 'Strong template-like visual pattern';
    case 'UI-017':
      return 'Badge saturation';
    case 'UI-019':
      return 'Possible unsupported metric';
    case 'UI-020':
      return 'Template convergence across screens';
    case 'UI-022':
      return 'Responsive viewport overflow';
    case 'CP-002':
      return 'Generic CTA copy';
    case 'AP-008':
      return "Error isn't handled";
    case 'AP-014':
      return 'Compiler type escape hatch';
    case 'CD-001':
      return 'Fragile type assertion';
    case 'RE-001':
      return 'Fragile state flow';
    case 'SEC-001':
      return 'Secret exposed in code';
    case 'SEC-002':
      return 'Sensitive auth stored on client';
    case 'SEC-003':
      return 'Unsafe HTML rendering';
    case 'SEC-B01':
      return 'Unsafe client trust';
    case 'SEC-P01':
      return 'Error details leaked to client';
    default:
      return finding.message || 'Issue detected';
  }
}

/**
 * Humanizes explanation to talk like a helpful senior teammate reviewing product code.
 */
function humanizeSummary(finding: Finding, instances: number): string {
  if (finding.whatIsWrong) {
    return finding.whatIsWrong;
  }

  const ruleId = (finding.ruleId || '').toUpperCase();
  switch (ruleId) {
    case 'CP-007':
      return instances > 1
        ? `The interface wraps ${instances} elements in identical card containers, flattening the visual hierarchy.`
        : 'The interface relies on uniform card containers for metrics, making the layout feel heavy.';
    case 'VH-008':
      return 'Most of this view uses the same visual treatment for primary and secondary information.';
    case 'UI-001':
      return 'A multi-stop decorative gradient is used without communicating product meaning or brand intent.';
    case 'UI-004':
      return 'Multiple nested containers use large rounded corners, causing visual competition.';
    case 'AP-008':
      return 'An error or rejection is caught without logging, reporting, or user feedback.';
    case 'RE-001':
      return 'An effect synchronizes state that could be derived directly during render.';
    case 'SEC-001':
      return 'A high-entropy secret, API key, or credential was found directly in source code.';
    case 'SEC-002':
      return 'Authentication tokens or sensitive user credentials are stored in unencrypted browser storage.';
    case 'SEC-B01':
      return 'Client input is trusted directly for sensitive authorization or resource decisions.';
    default:
      return finding.message || 'A quality improvement opportunity was detected.';
  }
}

function humanizeWhy(finding: Finding): string {
  if (finding.whyItMatters) return finding.whyItMatters;
  if (finding.description) return finding.description;

  const ruleId = (finding.ruleId || '').toUpperCase();
  switch (ruleId) {
    case 'CP-007':
      return 'When everything is inside a card, nothing stands out. Users cannot quickly distinguish primary metrics from supporting context.';
    case 'VH-008':
      return 'Everything has the same visual weight, so users cannot quickly understand what matters most.';
    case 'UI-001':
      return 'Gratuitous gradients distract from content and make interfaces feel like generic boilerplate rather than tailored software.';
    case 'AP-008':
      return 'When errors disappear silently, bugs become impossible to diagnose and users are left with broken or frozen views.';
    case 'RE-001':
      return 'Chained effects cause unnecessary re-renders, flashing intermediate states, and subtle race conditions.';
    case 'SEC-001':
      return 'Committed credentials can be extracted by anyone with repository access, compromising production services.';
    case 'SEC-002':
      return 'Unprotected client storage is accessible to any script running on the domain (including third-party scripts).';
    case 'SEC-B01':
      return 'Malicious clients can bypass UI restrictions if the server does not enforce independent authorization boundaries.';
    default:
      return 'Addressing this keeps the product cohesive, maintainable, and dependable.';
  }
}

function humanizeRecommendation(finding: Finding): string {
  if (finding.howToFix) return finding.howToFix;
  if (finding.recommendation) return finding.recommendation;

  const ruleId = (finding.ruleId || '').toUpperCase();
  switch (ruleId) {
    case 'CP-007':
      return 'Keep the 2-3 most important metrics prominent. Move secondary information into a compact list or grouped section.';
    case 'VH-008':
      return 'Make primary information visually dominant and reduce the visual weight of supporting details.';
    case 'UI-001':
      return 'Replace the decorative gradient with clean, purposeful background tokens or subtle neutral borders.';
    case 'AP-008':
      return 'Log the error with contextual metadata or present a clear recovery state to the user.';
    case 'RE-001':
      return 'Calculate derived values inline during rendering instead of storing them in state via useEffect.';
    case 'SEC-001':
      return 'Move sensitive keys into environment variables or a secure secret manager.';
    case 'SEC-002':
      return 'Store authentication session tokens in HttpOnly, Secure cookies.';
    case 'SEC-B01':
      return 'Verify user permissions on the server or API layer before returning protected data.';
    default:
      return 'Refactor this section to follow project standards.';
  }
}

function buildEvidenceList(findings: Finding[]): string[] {
  const evidenceSet = new Set<string>();

  for (const f of findings) {
    if (f.evidence && f.evidence.length > 0) {
      for (const ev of f.evidence) {
        if (ev.explanation) evidenceSet.add(ev.explanation);
        else if (ev.snippet) evidenceSet.add(`Found in code: ${ev.snippet.trim().substring(0, 80)}`);
      }
    }
  }

  if (evidenceSet.size === 0) {
    const count = findings.length;
    evidenceSet.add(`${count} instance${count !== 1 ? 's' : ''} detected across the file.`);
  }

  return Array.from(evidenceSet).slice(0, 6);
}

function inferSuggestedApproach(finding: Finding): string | undefined {
  const ruleId = (finding.ruleId || '').toUpperCase();
  switch (ruleId) {
    case 'CP-007':
    case 'VH-008':
      return 'Primary metrics → Supporting information → Detailed data';
    case 'VH-007':
      return '1 clear Primary CTA → Muted Secondary action → Contextual links';
    case 'UI-001':
    case 'UI-002':
      return 'Neutral canvas → Clean borders → Purposeful brand accents';
    case 'AP-008':
      return 'Catch failure → Log context → Surface recovery state';
    case 'SEC-001':
    case 'SEC-002':
      return 'Client request → Server-side authentication → HttpOnly session';
    default:
      return undefined;
  }
}

/**
 * Clusters raw findings into prioritized, human-friendly SidebarFinding items.
 * Ranks by: Impact × Confidence × Scope (Section 4)
 */
export function clusterFindingsToSidebarFindings(rawFindings: Finding[]): SidebarFinding[] {
  const groups = new Map<string, Finding[]>();

  for (const f of rawFindings) {
    // Cluster key: clusterId or ruleId
    const key = f.clusterId || f.problemTitle || f.ruleId;
    const existing = groups.get(key) || [];
    existing.push(f);
    groups.set(key, existing);
  }

  const sidebarFindings: SidebarFinding[] = [];

  for (const [key, cluster] of groups.entries()) {
    const primary = cluster[0];
    const category = categorizeFinding(primary);
    const severity = mapSeverityToSidebar(primary.severity);
    const title = humanizeTitle(primary);
    const summary = humanizeSummary(primary, cluster.length);
    const why = humanizeWhy(primary);
    const recommendation = humanizeRecommendation(primary);
    const evidence = buildEvidenceList(cluster);
    const suggestedApproach = inferSuggestedApproach(primary);

    // Collect all locations defensively
    const locations: FindingLocation[] = [];
    const locationKeySet = new Set<string>();

    const addLocation = (loc?: FindingLocation) => {
      if (!loc || !loc.filePath) return;
      const key = `${loc.filePath}:${loc.range?.startLine || 1}:${loc.range?.startColumn || 1}`;
      if (!locationKeySet.has(key)) {
        locationKeySet.add(key);
        locations.push(loc);
      }
    };

    for (const item of cluster) {
      addLocation(normalizeFindingLocation(item));
      if (item.relatedLocations) {
        for (const rel of item.relatedLocations) {
          addLocation(normalizeFindingLocation(rel));
        }
      }
    }

    const verification = primary.verification || cluster.find(c => c.verification)?.verification;
    const falsePositiveNote = primary.falsePositiveNote || cluster.find(c => c.falsePositiveNote)?.falsePositiveNote;
    const signals = primary.signals?.map(s => `${s.type}: ${typeof s.value === 'string' ? s.value : JSON.stringify(s.value)}`);
    const affectedComponents = primary.affectedComponents;
    const route = primary.route;

    // Determine fix type
    let fix: SidebarFinding['fix'] = undefined;
    if (primary.designFix) {
      fix = {
        type: 'assisted',
        description: primary.designFix.description || 'Preview and apply proposed design change',
        changes: primary.designFix.changes,
      };
    } else if (primary.fix) {
      fix = {
        type: primary.fix.kind === 'safe' ? 'safe' : 'assisted',
        description: primary.fix.title || 'Apply automated fix',
        changes: primary.fix.changes,
      };
    } else {
      fix = {
        type: 'manual',
        description: 'Review and modify in editor',
      };
    }

    // Calculate score: Impact * Confidence * Scope
    const impact = getImpactWeight(severity);
    const confidence = primary.confidence || 0.85;
    const scope = cluster.length;
    // Logarithmic scale for scope to avoid overwhelming small high-impact bugs
    const relevanceScore = impact * confidence * (1 + 0.35 * Math.log2(scope + 1));

    sidebarFindings.push({
      id: key,
      category,
      title,
      summary,
      severity,
      instances: cluster.length,
      location: locations[0],
      locations,
      why,
      evidence,
      recommendation,
      suggestedApproach,
      verification,
      signals,
      falsePositiveNote,
      affectedComponents,
      route,
      fix,
      ruleId: primary.ruleId,
      confidence: primary.confidence,
      detection: primary.intent?.category ? `Page intent: ${primary.intent.category}` : undefined,
    });
  }

  // Sort by priority formula descending
  return sidebarFindings.sort((a, b) => {
    const aImpact = getImpactWeight(a.severity);
    const bImpact = getImpactWeight(b.severity);
    const aScore = aImpact * (a.confidence || 0.8) * (1 + 0.35 * Math.log2(a.instances + 1));
    const bScore = bImpact * (b.confidence || 0.8) * (1 + 0.35 * Math.log2(b.instances + 1));
    return bScore - aScore;
  });
}
