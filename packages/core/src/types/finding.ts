import { Severity } from './severity.js';
import { SourceLocation } from './location.js';
import { Evidence } from './evidence.js';
import { FixDescriptor } from './fix.js';

export type FindingType = 'problem' | 'suggestion' | 'pattern_observation';

export interface Finding {
  ruleId: string;
  message: string;
  description: string;
  severity: Severity;
  confidence: number;
  location: SourceLocation;
  evidence: Evidence[];
  findingType?: FindingType;
  fingerprint?: string;
  recommendation?: string;
  fix?: FixDescriptor;
  relatedFindings?: string[];
  clusterId?: string;
}

export function computeFindingFingerprint(finding: {
  ruleId: string;
  location: SourceLocation;
  message: string;
}): string {
  // Deterministic structural fingerprint identifying this finding across re-edits
  const base = `${finding.ruleId}:${finding.location.filePath}:${finding.location.start.line}:${finding.message.substring(0, 40)}`;
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    hash = (hash << 5) - hash + base.charCodeAt(i);
    hash |= 0;
  }
  return `${finding.ruleId}_${Math.abs(hash).toString(16)}`;
}
