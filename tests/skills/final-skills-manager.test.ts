import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  SkillManager,
  SkillDiscoveryService,
  ECOSYSTEM_SKILLS,
  INTENT_SYNONYMS,
  Skill,
  SkillStatus,
  Finding,
  ProjectContext,
} from '../../packages/core/src/index.js';
import { ConflictResolver } from '../../packages/rule-engine/src/engine/conflict-resolver.js';

describe('CraftLens Final Skills Manager & Micro-UX Polish', () => {
  let tmpDir: string;
  let userFileDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'craftlens-skills-test-'));
    userFileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'user-original-skills-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(userFileDir, { recursive: true, force: true });
  });

  // ─────────────────────────────────────────────────────────────
  // 1 & 11: USER-UPLOADED SKILLS MUST BE VISIBLE & DEFAULT INACTIVE
  // ─────────────────────────────────────────────────────────────
  it('displays actual names for imported markdown skills and defaults to inactive', async () => {
    const manager = new SkillManager(tmpDir);

    const originalSkillFile = path.join(userFileDir, 'frontend-design.md');
    fs.writeFileSync(
      originalSkillFile,
      `---
name: frontend-design
description: Senior frontend design critique and layout composition
version: 2.1.0
---

# Guidance
- Use intentional whitespace and consistent typographic hierarchy.
`
    );

    const pkg = await manager.installSkill({
      type: 'file',
      path: originalSkillFile,
    });

    expect(pkg.manifest.name).toBe('frontend-design');
    expect(pkg.manifest.displayName).toBe('frontend-design');
    // Critical Section 11: imported skills default to inactive unless explicitly activated
    expect(pkg.enabled).toBe(false);

    const allSkills = manager.getAllSkillsAsSkills();
    const importedSkill = allSkills.find(s => s.id === 'frontend-design');
    expect(importedSkill).toBeDefined();
    expect(importedSkill?.name).toBe('frontend-design');
    expect(importedSkill?.description).toContain('Senior frontend design critique');
    expect(importedSkill?.version).toBe('2.1.0');
    expect(importedSkill?.source).toBe('user-uploaded');
    expect(importedSkill?.active).toBe(false);
    expect(importedSkill?.installed).toBe(true);
    expect(importedSkill?.status).toBe('inactive');
  });

  // ─────────────────────────────────────────────────────────────
  // 2: CHECKBOX CONTROL (Installed ≠ Active)
  // ─────────────────────────────────────────────────────────────
  it('toggles active state independently of installed state', async () => {
    const manager = new SkillManager(tmpDir);

    const originalFile = path.join(userFileDir, 'web-quality-audit.md');
    fs.writeFileSync(
      originalFile,
      `---
name: web-quality-audit
description: Audits semantic HTML and accessibility
version: 1.0.0
---
`
    );

    await manager.installSkill({
      type: 'file',
      path: originalFile,
    });

    // Initially installed but inactive
    let skill = manager.getSkill('web-quality-audit');
    expect(skill?.installed).toBe(true);
    expect(skill?.active).toBe(false);

    // User checks the checkbox -> Activate
    manager.setSkillActive('web-quality-audit', true);
    skill = manager.getSkill('web-quality-audit');
    expect(skill?.installed).toBe(true);
    expect(skill?.active).toBe(true);
    expect(skill?.status).toBe('active');

    // User unchecks the checkbox -> Deactivate
    manager.setSkillActive('web-quality-audit', false);
    skill = manager.getSkill('web-quality-audit');
    expect(skill?.installed).toBe(true);
    expect(skill?.active).toBe(false);
    expect(skill?.status).toBe('inactive');
  });

  // ─────────────────────────────────────────────────────────────
  // 3 & 4: STATE PERSISTENCE IN .craftlens/skills.json
  // ─────────────────────────────────────────────────────────────
  it('persists active/inactive state across restarts in .craftlens/skills.json', async () => {
    const manager1 = new SkillManager(tmpDir);

    const originalFile = path.join(userFileDir, 'accessibility-review.md');
    fs.writeFileSync(
      originalFile,
      `---
name: accessibility-review
description: ARIA roles and contrast compliance
version: 1.4.0
---
`
    );

    await manager1.installSkill({
      type: 'file',
      path: originalFile,
    });

    // Activate the skill
    manager1.setSkillActive('accessibility-review', true);

    // Verify .craftlens/skills.json was written
    const configPath = path.join(tmpDir, '.craftlens', 'skills.json');
    expect(fs.existsSync(configPath)).toBe(true);
    const parsedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    expect(parsedConfig.skills['accessibility-review'].active).toBe(true);

    // Create a new SkillManager simulating extension restart
    const manager2 = new SkillManager(tmpDir);
    manager2.loadProjectSkills();

    const restoredSkill = manager2.getSkill('accessibility-review');
    expect(restoredSkill).toBeDefined();
    expect(restoredSkill?.installed).toBe(true);
    expect(restoredSkill?.active).toBe(true);
    expect(restoredSkill?.status).toBe('active');
  });

  // ─────────────────────────────────────────────────────────────
  // 10: USER SKILL DELETE BUTTON (Preserves Original User File)
  // ─────────────────────────────────────────────────────────────
  it('deletes installed skill without deleting the original uploaded user file', async () => {
    const manager = new SkillManager(tmpDir);

    const originalFile = path.join(userFileDir, 'my-custom-audit.md');
    fs.writeFileSync(
      originalFile,
      `---
name: my-custom-audit
description: Custom internal audit guidelines
---
`
    );

    await manager.installSkill({
      type: 'file',
      path: originalFile,
    });

    // Verify installed copy exists in .craftlens/skills/
    const installedCopy = path.join(tmpDir, '.craftlens', 'skills', 'my-custom-audit.md');
    expect(fs.existsSync(installedCopy)).toBe(true);
    expect(fs.existsSync(originalFile)).toBe(true);

    // Execute deletion
    const deleted = await manager.deleteSkill('my-custom-audit');
    expect(deleted).toBe(true);

    // Installed copy is removed from .craftlens/skills/ and manager
    expect(fs.existsSync(installedCopy)).toBe(false);
    expect(manager.getSkill('my-custom-audit')).toBeUndefined();

    // Critical Requirement 10: User original file MUST NOT be deleted
    expect(fs.existsSync(originalFile)).toBe(true);
    expect(fs.readFileSync(originalFile, 'utf8')).toContain('my-custom-audit');
  });

  // ─────────────────────────────────────────────────────────────
  // 12: SKILL VERSIONING (No Invented Versions)
  // ─────────────────────────────────────────────────────────────
  it('displays actual version or "Version unknown" without inventing versions', async () => {
    const manager = new SkillManager(tmpDir);

    const unversionedFile = path.join(userFileDir, 'unversioned-skill.md');
    fs.writeFileSync(
      unversionedFile,
      `---
name: unversioned-skill
description: A skill without version metadata
---
`
    );

    await manager.installSkill({
      type: 'file',
      path: unversionedFile,
    });

    const skill = manager.getSkill('unversioned-skill');
    expect(skill?.version).toBeUndefined();
    // In UI representation, undefined version is formatted as 'Version unknown'
  });

  // ─────────────────────────────────────────────────────────────
  // 13 & 14: DYNAMIC CONTEXTUAL RECOMMENDATIONS (Exactly 3 initially)
  // ─────────────────────────────────────────────────────────────
  it('returns exactly 3 contextual recommendations based on actual findings', () => {
    const discovery = new SkillDiscoveryService();

    // 1. Repeated Card finding (CP-007)
    const cardFinding: Finding = {
      ruleId: 'CP-007',
      category: 'ui',
      message: 'Repeated identical card treatments with container monotony',
      title: 'Monotonous Card Layout',
      severity: 'error',
    };

    const cardRecs = discovery.getRecommendedSkills({
      findings: [cardFinding],
      limit: 3,
    });

    expect(cardRecs.length).toBe(3);
    const cardRecIds = cardRecs.map(s => s.id);
    expect(cardRecIds).toContain('frontend-design');

    // 2. Security finding (SEC-001)
    const secFinding: Finding = {
      ruleId: 'SEC-001',
      category: 'security',
      message: 'Hardcoded secret token in frontend bundle',
      title: 'Credential Leak',
      severity: 'blocker',
    };

    const secRecs = discovery.getRecommendedSkills({
      findings: [secFinding],
      limit: 3,
    });

    expect(secRecs.length).toBe(3);
    const secRecIds = secRecs.map(s => s.id);
    expect(secRecIds).toContain('security-review');
    // Proves recommendations are contextual, not identical!
    expect(secRecIds[0]).not.toBe(cardRecIds[0]);

    // 3. Show More expands up to 8
    const expandedRecs = discovery.getRecommendedSkills({
      findings: [cardFinding],
      limit: 8,
    });
    expect(expandedRecs.length).toBeGreaterThan(3);
    expect(expandedRecs.length).toBeLessThanOrEqual(8);
  });

  // ─────────────────────────────────────────────────────────────
  // 15, 18, 19: SKILL DISCOVERY INTENT SEARCH & RANKING
  // ─────────────────────────────────────────────────────────────
  it('understands search intent for "cards", "react", and "accessibility"', async () => {
    const discovery = new SkillDiscoveryService();

    // Searching "cards" returns frontend design and design guidelines
    const cardsResult = await discovery.searchSkills('cards');
    expect(cardsResult.skills.length).toBeGreaterThan(0);
    const cardsIds = cardsResult.skills.map(s => s.id);
    expect(cardsIds).toContain('frontend-design');

    // Searching "react" returns React best practices
    const reactResult = await discovery.searchSkills('react');
    expect(reactResult.skills.length).toBeGreaterThan(0);
    const reactIds = reactResult.skills.map(s => s.id);
    expect(reactIds).toContain('vercel-react-best-practices');

    // Searching "accessibility" returns accessibility review
    const a11yResult = await discovery.searchSkills('accessibility');
    expect(a11yResult.skills.length).toBeGreaterThan(0);
    const a11yIds = a11yResult.skills.map(s => s.id);
    expect(a11yIds).toContain('accessibility-review');
  });

  it('ranks skills using combined signals rather than purely install count', async () => {
    const discovery = new SkillDiscoveryService();
    const result = await discovery.searchSkills('design');

    // All results should have computed scores and reasonable ordering
    expect(result.skills.length).toBeGreaterThan(0);
    expect(result.skills[0].id).toBe('frontend-design');
    expect(result.skills[0].compatibility).toBe('compatible');
  });

  // ─────────────────────────────────────────────────────────────
  // 7, 8, 20: SAFE INSTALLATION WITHOUT ARBITRARY SCRIPT EXECUTION
  // ─────────────────────────────────────────────────────────────
  it('safely installs skill declarative assets without executing scripts', async () => {
    const discovery = new SkillDiscoveryService();
    const candidateSkill = ECOSYSTEM_SKILLS.find(s => s.id === 'frontend-design')!;

    const result = await discovery.installSkill(candidateSkill, {
      workspaceRoot: tmpDir,
      activateImmediately: false,
    });

    expect(result.success).toBe(true);
    expect(result.steps).toContain('✓ Repository fetched');
    expect(result.steps).toContain('✓ SKILL.md found');
    expect(result.steps).toContain('✓ Skill validated');
    expect(result.steps).toContain('✓ Installed');
    expect(result.pkg).toBeDefined();
    expect(result.pkg?.enabled).toBe(false); // Did not automatically activate
  });

  it('installs AND activates when activateImmediately is true', async () => {
    const discovery = new SkillDiscoveryService();
    const candidateSkill = ECOSYSTEM_SKILLS.find(s => s.id === 'frontend-design')!;

    const result = await discovery.installSkill(candidateSkill, {
      workspaceRoot: tmpDir,
      activateImmediately: true,
    });

    expect(result.success).toBe(true);
    expect(result.steps).toContain('✓ Activated');
    expect(result.pkg?.enabled).toBe(true);
    expect(result.skill.active).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────
  // 26 & 27: CONFLICT RESOLUTION HIERARCHY
  // ─────────────────────────────────────────────────────────────
  it('resolves conflicting active skill guidance according to project context', () => {
    const resolver = new ConflictResolver();

    const skillA: any = {
      manifest: { name: 'Compact Dashboard', displayName: 'Compact Dashboard' },
      enabled: true,
      guidance: [
        {
          id: 'G1',
          title: 'Density Strategy',
          content: 'Increase density and compact layout spacing.',
        },
      ],
    };

    const skillB: any = {
      manifest: { name: 'CraftLens Product UI', displayName: 'CraftLens Product UI' },
      enabled: true,
      guidance: [
        {
          id: 'G2',
          title: 'Whitespace Strategy',
          content: 'Provide generous whitespace and room to breathe.',
        },
      ],
    };

    // Case 1: Marketing project prefers generous whitespace / existing system
    const marketingCtx = {
      productMeta: { productType: 'marketing' },
    };
    const conflict1 = resolver.detectSkillConflicts([skillA, skillB], marketingCtx);
    expect(conflict1.detected).toBe(true);
    expect(conflict1.message).toContain('CraftLens Product UI → preserve existing system');

    // Case 2: Interactive application prefers density
    const appCtx = {
      productMeta: { productType: 'application' },
    };
    const conflict2 = resolver.detectSkillConflicts([skillA, skillB], appCtx);
    expect(conflict2.detected).toBe(true);
    expect(conflict2.message).toContain('Compact Dashboard → increase density');
  });

  // ─────────────────────────────────────────────────────────────
  // 28: RELATED SKILLS FOR A SPECIFIC FINDING
  // ─────────────────────────────────────────────────────────────
  it('recommends related skills tailored to a specific finding', () => {
    const discovery = new SkillDiscoveryService();

    const finding: Finding = {
      ruleId: 'AX-016',
      title: 'Missing accessible name on icon button',
      message: 'Button contains SVG icon but lacks aria-label',
      category: 'accessibility',
      severity: 'error',
    };

    const related = discovery.getRelatedSkillsForFinding(finding);
    expect(related.length).toBe(3);
    const relatedIds = related.map(s => s.id);
    expect(relatedIds).toContain('accessibility-review');
  });
});
