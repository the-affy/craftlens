import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  MarkdownSkillImporter,
  LocalDirectorySkillImporter,
  GitHubSkillImporter,
  computeSkillContentHash,
} from '@craftlens/core';

describe('Skill Importers & Declarative Rule Extraction', () => {
  describe('1. Markdown Skill Importer', () => {
    const mdImporter = new MarkdownSkillImporter();

    it('parses frontmatter and rule definitions correctly', () => {
      const markdown = `---
name: my-team-rules
displayName: My Team UI Rules
version: 1.2.0
description: Design and frontend conventions for our team
author: Team Acme
license: Proprietary
mode: augment
---

# Team Conventions

## [team.buttons.focus] Buttons Must Have Focus States
All button elements must have visible outline or focus-visible state.
Severity: Error
Category: Accessibility
Recommendation: Add focus-visible:ring-2 focus-visible:outline-none to buttons.

## [team.cards.avoid-soup] Cards Sectioning
Avoid using cards for every single content section.
Severity: Warning
Category: UI
Recommendation: Use section dividers and whitespace grouping instead.
`;

      const pkg = mdImporter.parseMarkdownContent(
        markdown,
        { type: 'file', path: '/workspace/rules.md' },
        'my-team-rules'
      );

      expect(pkg.manifest.name).toBe('my-team-rules');
      expect(pkg.manifest.displayName).toBe('My Team UI Rules');
      expect(pkg.manifest.version).toBe('1.2.0');
      expect(pkg.manifest.author).toBe('Team Acme');
      expect(pkg.rules.length).toBe(2);

      const buttonRule = pkg.rules.find(r => r.id === 'team.buttons.focus');
      expect(buttonRule).toBeDefined();
      expect(buttonRule?.severity).toBe('error');
      expect(buttonRule?.category).toBe('accessibility');
      expect(buttonRule?.sourceSkillId).toBe('my-team-rules');
      expect(buttonRule?.sourceSkillVersion).toBe('1.2.0');

      const cardRule = pkg.rules.find(r => r.id === 'team.cards.avoid-soup');
      expect(cardRule).toBeDefined();
      expect(cardRule?.severity).toBe('warning');
      expect(cardRule?.category).toBe('ui');
    });

    it('Requirement 38: Classifies exploratory statements as guidance rather than executable violations', () => {
      const markdown = `---
name: aesthetic-guidelines
version: 1.0.0
---

# Aesthetic Principles

## Generous Whitespace
Use generous whitespace throughout page layouts to let typography breathe.
Recommendation: Maintain at least 32px padding between distinct visual sections.

## Clear Visual Rhythm
Prefer clarity over density when laying out marketing sections.
Recommendation: Use simple 1-column reading measure for article content.

## Strict Color Restrictions
Never use pure saturated red (#ff0000) for standard card borders.
Severity: Error
Category: UI
Recommendation: Use muted semantic rose or neutral borders.
`;

      const pkg = mdImporter.parseMarkdownContent(
        markdown,
        { type: 'file', path: '/test/aesthetic.md' },
        'aesthetic-guidelines'
      );

      // "Generous Whitespace" & "Clear Visual Rhythm" should be guidance, NOT false-positive executable rules!
      expect(pkg.guidance.length).toBeGreaterThanOrEqual(2);
      expect(pkg.guidance.some(g => g.title.includes('Generous Whitespace'))).toBe(true);

      // Only the actionable "Never use pure saturated red" statement should become a Rule
      expect(pkg.rules.length).toBe(1);
      expect(pkg.rules[0].severity).toBe('error');
      expect(pkg.rules[0].category).toBe('ui');
    });

    it('computes content hashes deterministically', () => {
      const contentA = '# Rules\n## Buttons\nButtons must have type.';
      const contentB = '# Rules\n## Buttons\nButtons must have type.';
      const contentC = '# Rules\n## Buttons\nButtons must have aria-label.';

      const hashA = computeSkillContentHash({ rawContent: contentA });
      const hashB = computeSkillContentHash({ rawContent: contentB });
      const hashC = computeSkillContentHash({ rawContent: contentC });

      expect(hashA).toBe(hashB);
      expect(hashA).not.toBe(hashC);
    });
  });

  describe('2. Local Directory Skill Importer', () => {
    const dirImporter = new LocalDirectorySkillImporter();

    it('canImport returns false for non-directories', async () => {
      const can = await dirImporter.canImport({ type: 'file', path: '/nonexistent/file.md' });
      expect(can).toBe(false);
    });

    it('imports from local directory with SKILL.md and skill.json', async () => {
      // Test against .craftlens/skills in the workspace
      const skillPath = path.resolve(process.cwd(), '.craftlens', 'skills');
      if (fs.existsSync(skillPath)) {
        const can = await dirImporter.canImport({ type: 'directory', path: skillPath });
        expect(can).toBe(true);

        const pkg = await dirImporter.import({ type: 'directory', path: skillPath });
        expect(pkg.manifest.name).toBeDefined();
        expect(pkg.version.contentHash).toBeDefined();
      }
    });
  });

  describe('3. GitHub Skill Importer', () => {
    const githubImporter = new GitHubSkillImporter();

    it('parses GitHub URLs with repository, branch, and subpath', () => {
      const parsed1 = githubImporter.parseGitHubUrl('https://github.com/Vanszs/Anti-AI-UI');
      expect(parsed1.owner).toBe('Vanszs');
      expect(parsed1.repo).toBe('Anti-AI-UI');
      expect(parsed1.branch).toBe('main');

      const parsed2 = githubImporter.parseGitHubUrl(
        'https://github.com/owner/design-system/tree/v2.0/packages/rules'
      );
      expect(parsed2.owner).toBe('owner');
      expect(parsed2.repo).toBe('design-system');
      expect(parsed2.branch).toBe('v2.0');
      expect(parsed2.subpath).toBe('packages/rules');
    });

    it('imports declarative knowledge and tracks commit SHA', async () => {
      const pkg = await githubImporter.import({
        type: 'github',
        url: 'https://github.com/Vanszs/Anti-AI-UI',
      });

      expect(pkg.manifest.name).toBe('anti-ai-ui');
      expect(pkg.manifest.displayName).toBe('Anti-AI UI');
      expect(pkg.manifest.author).toBe('Vanszs');
      expect(pkg.rules.length).toBeGreaterThanOrEqual(2);
      expect(pkg.version.commit).toBeDefined();
      expect(pkg.trustStatus).toBe('external');
      expect(pkg.version.contentHash).toBeDefined();
    });
  });
});
