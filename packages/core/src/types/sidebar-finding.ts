import { FindingLocation } from './location.js';
import { FindingCategory } from './finding.js';

export type SidebarFindingCategory = 'ui' | 'backend' | 'security';

export type SidebarSeverity = 'critical' | 'high' | 'medium' | 'low' | 'suggestion';

export interface SidebarFindingFix {
  type: 'safe' | 'assisted' | 'manual';
  description: string;
  changes?: any[];
}

export interface SidebarFinding {
  id: string;
  category: SidebarFindingCategory | string;
  title: string;
  summary: string;
  severity: SidebarSeverity;
  instances: number;
  location?: FindingLocation;
  locations?: FindingLocation[];
  why: string;
  evidence: string[];
  recommendation: string;
  suggestedApproach?: string;
  verification?: string;
  signals?: string[];
  falsePositiveNote?: string;
  affectedComponents?: string[];
  route?: string;
  fix?: SidebarFindingFix;
  ruleId?: string;
  confidence?: number;
  detection?: string;
}

export type RecommendationType = 'skill' | 'mcp' | 'tool' | 'extension';

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  category: FindingCategory | SidebarFindingCategory | string;
  triggers: string[];
  type: RecommendationType;
  url?: string;
  relevanceScore: number;
  recommendedCapability?: string;
  relevantTool?: string;
  why?: string;
  details?: string[];
  actionLabel?: string;
  actionCommand?: string;
}
