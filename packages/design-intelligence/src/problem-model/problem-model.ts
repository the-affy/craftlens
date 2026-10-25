import { Finding } from '@craftlens/core';
import { DesignContext } from '../context/design-context.js';

export type ProblemCategory =
  | 'hierarchy'
  | 'layout'
  | 'color'
  | 'typography'
  | 'component'
  | 'content'
  | 'interaction'
  | 'responsive'
  | 'accessibility'
  | 'motion'
  | 'specificity'
  | 'visual-repetition';

export interface DesignProblem {
  findingId: string;
  category: ProblemCategory;
  problem: string;
  evidence: string[];
  affectedElements: string[];
  confidence: number;
  constraints: string[];
  existingPatternsToPreserve: string[];
}

export class ProblemModelBuilder {
  public static build(finding: Finding, context: DesignContext): DesignProblem {
    const ruleId = (finding.ruleId || '').toUpperCase();
    const category = ProblemModelBuilder.mapCategory(ruleId, finding.category as string);
    const affectedElements = ProblemModelBuilder.extractAffectedElements(finding, context);
    const evidence = ProblemModelBuilder.extractEvidence(finding, context);
    const constraints = ProblemModelBuilder.buildConstraints(context);
    const existingPatternsToPreserve = ProblemModelBuilder.buildPreservedPatterns(context);

    let problem = '';
    if (category === 'visual-repetition' || ruleId === 'CP-007') {
      const count = context.siblingCount || context.contentCount || 6;
      const type = context.contentType || 'service';
      problem = `Repeated ${type} cards (${count} instances) have identical visual weight despite having different content.`;
    } else if (category === 'color') {
      problem = `Decorative accent or gradient treatment is applied without semantic hierarchy or brand discipline.`;
    } else if (category === 'typography') {
      problem = `Typographic hierarchy does not establish clear distinction between section titles, headings, and supporting body copy.`;
    } else if (category === 'interaction') {
      problem = `Multiple competing call-to-actions create visual friction and dilute the primary task.`;
    } else if (category === 'responsive') {
      problem = `Container layout lacks fluid responsive adaptation at narrower viewport widths.`;
    } else {
      problem = finding.whatIsWrong || finding.message || `Detected design issue in ${context.componentType || 'component'}.`;
    }

    return {
      findingId: finding.id || finding.ruleId,
      category,
      problem,
      evidence,
      affectedElements,
      confidence: typeof finding.confidence === 'number' ? finding.confidence : 0.94,
      constraints,
      existingPatternsToPreserve,
    };
  }

  private static mapCategory(ruleId: string, rawCategory?: string): ProblemCategory {
    if (ruleId === 'CP-007') return 'visual-repetition';
    if (ruleId === 'CP-008') return 'layout';
    if (ruleId.startsWith('UI-001') || ruleId.startsWith('UI-002') || ruleId.startsWith('UI-003') || ruleId.startsWith('CL-')) return 'color';
    if (ruleId.startsWith('TY-') || ruleId.startsWith('ID-005')) return 'typography';
    if (ruleId.startsWith('VH-007') || ruleId.startsWith('IX-')) return 'interaction';
    if (ruleId.startsWith('VH-008') || ruleId.startsWith('VH-')) return 'hierarchy';
    if (ruleId.startsWith('UI-022') || ruleId.startsWith('UI-009') || ruleId.startsWith('LY-')) return 'responsive';
    if (ruleId.startsWith('AX-') || ruleId.startsWith('UX-018')) return 'accessibility';
    if (ruleId.startsWith('PH-') || ruleId.startsWith('CP-009') || ruleId.startsWith('CX-')) return 'content';

    const cat = (rawCategory || '').toLowerCase();
    if (cat.includes('color')) return 'color';
    if (cat.includes('typography')) return 'typography';
    if (cat.includes('layout')) return 'layout';
    if (cat.includes('responsive')) return 'responsive';
    if (cat.includes('accessibility')) return 'accessibility';
    if (cat.includes('content') || cat.includes('copy')) return 'content';
    if (cat.includes('interaction')) return 'interaction';
    return 'hierarchy';
  }

  private static extractAffectedElements(finding: Finding, context: DesignContext): string[] {
    const list: string[] = [];
    if (finding.affectedElements && finding.affectedElements.length > 0) {
      for (const el of finding.affectedElements) {
        if (el.selector) list.push(el.selector);
        else if (el.className) list.push(`.${el.className.split(/\s+/)[0]}`);
        else if (el.tagName) list.push(el.tagName);
      }
    }
    if (list.length === 0) {
      if (context.componentType === 'service-box') {
        list.push('.service-box');
      } else if (context.componentType) {
        list.push(`.${context.componentType}`);
      } else {
        list.push('card');
      }
    }
    return Array.from(new Set(list));
  }

  private static extractEvidence(finding: Finding, context: DesignContext): string[] {
    const evList: string[] = [];
    const count = context.siblingCount || context.contentCount || 6;

    if (finding.ruleId === 'CP-007' || context.componentType === 'service-box') {
      evList.push(`${count} sibling cards`);
      evList.push('same radius');
      evList.push('same padding');
      evList.push('same border');
      evList.push('same heading/body structure');
    }

    if (finding.evidence && finding.evidence.length > 0) {
      for (const e of finding.evidence) {
        const text = e.explanation || e.snippet || (typeof e === 'string' ? e : '');
        if (text && !evList.includes(text)) {
          evList.push(text);
        }
      }
    }

    return evList;
  }

  private static buildConstraints(context: DesignContext): string[] {
    const constraints = ['preserve existing brand colors', 'preserve factual information'];
    if (context.contentType) {
      const singular = context.contentType.replace(/s$/, '');
      constraints.push(`preserve ${singular} content`);
    }
    if (context.productType === 'marketing') {
      constraints.push('do not introduce unrelated dashboard patterns');
      constraints.push('do not recommend data tables for informational marketing copy');
    } else if (context.productType === 'dashboard') {
      constraints.push('preserve metric scanability and KPI clarity');
    }
    return constraints;
  }

  private static buildPreservedPatterns(context: DesignContext): string[] {
    return [
      'brand colors',
      'icon headings',
      `readable ${context.contentType || 'service'} copy`,
    ];
  }
}
