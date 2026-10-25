import { DesignContext } from '../context/design-context.js';
import { DesignProblem } from '../problem-model/problem-model.js';
import { TransformationDefinition, DesignRecommendationCandidate, ValidationResult } from './types.js';

export class ColorizeTransformation implements TransformationDefinition {
  public readonly id = 'colorize';
  public readonly name = 'Colorize';
  public readonly applicableCategories = ['color' as const];
  public readonly prerequisites = [];

  public generateCandidates(context: DesignContext, problem: DesignProblem): DesignRecommendationCandidate[] {
    const existingColors = context.existingDesignSystem?.colors || [];
    const brandColor = existingColors[0] || 'var(--primary)';

    return [
      {
        id: 'colorize-semantic-accent',
        title: '01  REPLACE GENERIC GRADIENT WITH SEMANTIC ACCENT',
        transformation: 'colorize',
        description: 'Remove decorative rainbow/purple gradients and use clean semantic accents tied to brand tokens.',
        whyItFits: [
          'Generic gradient treatments dilute brand identity and create visual slop.',
          `Aligns with existing project palette (${brandColor}).`,
        ],
        evidence: problem.evidence.slice(0, 5),
        tradeoff: 'Less flamboyant decoration in favor of professional clarity.',
        affectedElements: problem.affectedElements,
        implementationApproach: `Replace multi-color gradient background with clean solid or subtle single-tint surface using ${brandColor}.`,
        confidence: 0.90,
        scope: 'component',
      },
      {
        id: 'colorize-purposeful-palette',
        title: '02  RESTRICT ACCENTS TO PRIMARY ACTIONS',
        transformation: 'colorize',
        description: 'Keep neutral surface backgrounds and reserve saturated accent color strictly for key action points.',
        whyItFits: [
          'When every card has saturated accent borders or gradients, attention is scattered.',
        ],
        evidence: problem.evidence.slice(0, 5),
        tradeoff: 'Containers appear quieter and more restrained.',
        affectedElements: problem.affectedElements,
        implementationApproach: 'Shift non-interactive container backgrounds to neutral slate/zinc tokens.',
        confidence: 0.88,
        scope: 'section',
      },
    ];
  }

  public validate(candidate: DesignRecommendationCandidate, context: DesignContext): ValidationResult {
    return { valid: true };
  }
}
