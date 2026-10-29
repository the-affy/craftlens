import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ProjectContextService,
  recommendSkillsForProject,
  SkillPriority,
  createDefaultProjectContext,
  Finding,
} from '@craftlens/core';

describe('CraftLens V2 Project Context Service & Project-Aware Skill Recommendations', () => {
  const tempDir = path.join(process.cwd(), 'dist', 'test-context-' + Math.random().toString(36).substring(7));

  beforeEach(() => {
    fs.mkdirSync(path.join(tempDir, 'src', 'components', 'ui'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.craftlens', 'skills'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.craftlens', 'rules'), { recursive: true });

    // Mock package.json
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'my-next-app',
          dependencies: {
            next: '^14.2.0',
            react: '^18.2.0',
            tailwindcss: '^3.4.1',
          },
          devDependencies: {
            typescript: '^5.4.0',
            '@playwright/test': '^1.42.0',
          },
          packageManager: 'pnpm@9.0.0',
        },
        null,
        2
      )
    );

    // Mock pnpm-lock.yaml
    fs.writeFileSync(path.join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0');

    // Mock Button component in ui dir
    fs.writeFileSync(
      path.join(tempDir, 'src', 'components', 'ui', 'Button.tsx'),
      'export const Button = () => <button>Click</button>;'
    );
  });

  it('deterministically detects project context without AI analysis', () => {
    const service = new ProjectContextService(tempDir);
    const summary = service.getSummary();

    expect(summary.framework).toBe('Next.js');
    expect(summary.language).toBe('TypeScript');
    expect(summary.ui).toBe('React + Tailwind');
    expect(summary.testing).toBe('Playwright');
    expect(summary.designSystem).toBe('src/components/ui/');
    expect(summary.packageManager).toBe('pnpm');

    const formatted = summary.formattedText;
    expect(formatted).toContain('Framework: Next.js');
    expect(formatted).toContain('UI: React + Tailwind');
    expect(formatted).toContain('Package Manager: pnpm');
  });

  it('caches context and invalidates when configuration changes', () => {
    const service = new ProjectContextService(tempDir);
    const s1 = service.getSummary();
    expect(s1.framework).toBe('Next.js');

    // Invalidate
    service.invalidateCache();
    const s2 = service.getSummary();
    expect(s2.framework).toBe('Next.js');
  });

  it('recommends skills explaining WHY they are relevant based on detected issues', () => {
    const service = new ProjectContextService(tempDir);
    const context = service.getContext();

    const issues: Finding[] = [
      {
        ruleId: 'CX-004',
        title: 'Color Token Drift',
        message: 'Raw hex color used',
        category: 'ui',
        severity: 'warning',
        location: { filePath: `${tempDir}/src/A.tsx`, start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
      },
      {
        ruleId: 'UI-001',
        title: 'Button Styling Inconsistency',
        message: 'Button padding mismatch',
        category: 'ui',
        severity: 'warning',
        location: { filePath: `${tempDir}/src/B.tsx`, start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
      },
      {
        ruleId: 'SEC-001',
        title: 'Client Token Exposure',
        message: 'Exposed secret',
        category: 'security',
        severity: 'error',
        location: { filePath: `${tempDir}/src/C.tsx`, start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
      },
    ];

    const recs = recommendSkillsForProject(context, issues);
    expect(recs.length).toBeGreaterThan(0);

    const dsRec = recs.find(r => r.id === 'design-systems');
    expect(dsRec).toBeDefined();
    // Explains why it is relevant with findings count
    expect(dsRec?.reason).toContain('finding');
    expect(dsRec?.reason).toContain('inconsistent button, spacing, typography, and color implementations');

    const secRec = recs.find(r => r.id === 'security-review');
    expect(secRec).toBeDefined();
    expect(secRec?.reason).toContain('1 finding indicates sensitive data exposure');
  });

  it('enforces skill priority order: user rules > design system > skills > builtin > generic', () => {
    expect(SkillPriority.ExplicitUserProjectRules).toBeLessThan(SkillPriority.ProjectDesignSystem);
    expect(SkillPriority.ProjectDesignSystem).toBeLessThan(SkillPriority.UserSelectedSkills);
    expect(SkillPriority.UserSelectedSkills).toBeLessThan(SkillPriority.BuiltinCraftLensRules);
    expect(SkillPriority.BuiltinCraftLensRules).toBeLessThan(SkillPriority.GenericDesignIntelligence);
  });
});
