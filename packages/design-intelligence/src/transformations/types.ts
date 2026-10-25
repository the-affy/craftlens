import { DesignTransformation, DesignRecommendation } from '@craftlens/core';
import { DesignContext } from '../context/design-context.js';
import { DesignProblem, ProblemCategory } from '../problem-model/problem-model.js';

export type { DesignTransformation, DesignRecommendation };

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export type DesignRecommendationCandidate = DesignRecommendation;

export interface TransformationDefinition {
  id: DesignTransformation;
  name: string;
  applicableCategories: ProblemCategory[];
  prerequisites: string[];
  generateCandidates(context: DesignContext, problem: DesignProblem): DesignRecommendationCandidate[];
  validate(candidate: DesignRecommendationCandidate, context: DesignContext): ValidationResult;
}
