import { SourceLocation } from './location.js';

export type EvidenceType =
  | 'ast'
  | 'type'
  | 'css'
  | 'dom'
  | 'visual'
  | 'graph'
  | 'runtime'
  | 'network'
  | 'semantic'
  | 'cluster'
  | 'regex'
  | 'heuristic'
  | 'rule';


export interface Evidence {
  type: EvidenceType;
  explanation: string;
  location?: SourceLocation;
  snippet?: string;
  metadata?: Record<string, unknown>;
}
