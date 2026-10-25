import { Finding, DesignTransformation } from '../types/finding.js';
import { normalizeFindingLocation } from '../types/location.js';
import { normalizeCategory } from '../types/finding.js';

export type RecommendationCategory = 'ui' | 'accessibility' | 'performance' | 'security' | 'code';
export type FixMode = 'safe' | 'assisted' | 'manual';

export interface RecommendationTarget {
  filePath?: string;
  startLine?: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
}

export interface RecommendationTextEdit {
  filePath?: string;
  startLine: number;
  startColumn?: number;
  endLine: number;
  endColumn?: number;
  originalText?: string;
  newText: string;
}

export interface RecommendationFix {
  type?: FixMode;
  description?: string;
  edits?: RecommendationTextEdit[];
  isPreferred?: boolean;
}

/**
 * Canonical Recommendation interface conforming to CraftLens data contract.
 * The UI, recommendation engine, and apply engine all share this canonical model.
 */
export interface CanonicalRecommendation {
  id: string;
  title: string;
  description: string;
  category?: RecommendationCategory;
  transformation?: string;
  target?: RecommendationTarget;
  evidence?: string[];
  rationale?: string;
  whyItFits?: string[];
  tradeoff?: string;
  confidence?: number;
  fix?: RecommendationFix;

  // Extensions for backward-compatibility with DesignRecommendation
  affectedElements?: string[];
  implementationApproach?: string;
  scope?: 'local' | 'component' | 'section' | 'page' | 'system';
  proposedChanges?: {
    startLine?: number;
    endLine?: number;
    originalSnippet?: string;
    replacementSnippet?: string;
  }[];
}

export type CodeRecommendation = CanonicalRecommendation;

export interface TransformationCapability {
  transformation: string;
  canApplyAutomatically: boolean;
  defaultMode: FixMode;
  description: string;
}

/**
 * Explicit registry of supported transformations and whether they can be applied automatically.
 */
export const TRANSFORMATION_CAPABILITIES: Record<string, TransformationCapability> = {
  hierarchize: {
    transformation: 'hierarchize',
    canApplyAutomatically: true,
    defaultMode: 'assisted',
    description: 'Establish clear primary vs secondary visual weight',
  },
  distill: {
    transformation: 'distill',
    canApplyAutomatically: true,
    defaultMode: 'assisted',
    description: 'Replace repetitive card wrappers with clean editorial layouts',
  },
  differentiate: {
    transformation: 'differentiate',
    canApplyAutomatically: true,
    defaultMode: 'assisted',
    description: 'Vary visual treatments based on element role and urgency',
  },
  reshape: {
    transformation: 'reshape',
    canApplyAutomatically: false,
    defaultMode: 'manual',
    description: 'Restructure component layout and layout flow',
  },
  restructure: {
    transformation: 'restructure',
    canApplyAutomatically: false,
    defaultMode: 'manual',
    description: 'Reorganize content hierarchy and containers',
  },
  group: {
    transformation: 'group',
    canApplyAutomatically: false,
    defaultMode: 'manual',
    description: 'Group related information items together',
  },
  simplify: {
    transformation: 'simplify',
    canApplyAutomatically: false,
    defaultMode: 'manual',
    description: 'Reduce visual noise and unnecessary ornaments',
  },
  typeset: {
    transformation: 'typeset',
    canApplyAutomatically: false,
    defaultMode: 'manual',
    description: 'Align typography scale and line heights',
  },
  colorize: {
    transformation: 'colorize',
    canApplyAutomatically: false,
    defaultMode: 'manual',
    description: 'Apply intentional color accents to primary interactive targets',
  },
  quieter: {
    transformation: 'quieter',
    canApplyAutomatically: false,
    defaultMode: 'manual',
    description: 'Tone down excessive borders, glows, and harsh contrast',
  },
  clarify: {
    transformation: 'clarify',
    canApplyAutomatically: false,
    defaultMode: 'manual',
    description: 'Improve copy clarity, CTAs, and labels',
  },
  'strengthen-content': {
    transformation: 'strengthen-content',
    canApplyAutomatically: false,
    defaultMode: 'manual',
    description: 'Replace generic placeholders with domain-specific metrics and content',
  },
  'improve-interaction': {
    transformation: 'improve-interaction',
    canApplyAutomatically: false,
    defaultMode: 'manual',
    description: 'Add hover, active, and focus interaction states',
  },
  'improve-responsive': {
    transformation: 'improve-responsive',
    canApplyAutomatically: false,
    defaultMode: 'manual',
    description: 'Replace fixed widths with responsive constraints and fluid wrapping',
  },
  harden: {
    transformation: 'harden',
    canApplyAutomatically: false,
    defaultMode: 'manual',
    description: 'Add defensive state handling for loading, empty, and error conditions',
  },
  normalize: {
    transformation: 'normalize',
    canApplyAutomatically: false,
    defaultMode: 'manual',
    description: 'Align styling with project design system tokens',
  },
  polish: {
    transformation: 'polish',
    canApplyAutomatically: false,
    defaultMode: 'manual',
    description: 'Refine alignment, padding, and subtle micro-details',
  },
};

