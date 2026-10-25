import { AnalysisContext } from './context.js';
import { Finding } from './finding.js';
import { Rule, RuleRecommendation } from './rule.js';
import { SkillPackage, RuleExplanation, FixStrategy } from './skill.js';

export interface RuleProvider {
  id?: string;
  getRules(): Rule[];
}

export interface SkillProvider {
  id?: string;
  getSkills(): SkillPackage[];
}

export interface DesignQuery {
  category?: string;
  component?: string;
  keywords?: string[];
  context?: string;
}

export interface ResearchProvider {
  id?: string;
  search(query: DesignQuery): Promise<RuleRecommendation[]>;
}

export interface FixProvider {
  id?: string;
  generate(finding: Finding): Promise<FixStrategy | undefined>;
}

export interface RulesEngineContract {
  loadSkill(skill: SkillPackage): Promise<void>;
  unloadSkill(skillId: string): Promise<void>;
  enableRule(ruleId: string): Promise<void>;
  disableRule(ruleId: string): Promise<void>;
  analyze(context: AnalysisContext): Promise<Finding[]>;
  explain(ruleId: string): Promise<RuleExplanation>;
  getRules(): Rule[];
  getSkills(): SkillPackage[];
}
