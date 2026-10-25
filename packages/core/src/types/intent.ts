export type DesignIntentCategory =
  | 'marketing'
  | 'dashboard'
  | 'monitoring'
  | 'configuration'
  | 'form'
  | 'checkout'
  | 'authentication'
  | 'profile'
  | 'settings'
  | 'search'
  | 'comparison'
  | 'content'
  | 'documentation'
  | 'navigation'
  | 'workflow'
  | 'data-entry'
  | 'data-analysis'
  | 'other';

export interface DesignIntent {
  category: DesignIntentCategory;
  confidence: number;
  source: 'inferred' | 'configured' | 'corrected';
  indicators: string[];
  description: string;
}