export interface RecommendationValidationResult {
  valid: boolean;
  code?:
    | 'INVALID_RECOMMENDATION'
    | 'MISSING_REQUIRED_INFO'
    | 'INVALID_TARGET'
    | 'INVALID_FIX'
    | 'UNKNOWN_TRANSFORMATION'
    | 'MANUAL_ONLY';
  message: string;
  recommendation?: CanonicalRecommendation;
}

/**
 * Normalizes raw/partial recommendation data into a complete canonical recommendation.
 */
export function normalizeRecommendation(raw: any, finding?: Finding): CanonicalRecommendation {
  if (!raw || typeof raw !== 'object') {
    const fallbackId = `rec-${finding?.id || finding?.ruleId || 'gen'}-${Date.now()}`;
    const fallbackTitle = finding?.recommendation || finding?.howToFix || 'Design Recommendation';
    return {
      id: fallbackId,
      title: fallbackTitle,
      description: finding?.message || 'Improve interface quality and design discipline.',
      category: mapCategory(finding?.category, finding?.ruleId),
      evidence: extractEvidenceStrings(finding?.evidence),
      confidence: finding?.confidence || 0.85,
      fix: { type: 'manual' },
    };
  }

  // 1. ID
  const id = typeof raw.id === 'string' && raw.id.trim()
    ? raw.id.trim()
    : `rec-${finding?.id || finding?.ruleId || 'item'}-${Date.now()}`;

  // 2. Title
  const rawTitle = typeof raw.title === 'string' ? raw.title.trim() : '';
  const title = rawTitle || finding?.recommendation || finding?.howToFix || 'Design Recommendation';

  // 3. Description
  const rawDesc = typeof raw.description === 'string' ? raw.description.trim() : '';
  const description = rawDesc || finding?.message || finding?.whatIsWrong || 'Apply recommended design improvement.';

  // 4. Category
  const category = mapCategory(raw.category || finding?.category, finding?.ruleId);

  // 5. Transformation
  const transformation = typeof raw.transformation === 'string' && raw.transformation.trim()
    ? raw.transformation.trim().toLowerCase()
    : undefined;

  // 6. Target Location
  const normLoc = finding ? normalizeFindingLocation(finding) : undefined;
  let target: RecommendationTarget | undefined;

  if (raw.target && typeof raw.target === 'object') {
    target = {
      filePath: typeof raw.target.filePath === 'string' ? raw.target.filePath : normLoc?.filePath,
      startLine: typeof raw.target.startLine === 'number' ? Math.max(1, raw.target.startLine) : normLoc?.range?.startLine,
      startColumn: typeof raw.target.startColumn === 'number' ? Math.max(1, raw.target.startColumn) : normLoc?.range?.startColumn,
      endLine: typeof raw.target.endLine === 'number' ? Math.max(1, raw.target.endLine) : normLoc?.range?.endLine,
      endColumn: typeof raw.target.endColumn === 'number' ? Math.max(1, raw.target.endColumn) : normLoc?.range?.endColumn,
    };
  } else if (normLoc?.filePath) {
    target = {
      filePath: normLoc.filePath,
      startLine: normLoc.range?.startLine || (normLoc as any).start?.line || 1,
      startColumn: normLoc.range?.startColumn || (normLoc as any).start?.column || 1,
      endLine: normLoc.range?.endLine || (normLoc as any).end?.line || 1,
      endColumn: normLoc.range?.endColumn || (normLoc as any).end?.column || 1,
    };
  }

  // 7. Evidence
  const evidence = Array.isArray(raw.evidence) && raw.evidence.length > 0
    ? extractEvidenceStrings(raw.evidence)
    : extractEvidenceStrings(finding?.evidence);

  // 8. Rationale / Why it fits
  const rationale = typeof raw.rationale === 'string' && raw.rationale.trim()
    ? raw.rationale.trim()
    : typeof raw.why === 'string'
      ? raw.why.trim()
      : Array.isArray(raw.whyItFits) && raw.whyItFits.length > 0
        ? raw.whyItFits.join(' ')
        : finding?.whyItMatters || undefined;

  const whyItFits = Array.isArray(raw.whyItFits)
    ? raw.whyItFits.map(String)
    : rationale ? [rationale] : [];

  const tradeoff = typeof raw.tradeoff === 'string' ? raw.tradeoff : undefined;
  const confidence = typeof raw.confidence === 'number' && !isNaN(raw.confidence)
    ? Math.max(0, Math.min(1, raw.confidence))
    : finding?.confidence || 0.85;

  // 9. Fix Normalization
  let fix: RecommendationFix | undefined;
  const rawFix = raw.fix;

  if (rawFix && typeof rawFix === 'object') {
    const rawType = typeof rawFix.type === 'string' ? rawFix.type.toLowerCase() : undefined;
    const fixType: FixMode = rawType === 'safe' || rawType === 'assisted' || rawType === 'manual'
      ? rawType
      : 'assisted';

    const edits: RecommendationTextEdit[] = [];
    if (Array.isArray(rawFix.edits)) {
      for (const e of rawFix.edits) {
        if (e && typeof e === 'object' && typeof e.newText === 'string') {
          edits.push({
            filePath: typeof e.filePath === 'string' ? e.filePath : target?.filePath,
            startLine: typeof e.startLine === 'number' ? e.startLine : target?.startLine || 1,
            startColumn: typeof e.startColumn === 'number' ? e.startColumn : target?.startColumn || 1,
            endLine: typeof e.endLine === 'number' ? e.endLine : target?.endLine || 1,
            endColumn: typeof e.endColumn === 'number' ? e.endColumn : target?.endColumn || 1,
            originalText: typeof e.originalText === 'string' ? e.originalText : undefined,
            newText: e.newText,
          });
        }
      }
    }

    fix = {
      type: fixType,
      description: typeof rawFix.description === 'string' ? rawFix.description : undefined,
      edits: edits.length > 0 ? edits : undefined,
      isPreferred: Boolean(rawFix.isPreferred),
    };
  } else if (Array.isArray(raw.proposedChanges) && raw.proposedChanges.length > 0) {
    const edits: RecommendationTextEdit[] = raw.proposedChanges
      .filter((c: any) => c && typeof c.replacementSnippet === 'string')
      .map((c: any) => ({
        filePath: target?.filePath,
        startLine: typeof c.startLine === 'number' ? c.startLine : target?.startLine || 1,
        endLine: typeof c.endLine === 'number' ? c.endLine : target?.endLine || 1,
        originalText: c.originalSnippet,
        newText: c.replacementSnippet,
      }));

    if (edits.length > 0) {
      fix = {
        type: 'assisted',
        description: 'Contextual replacement',
        edits,
      };
    }
  } else if (finding?.designFix && Array.isArray(finding.designFix.changes)) {
    const edits: RecommendationTextEdit[] = finding.designFix.changes.map((c: any) => ({
      filePath: c.file || target?.filePath,
      startLine: c.range?.start?.line || target?.startLine || 1,
      startColumn: c.range?.start?.column || target?.startColumn || 1,
      endLine: c.range?.end?.line || target?.endLine || 1,
      endColumn: c.range?.end?.column || target?.endColumn || 1,
      originalText: c.before,
      newText: c.after || c.newText || '',
    }));

    const rawSafety = typeof finding.designFix.safety === 'string' ? finding.designFix.safety.toLowerCase() : 'assisted';
    const safetyType: FixMode = rawSafety === 'safe' || rawSafety === 'assisted' ? rawSafety : 'assisted';

    fix = {
      type: safetyType,
      description: finding.designFix.description || finding.designFix.title,
      edits,
    };
  } else if (finding?.fix && Array.isArray((finding.fix as any).changes)) {
    const edits: RecommendationTextEdit[] = (finding.fix as any).changes.map((c: any) => ({
      filePath: target?.filePath,
      startLine: c.range?.start?.line || target?.startLine || 1,
      startColumn: c.range?.start?.column || target?.startColumn || 1,
      endLine: c.range?.end?.line || target?.endLine || 1,
      endColumn: c.range?.end?.column || target?.endColumn || 1,
      originalText: c.before,
      newText: c.newText || c.after || '',
    }));

    const rawKind = typeof (finding.fix as any).kind === 'string' ? (finding.fix as any).kind.toLowerCase() : 'safe';
    const fixKind: FixMode = rawKind === 'assisted' ? 'assisted' : 'safe';

    fix = {
      type: fixKind,
      description: (finding.fix as any).title,
      edits,
    };
  } else if (transformation && TRANSFORMATION_CAPABILITIES[transformation]) {
    const cap = TRANSFORMATION_CAPABILITIES[transformation];
    fix = {
      type: cap.defaultMode,
      description: cap.description,
    };
  } else {
    fix = {
      type: 'manual',
      description: 'Follow implementation guidance manually.',
    };
  }

  return {
    id,
    title,
    description,
    category,
    transformation,
    target,
    evidence,
    rationale,
    whyItFits,
    tradeoff,
    confidence,
    fix,
    affectedElements: Array.isArray(raw.affectedElements) ? raw.affectedElements.map(String) : [],
    implementationApproach: typeof raw.implementationApproach === 'string' ? raw.implementationApproach : undefined,
    scope: raw.scope || 'component',
    proposedChanges: raw.proposedChanges,
  };
}

