import { ProjectContext, CustomRuleDefinition } from '@craftlens/core';

export interface DetectedConventionsSummary {
  conventions: string[];
  rules: CustomRuleDefinition[];
}

export class ProjectRuleGenerator {
  public generateRulesForProject(context: ProjectContext): CustomRuleDefinition[] {
    return ProjectRuleGenerator.detectAndGenerateRules(context).rules;
  }

  /**
   * Inspects project context and returns high-confidence conventions and declarative custom rule definitions.
   */
  public static detectAndGenerateRules(context: ProjectContext): DetectedConventionsSummary {
    const conventions: string[] = [];
    const rules: CustomRuleDefinition[] = [];

    // 1. Spacing system
    if (context.baseline.spacing.length > 0) {
      conventions.push(`✓ ${context.baseline.spacing.slice(0, 4).join('/')}px spacing system`);
      rules.push({
        id: 'CONV-SPACING',
        name: 'Enforce Project Spacing Scale',
        category: 'css',
        description: `Use only approved project spacing tokens (${context.baseline.spacing.join(', ')}px).`,
        rationale: 'Arbitrary spacing introduces visual inconsistency across views.',
        severity: 'suggestion',
        minimumAuditLevel: 'moderate',
        detection: {
          type: 'regex',
          pattern: '\\b(p|m|gap|px|py|mx|my)-\\[(\\d+)px\\]',
        },
        recommendation: {
          summary: `Snap spacing to nearest scale token (${context.baseline.spacing.join(', ')}px).`,
          rationale: 'Predictable spacing scale ensures rhythmic layout consistency.',
        },
        fix: {
          type: 'assisted',
          description: 'Snap to nearest approved spacing token',
        },
      });
    }

    // 2. Corner Radius
    if (context.baseline.radius.length > 0) {
      conventions.push(`✓ ${context.baseline.radius.join('/')}px radius scale`);
      rules.push({
        id: 'CONV-RADIUS',
        name: 'Enforce Project Radius Scale',
        category: 'css',
        description: `Use only approved project radius tokens (${context.baseline.radius.join(', ')}px).`,
        rationale: 'Uniform curvature across containers maintains tactile product consistency.',
        severity: 'suggestion',
        minimumAuditLevel: 'moderate',
        detection: {
          type: 'regex',
          pattern: '\\brounded(?:-[a-z]+)?-\\[(\\d+)px\\]',
        },
        recommendation: {
          summary: `Use standard radius (${context.baseline.radius.join(', ')}px).`,
          rationale: 'Mismatched corner radii create container visual dissonance.',
        },
        fix: {
          type: 'assisted',
          description: 'Snap to nearest approved radius token',
        },
      });
    }

    // 3. Components
    const buttonComp = context.designSystem?.components.find(c => c.category === 'button') ||
      (context.baseline.components.includes('Button') ? { name: 'Button' } : null);

    if (buttonComp) {
      conventions.push(`✓ ${buttonComp.name} component`);
      rules.push({
        id: 'CONV-REUSE-BUTTON',
        name: `Reuse Standard ${buttonComp.name} Component`,
        category: 'architecture',
        description: `Import and reuse the shared ${buttonComp.name} component instead of raw styled buttons.`,
        rationale: 'Centralized buttons maintain accessibility, keyboard states, and brand aesthetics.',
        severity: 'warning',
        minimumAuditLevel: 'moderate',
        detection: {
          type: 'regex',
          pattern: '<button\\s+[^>]*className=["\'][^"\']*(?:px-[1-9]|py-[1-9]|bg-blue|bg-primary)[^"\']*["\']',
        },
        recommendation: {
          summary: `Use <${buttonComp.name}> instead of ad-hoc styled <button>.`,
          rationale: 'Standard component ensures consistent hover, active, and accessible focus rings.',
        },
        fix: {
          type: 'assisted',
          description: `Replace <button> with <${buttonComp.name}>`,
        },
      });
    }

    // 4. Modal component
    const modalComp = context.designSystem?.components.find(c => c.category === 'modal') ||
      (context.baseline.components.includes('Modal') ? { name: 'Modal' } : null);

    if (modalComp) {
      conventions.push(`✓ ${modalComp.name} component`);
    }

    // 5. Brand colors
    if (context.baseline.colors && context.baseline.colors.length > 0) {
      conventions.push(`✓ ${context.baseline.colors.length} brand colors`);
    }

    // 6. Typography
    if (context.baseline.typography?.primaryFont) {
      conventions.push(`✓ ${context.baseline.typography.primaryFont} typography`);
    }

    // 7. Icons
    if (context.designSystem?.icons && context.designSystem.icons.length > 0) {
      conventions.push(`✓ ${context.designSystem.icons[0]} icons`);
    }

    // 8. Approved shadow scale
    if (context.designSystem?.shadows && context.designSystem.shadows.length > 0) {
      conventions.push(`✓ Approved shadow scale (${context.designSystem.shadows.join(', ')})`);
    }

    return {
      conventions,
      rules,
    };
  }

  /**
   * Formats generated rules as declarative YAML.
   */
  public static formatRulesYaml(rules: CustomRuleDefinition[]): string {
    const yamlSections = rules.map(rule => {
      return [
        `id: ${rule.id}`,
        `name: "${rule.name}"`,
        `category: ${rule.category}`,
        `description: "${rule.description}"`,
        `rationale: "${rule.rationale}"`,
        `severity: ${rule.severity}`,
        `minimumAuditLevel: ${rule.minimumAuditLevel || 'moderate'}`,
        `detection:`,
        `  type: ${rule.detection.type}`,
        rule.detection.pattern ? `  pattern: '${rule.detection.pattern}'` : '',
        rule.recommendation ? `recommendation:` : '',
        rule.recommendation ? `  summary: "${rule.recommendation.summary}"` : '',
        rule.recommendation?.rationale ? `  rationale: "${rule.recommendation.rationale}"` : '',
        rule.fix ? `fix:` : '',
        rule.fix ? `  type: ${rule.fix.type}` : '',
        rule.fix?.description ? `  description: "${rule.fix.description}"` : '',
      ]
        .filter(Boolean)
        .join('\n');
    });

    return `# CraftLens Automatically Generated Project Conventions\n# Generated by CraftLens: Generate Project Rules\n\n` +
      yamlSections.join('\n---\n\n');
  }
}
