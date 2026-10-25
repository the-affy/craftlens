import { SourceLocation } from './location.js';

export type FixPolicy = 'safe' | 'assisted' | 'manual' | 'none';
export type FixSafety = 'safe' | 'assisted' | 'manual';

export interface TextEditChange {
  range: SourceLocation;
  newText: string;
  before?: string;
}

export interface ProposedChange {
  file?: string;
  range: SourceLocation;
  before?: string;
  after: string;
  explanation?: string;
}

export interface FixDescriptor {
  title: string;
  kind: 'safe' | 'assisted';
  changes: TextEditChange[];
  isPreferred?: boolean;
}

export interface DesignFix {
  id: string;
  title: string;
  description: string;
  changes: ProposedChange[];
  safety: FixSafety;
  isPreferred?: boolean;
}