/**
 * Validates a recommendation before passing it to the UI or execution pipeline.
 */
export function validateRecommendation(rec: any): RecommendationValidationResult {
  if (!rec || typeof rec !== 'object') {
    return {
      valid: false,
      code: 'INVALID_RECOMMENDATION',
      message: 'Unable to apply recommendation: The recommendation data is missing.',
    };
  }

  if (typeof rec.id !== 'string' || !rec.id.trim()) {
    return {
      valid: false,
      code: 'MISSING_REQUIRED_INFO',
      message: 'Unable to apply recommendation: This recommendation is missing a valid identifier.',
    };
  }

  if (typeof rec.title !== 'string' || !rec.title.trim()) {
    return {
      valid: false,
      code: 'MISSING_REQUIRED_INFO',
      message: 'Unable to apply recommendation: This recommendation is missing required title information.',
    };
  }

  // Check transformation capability if specified
  if (rec.transformation && typeof rec.transformation === 'string') {
    const normTrans = rec.transformation.trim().toLowerCase();
    if (!TRANSFORMATION_CAPABILITIES[normTrans]) {
      return {
        valid: false,
        code: 'UNKNOWN_TRANSFORMATION',
        message: 'This recommendation can be reviewed manually, but CraftLens does not have an automatic fix for it yet.',
      };
    }
  }

  return {
    valid: true,
    recommendation: normalizeRecommendation(rec),
    message: 'Valid recommendation',
  };
}

function mapCategory(rawCat?: string, ruleId?: string): RecommendationCategory {
  const norm = normalizeCategory(rawCat, ruleId);
  switch (norm) {
    case 'ui-ux':
      return 'ui';
    case 'accessibility':
      return 'accessibility';
    case 'performance':
      return 'performance';
    case 'security':
      return 'security';
    case 'content':
      return 'ui';
    case 'code':
    case 'code-quality':
    default:
      return 'code';
  }
}

function extractEvidenceStrings(evidence: any): string[] {
  if (!Array.isArray(evidence)) return [];
  const results: string[] = [];
  for (const item of evidence) {
    if (item === null || item === undefined) continue;
    if (typeof item === 'string') {
      results.push(item);
    } else if (typeof item === 'object') {
      const text = item.explanation || item.snippet || item.message || item.text || item.description;
      if (typeof text === 'string' && text.trim()) {
        results.push(text.trim());
      }
    }
  }
  return results;
}
