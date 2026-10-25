import { describe, it, expect, beforeEach } from 'vitest';
import {
  UserRuleManager,
  ContextAwareFixGenerator,
  recommendSkillsForProject,
  toSemanticSeverity,
  ensureFindingCanonical,
  createDefaultProjectContext,
  ProjectContext,
  Finding,
} from '../../packages/core/src/index.js';

describe('Dynamic Engine Enhancements (Sections 1-21)', () => {
  describe('1. UserRuleManager (Sections 6, 7, 8)', () => {
    let manager: UserRuleManager;

    beforeEach(() => {
      manager = new UserRuleManager();
    });

    it('parses markdown rules into structured UserRuleGroup and items', () => {
      const markdown = `
# UI Rules
## Avoid excessive rounded cards
Do not use large rounded cards everywhere.
Severity: warning

## Avoid gradient text
Avoid gradient text unless explicitly required.
Severity: moderate
      `;

      const { group, errors } = UserRuleManager.parseMarkdown(markdown, 'upload', 'UI Rules');
      expect(errors.length).toBe(0);
      expect(group.id).toBeDefined();
      expect(group.name).toBe('UI Rules');
      expect(group.rules.length).toBe(2);

      const r1 = group.rules[0];
      expect(r1.name).toBe('Avoid excessive rounded cards');
      expect(r1.description).toContain('Do not use large rounded cards');
      expect(r1.severity).toBe('warning');
      expect(r1.enabled).toBe(true);

      const r2 = group.rules[1];
      expect(r2.name).toBe('Avoid gradient text');
      expect(r2.severity).toBe('moderate');
    });

    it('validates URL import preview and handles invalid URLs', async () => {
      const invalidUrlResult = await UserRuleManager.fetchAndValidateUrl('not-a-valid-url');
      expect(invalidUrlResult.success).toBe(false);
      expect(invalidUrlResult.error).toContain('Invalid URL');

      const { group, errors } = UserRuleManager.parseMarkdown(`
# Security Guidelines
## Disallow plaintext tokens
Never commit plaintext API tokens.
Severity: error
      `, 'url', 'Security Guidelines', 'https://rules.internal/sec.md');

      expect(errors.length).toBe(0);
      expect(group.name).toBe('Security Guidelines');
      expect(group.rules.length).toBe(1);
      expect(group.rules[0].severity).toBe('error');
    });

    it('supports toggling, editing, and deleting user rules and groups', () => {
      const markdown = `
# Company Standards
## No any types
Avoid any in typescript.
Severity: error

## Use design tokens
Use tokens for colors.
Severity: warning
      `;

      const { group } = UserRuleManager.parseMarkdown(markdown, 'upload', 'Company Standards');
      const initialCount = manager.getActiveRules().length;

      manager.addGroup(group);
      expect(manager.getAllGroups().length).toBe(2); // seeded default + new group
      expect(manager.getActiveRules().length).toBe(initialCount + 2);

      // Disable rule
      const ruleId = group.rules[0].id;
      manager.toggleRuleEnabled(group.id, ruleId);
      expect(manager.getActiveRules().length).toBe(initialCount + 1);

      // Re-enable rule
      manager.toggleRuleEnabled(group.id, ruleId);
      expect(manager.getActiveRules().length).toBe(initialCount + 2);

      // Delete rule
      manager.deleteRule(group.id, ruleId);
      expect(manager.getActiveRules().length).toBe(initialCount + 1);

      // Delete group
      manager.deleteGroup(group.id);
      expect(manager.getActiveRules().length).toBe(initialCount);
    });
  });

  describe('2. ContextAwareFixGenerator (Sections 2, 3, 20)', () => {
    it('generates 3 dynamic suggestions for hardcoded colors matching project tokens', () => {
      const context: ProjectContext = {
        ...createDefaultProjectContext(),
        learnedConventions: {
          colorMap: {
            '#6b7280': '--color-text-muted',
            '#3b82f6': '--color-primary',
          },
          preferredComponents: {},
        },
      };

      const finding: Finding = {
        ruleId: 'UI-001',
        message: 'Hard-coded color detected: #6B7280',
        severity: 'warning',
        confidence: 0.9,
        location: {
          filePath: '/src/components/Button.tsx',
          start: { line: 42, column: 5, offset: 100 },
          end: { line: 42, column: 20, offset: 115 },
        },
        evidence: ['color: #6B7280;'],
      };

      const suggestions = ContextAwareFixGenerator.generateSuggestions(
        finding,
        context,
        '  color: #6B7280;'
      );

      expect(suggestions.length).toBe(3);
      expect(suggestions[0].title).toContain('--color-text-muted');
      expect(suggestions[0].safe).toBe(true);
      expect(suggestions[0].actionLabel).toBe('Apply');
      expect(suggestions[0].replacement).toContain('var(--color-text-muted)');

      expect(suggestions[1].title).toContain('theme');
      expect(suggestions[2].title).toContain('Keep value');
    });

    it('generates 3 suggestions for missing button accessible names', () => {
      const context = createDefaultProjectContext();
      const finding: Finding = {
        ruleId: 'AX-016',
        message: 'Button has no accessible name or aria-label',
        severity: 'error',
        confidence: 0.95,
        location: {
          filePath: '/src/components/IconButton.tsx',
          start: { line: 15, column: 3, offset: 50 },
          end: { line: 17, column: 12, offset: 80 },
        },
        evidence: ['<button><Icon /></button>'],
      };

      const suggestions = ContextAwareFixGenerator.generateSuggestions(
        finding,
        context,
        '<button><Icon /></button>'
      );

      expect(suggestions.length).toBe(3);
      expect(suggestions[0].title).toContain('aria-label');
      expect(suggestions[1].title).toContain('visible text');
      expect(suggestions[2].title).toContain('<Button> component');
    });

    it('generates 3 suggestions for repeated card styling', () => {
      const context = createDefaultProjectContext();
      const finding: Finding = {
        ruleId: 'CP-007',
        message: 'Repeated card styling detected across multiple surfaces',
        severity: 'moderate',
        confidence: 0.85,
        location: {
          filePath: '/src/components/Widget.tsx',
          start: { line: 20, column: 1, offset: 120 },
          end: { line: 30, column: 1, offset: 250 },
        },
        evidence: [],
      };

      const suggestions = ContextAwareFixGenerator.generateSuggestions(
        finding,
        context,
        '<div className="bg-white rounded-xl shadow-md p-4">Content</div>'
      );

      expect(suggestions.length).toBe(3);
      expect(suggestions[0].title).toContain('<Card> component');
      expect(suggestions[1].title).toContain('shared card style');
      expect(suggestions[2].title).toContain('Keep layout inline');
    });
  });

  describe('3. recommendSkillsForProject (Section 12)', () => {
    it('recommends UI/UX and Accessibility for React / Next.js projects', () => {
      const context: ProjectContext = {
        ...createDefaultProjectContext(),
        framework: 'Next.js',
        cssStrategy: 'Tailwind CSS',
      };

      const recs = recommendSkillsForProject(context);
      const recIds = recs.map(r => r.id);
      expect(recIds).toContain('ui-ux-quality');
      expect(recIds).toContain('accessibility');
    });

    it('recommends Security Review and API Design for backend projects', () => {
      const context: ProjectContext = {
        ...createDefaultProjectContext(),
        framework: 'Express',
        cssStrategy: 'None',
      };

      const recs = recommendSkillsForProject(context);
      const recIds = recs.map(r => r.id);
      expect(recIds).toContain('security-review');
      expect(recIds).toContain('api-design');
      expect(recIds).toContain('error-handling');
    });

    it('recommends Visual Consistency and Design Systems for design-heavy frontends', () => {
      const context: ProjectContext = {
        ...createDefaultProjectContext(),
        framework: 'React',
        cssStrategy: 'Vanilla CSS / CSS Modules',
      };

      const recs = recommendSkillsForProject(context);
      const recIds = recs.map(r => r.id);
      expect(recIds).toContain('visual-consistency');
      expect(recIds).toContain('design-systems');
    });
  });

  describe('4. Semantic Severity & Finding Canonicalization (Section 1 & 17)', () => {
    it('accurately maps canonical semantic severities', () => {
      expect(toSemanticSeverity('error')).toBe('error');
      expect(toSemanticSeverity('warning')).toBe('warning');
      expect(toSemanticSeverity('moderate')).toBe('moderate');
      expect(toSemanticSeverity('info')).toBe('info');

      // Legacy severities
      expect(toSemanticSeverity('blocker')).toBe('error');
      expect(toSemanticSeverity('critical')).toBe('error');
      expect(toSemanticSeverity('high')).toBe('error');
      expect(toSemanticSeverity('medium')).toBe('moderate');
      expect(toSemanticSeverity('low')).toBe('info');
      expect(toSemanticSeverity('suggestion')).toBe('info');
    });

    it('canonicalizes findings with Section 17 model fields', () => {
      const rawFinding: Finding = {
        ruleId: 'AP-014',
        message: 'Any escape hatch used',
        severity: 'warning',
        confidence: 0.9,
        location: {
          filePath: '/src/api.ts',
          start: { line: 10, column: 5, offset: 50 },
          end: { line: 10, column: 15, offset: 60 },
        },
        evidence: ['const x: any = 1;'],
      };

      const canonical = ensureFindingCanonical(rawFinding);
      expect(canonical.id).toBeDefined();
      expect(canonical.filePath).toBe('/src/api.ts');
      expect(canonical.startLine).toBe(10);
      expect(canonical.endLine).toBe(10);
      expect(canonical.semanticSeverity).toBe('warning');
      expect(canonical.source).toBeDefined();
      expect(Array.isArray(canonical.suggestions)).toBe(true);
    });
  });
});
