import { Severity } from './severity.js';
import { SourceLocation } from './location.js';
import { Evidence } from './evidence.js';
import { FixDescriptor } from './fix.js';

export interface Finding {
  ruleId: string;
  message: string;
  description: string;
  severity: Severity;
  confidence: number;
  location: SourceLocation;
  evidence: Evidence[];
  recommendation?: string;
  fix?: FixDescriptor;
  relatedFindings?: string[];
  clusterId?: string;
}
