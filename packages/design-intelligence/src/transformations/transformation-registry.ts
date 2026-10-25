import { TransformationDefinition } from './types.js';
import { HierarchizeTransformation } from './hierarchize.js';
import { DistillTransformation } from './distill.js';
import { DifferentiateTransformation } from './differentiate.js';
import { ReshapeTransformation } from './reshape.js';
import { ColorizeTransformation } from './colorize.js';
import { TypesetTransformation } from './typeset.js';
import { QuieterTransformation } from './quieter.js';
import { ResponsiveTransformation } from './responsive.js';
import { InteractionTransformation } from './interaction.js';
import { HardenTransformation } from './harden.js';
import { PolishTransformation } from './polish.js';
import { ProblemCategory } from '../problem-model/problem-model.js';

export class TransformationRegistry {
  private static transformations: TransformationDefinition[] = [
    new HierarchizeTransformation(),
    new DistillTransformation(),
    new DifferentiateTransformation(),
    new ReshapeTransformation(),
    new ColorizeTransformation(),
    new TypesetTransformation(),
    new QuieterTransformation(),
    new ResponsiveTransformation(),
    new InteractionTransformation(),
    new HardenTransformation(),
    new PolishTransformation(),
  ];

  public static getAll(): TransformationDefinition[] {
    return [...this.transformations];
  }

  public static getForCategory(category: ProblemCategory): TransformationDefinition[] {
    return this.transformations.filter(t => t.applicableCategories.includes(category));
  }

  public static getById(id: string): TransformationDefinition | undefined {
    return this.transformations.find(t => t.id === id);
  }
}
