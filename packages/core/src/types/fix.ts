import { SourceLocation } from './location.js';

export type FixPolicy = 'safe' | 'assisted' | 'none';

export interface TextEditChange {
  range: SourceLocation;
  newText: string;
}

export interface FixDescriptor {
  title: string;
  kind: 'safe' | 'assisted';
  changes: TextEditChange[];
  isPreferred?: boolean;
}
