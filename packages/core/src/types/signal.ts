import { SourceLocation } from './location.js';
import { Evidence } from './evidence.js';

export type SignalSource = 'ast' | 'style' | 'dom' | 'text' | 'token' | 'render' | 'css' | 'heuristics';

export interface Signal {
  id: string;
  type: string;
  source: SignalSource;
  filePath?: string;
  location?: SourceLocation;
  value: unknown;
  evidence: Evidence;
}

export type PatternScope = 'element' | 'component' | 'section' | 'page' | 'cross-screen';

export interface Pattern {
  id: string;
  type: string;
  signals: Signal[];
  scope: PatternScope;
  confidence: number;
  evidence: Evidence[];
  context?: Record<string, unknown>;
  description?: string;
}
