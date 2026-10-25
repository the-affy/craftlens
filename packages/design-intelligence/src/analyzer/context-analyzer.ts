import { Finding, createLocation, astEvidence, DesignIntent } from '@craftlens/core';
import { ParsedUIDocument } from '@craftlens/parser';
import { inferDesignIntent } from '../intent/intent-detector.js';

export interface ContextAnalysisResult {
  intent: DesignIntent;
  convergenceFindings: Finding[];
}

export class ContextAnalyzer {
  private static screenRecipes = new Map<string, { gradient: boolean; glow: boolean; roundedCard: boolean; file: string }>();

  public static clearConvergenceCache(): void {
    ContextAnalyzer.screenRecipes.clear();
  }

  public static analyze(doc: ParsedUIDocument): ContextAnalysisResult {
    const intent = inferDesignIntent({ filePath: doc.filePath, sourceCode: doc.rawSource });
    const convergenceFindings: Finding[] = [];

    // Extract recipe of this file
    const rawLower = doc.rawSource.toLowerCase();
    const hasGradient = rawLower.includes('gradient');
    const hasGlow = rawLower.includes('blur-') || rawLower.includes('glow');
    const hasRoundedCard = rawLower.includes('rounded-') && (rawLower.includes('card') || rawLower.includes('border'));

    ContextAnalyzer.screenRecipes.set(doc.filePath, {
      gradient: hasGradient,
      glow: hasGlow,
      roundedCard: hasRoundedCard,
      file: doc.filePath,
    });

    // If 3 or more distinct screens have identical (gradient + glow + roundedCard)
    const matchingScreens: string[] = [];
    for (const [f, recipe] of ContextAnalyzer.screenRecipes.entries()) {
      if (recipe.gradient && recipe.glow && recipe.roundedCard) {
        matchingScreens.push(f);
      }
    }

    if (matchingScreens.length >= 3 && matchingScreens.includes(doc.filePath)) {
      const topLoc = doc.roots[0]?.range || createLocation(doc.filePath, 1, 1, 0, 1, 20, 0);
      convergenceFindings.push({
        ruleId: 'UI-020',
        problemTitle: 'Design convergence detected',
        message: 'The exact same decorative visual treatment appears across unrelated screens.',
        whatIsWrong: `The same decorative recipe (gradient + ambient glow + rounded cards) is copy-pasted across ${matchingScreens.length} different screens.`,
        whyItMatters: 'Applying the identical decorative treatment to every view makes the interface feel template-driven rather than intentionally composed for each task.',
        howToFix: 'Differentiate screens by their primary functional purpose. Reserve glowing gradients for unique focal moments and keep utility/settings views clean and calm.',
        severity: 'warning',
        confidence: 0.88,
        location: topLoc,
        findingType: 'problem',
        category: 'design',
        clusterId: 'design-convergence',
        evidence: [
          astEvidence(`Identical visual treatment shared across: ${matchingScreens.map(s => s.split('/').pop()).join(', ')}`, topLoc),
        ],
        supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
      });
    }

    return {
      intent,
      convergenceFindings,
    };
  }
}
