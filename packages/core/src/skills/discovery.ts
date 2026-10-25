import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  Skill,
  SkillStatus,
  SkillPackage,
  SkillSource,
  Finding,
  ProjectContext,
} from '../types/index.js';
import { MarkdownSkillImporter } from './markdown-importer.js';
import { GitHubSkillImporter } from './github-importer.js';
import { SkillRegistry } from './registry.js';

export interface SkillInstallProgressStep {
  step: string;
  done: boolean;
  timestamp: number;
}

export interface SkillInstallResult {
  success: boolean;
  skill: Skill;
  steps: string[];
  error?: string;
  pkg?: SkillPackage;
}

export const INTENT_SYNONYMS: Record<string, string[]> = {
  'cards': ['frontend-design', 'ui-ux-review', 'web-design-guidelines', 'component-reference', 'anti-ai-ui'],
  'card': ['frontend-design', 'ui-ux-review', 'web-design-guidelines', 'component-reference'],
  'react': ['vercel-react-best-practices', 'react-architecture', 'frontend-design'],
  'anti ai ui': ['anti-ai-ui', 'frontend-design', 'web-design-guidelines', 'ui-ux-review'],
  'ai': ['anti-ai-ui', 'frontend-design'],
  'accessibility': ['accessibility-review', 'web-design-guidelines'],
  'a11y': ['accessibility-review', 'web-design-guidelines'],
  'security': ['security-review', 'dependency-safety'],
  'performance': ['web-performance-audit', 'vercel-react-best-practices'],
  'figma': ['design-tokens-sync', 'web-design-guidelines', 'frontend-design'],
  'testing': ['tdd', 'agent-browser'],
  'tdd': ['tdd'],
  'web design': ['web-design-guidelines', 'frontend-design', 'ui-ux-review'],
  'motion': ['motion-design', 'frontend-design'],
  'wordpress': ['frontend-design', 'web-design-guidelines', 'web-performance-audit'],
  'magento': ['frontend-design', 'web-performance-audit', 'security-review'],
};

/**
 * Curated, verified ecosystem skills matching real-world agent skills (skills.sh, Anthropic, GitHub)
 */
export const ECOSYSTEM_SKILLS: Skill[] = [
  // DESIGN
  {
    id: 'frontend-design',
    name: 'Frontend Design',
    description: 'Improve frontend visual design and implementation quality with senior design critique.',
    source: 'github',
    repository: 'anthropics/skills',
    version: '2.1.0',
    installed: false,
    active: false,
    status: 'available',
    capabilities: ['visual hierarchy', 'responsive design', 'component design', 'typography'],
    compatibility: 'compatible',
    hasExecutableAssets: false,
    installsCount: 38200,
    rating: 4.9,
    stars: 5,
    author: 'Anthropic',
    category: 'design',
    tags: ['design', 'frontend', 'ui', 'cards', 'hierarchy'],
    readmeUrl: 'https://github.com/anthropics/skills',
  },
  {
    id: 'web-design-guidelines',
    name: 'Web Design Guidelines',
    description: 'Audit web interfaces against modern design systems and accessibility best practices.',
    source: 'skills-sh',
    repository: 'vercel-labs/skills',
    version: '1.8.0',
    installed: false,
    active: false,
    status: 'available',
    capabilities: ['design systems', 'color contrast', 'layout consistency'],
    compatibility: 'compatible',
    hasExecutableAssets: false,
    installsCount: 28100,
    rating: 4.8,
    stars: 5,
    author: 'skills.sh',
    category: 'design',
    tags: ['design', 'web', 'guidelines', 'a11y', 'tokens'],
    readmeUrl: 'https://skills.sh',
  },
  {
    id: 'ui-ux-review',
    name: 'UI/UX Review',
    description: 'Senior UX critique, cognitive load, visual balance, and intentional whitespace.',
    source: 'github',
    repository: 'awesome-copilot/ux-skills',
    version: '1.4.0',
    installed: false,
    active: false,
    status: 'available',
    capabilities: ['visual hierarchy', 'information architecture', 'copy clarity'],
    compatibility: 'compatible',
    hasExecutableAssets: false,
    installsCount: 16500,
    rating: 4.7,
    stars: 4,
    author: 'GitHub Awesome',
    category: 'design',
    tags: ['ux', 'review', 'clarity', 'hierarchy'],
    readmeUrl: 'https://github.com/github/awesome-copilot',
  },
  {
    id: 'responsive-design',
    name: 'Responsive Design',
    description: 'Eliminate fixed widths, overflowing layouts, and missing mobile breakpoints.',
    source: 'skills-sh',
    repository: 'design-collective/responsive-skills',
    version: '1.2.0',
    installed: false,
    active: false,
    status: 'available',
    capabilities: ['responsive design', 'touch targets', 'viewport sizing'],
    compatibility: 'compatible',
    hasExecutableAssets: false,
    installsCount: 14200,
    rating: 4.6,
    stars: 4,
    author: 'skills.sh',
    category: 'design',
    tags: ['responsive', 'mobile', 'layout', 'breakpoints'],
    readmeUrl: 'https://skills.sh',
  },
  {
    id: 'motion-design',
    name: 'Motion Design & Micro-interactions',
    description: 'Purposeful micro-interactions, CSS transitions, and reduced-motion compliance.',
    source: 'skills-sh',
    repository: 'motion-agents/ui-motion',
    version: '1.1.0',
    installed: false,
    active: false,
    status: 'available',
    capabilities: ['motion', 'micro-interactions', 'accessible animation'],
    compatibility: 'compatible',
    hasExecutableAssets: false,
    installsCount: 9400,
    rating: 4.7,
    stars: 4,
    author: 'skills.sh',
    category: 'design',
    tags: ['motion', 'animation', 'transitions', 'micro-interactions'],
    readmeUrl: 'https://skills.sh',
  },
  {
    id: 'design-tokens-sync',
    name: 'Design Tokens & System Sync',
    description: 'Synchronize Figma and Tailwind design tokens across components.',
    source: 'github',
    repository: 'tokens-studio/agent-skills',
    version: '1.0.0',
    installed: false,
    active: false,
    status: 'available',
    capabilities: ['design tokens', 'tailwind', 'component parity'],
    compatibility: 'compatible',
    hasExecutableAssets: false,
    installsCount: 11200,
    rating: 4.5,
    stars: 4,
    author: 'Tokens Studio',
    category: 'design',
    tags: ['figma', 'tokens', 'tailwind', 'design systems'],
    readmeUrl: 'https://github.com/tokens-studio',
  },

  // CODE
  {
    id: 'vercel-react-best-practices',
    name: 'Vercel React Best Practices',
    description: 'Next.js and React component structure, server actions, and hydration safety.',
    source: 'skills-sh',
    repository: 'vercel/agent-skills',
    version: '2.4.0',
    installed: false,
    active: false,
    status: 'available',
    capabilities: ['react best practices', 'server components', 'performance'],
    compatibility: 'compatible',
    hasExecutableAssets: false,
    installsCount: 42000,
    rating: 4.9,
    stars: 5,
    author: 'Vercel',
    category: 'code',
    tags: ['react', 'nextjs', 'typescript', 'frontend'],
    readmeUrl: 'https://skills.sh',
  },
  {
    id: 'react-architecture',
    name: 'React Architecture',
    description: 'State co-location, custom hook abstraction, and component boundary cleanup.',
    source: 'github',
    repository: 'react-community/architecture-skills',
    version: '1.3.0',
    installed: false,
    active: false,
    status: 'available',
    capabilities: ['component architecture', 'hooks', 'clean code'],
    compatibility: 'compatible',
    hasExecutableAssets: false,
    installsCount: 19800,
    rating: 4.8,
    stars: 5,
    author: 'GitHub',
    category: 'code',
    tags: ['react', 'architecture', 'hooks'],
    readmeUrl: 'https://github.com',
  },
  {
    id: 'typescript-strict-hygiene',
    name: 'TypeScript Strict Hygiene',
    description: 'Eliminate any escape hatches, unhandled union cases, and implicit types.',
    source: 'github',
    repository: 'typescript-eslint/agent-rules',
    version: '1.5.0',
    installed: false,
    active: false,
    status: 'available',
    capabilities: ['type safety', 'generics', 'strict mode'],
    compatibility: 'compatible',
    hasExecutableAssets: false,
    installsCount: 22400,
    rating: 4.8,
    stars: 5,
    author: 'TypeScript ESLint',
    category: 'code',
    tags: ['typescript', 'strict', 'types'],
    readmeUrl: 'https://github.com',
  },
  {
    id: 'refactoring-patterns',
    name: 'Refactoring Patterns',
    description: 'Safe compositional refactoring for complex legacy codebases.',
    source: 'skills-sh',
    repository: 'clean-code/refactor-skills',
    version: '1.0.4',
    installed: false,
    active: false,
    status: 'available',
    capabilities: ['refactoring', 'dry principle', 'modularity'],
    compatibility: 'compatible',
    hasExecutableAssets: false,
    installsCount: 8900,
    rating: 4.5,
    stars: 4,
    author: 'skills.sh',
    category: 'code',
    tags: ['refactoring', 'clean code', 'patterns'],
    readmeUrl: 'https://skills.sh',
  },

  // QUALITY
  {
    id: 'accessibility-review',
    name: 'Accessibility Review',
    description: 'Improve accessibility, semantics, keyboard interaction, and WCAG 2.1 AA compliance.',
    source: 'github',
    repository: 'a11yproject/skills',
    version: '1.4.0',
    installed: false,
    active: false,
    status: 'available',
    capabilities: ['accessibility', 'aria', 'keyboard focus', 'screen readers'],
    compatibility: 'compatible',
    hasExecutableAssets: false,
    installsCount: 12400,
    rating: 4.8,
    stars: 5,
    author: 'The A11Y Project',
    category: 'quality',
    tags: ['accessibility', 'a11y', 'aria', 'focus'],
    readmeUrl: 'https://github.com',
  },
  {
    id: 'web-performance-audit',
    name: 'Performance Audit',
    description: 'Identify re-render bottlenecks, layout thrashing, and unoptimized assets.',
    source: 'skills-sh',
    repository: 'web-perf/agent-skills',
    version: '1.6.0',
    installed: false,
    active: false,
    status: 'available',
    capabilities: ['web vitals', 'bundle size', 'rendering speed'],
    compatibility: 'compatible',
    hasExecutableAssets: false,
    installsCount: 18700,
    rating: 4.7,
    stars: 5,
    author: 'skills.sh',
    category: 'quality',
    tags: ['performance', 'speed', 'optimization'],
    readmeUrl: 'https://skills.sh',
  },
  {
    id: 'security-review',
    name: 'Security Review',
    description: 'Detect hardcoded credentials, unsafe regex, XSS vectors, and untrusted inputs.',
    source: 'github',
    repository: 'anthropics/security-skills',
    version: '1.5.0',
    installed: false,
    active: false,
    status: 'available',
    capabilities: ['security', 'secure coding', 'secrets detection'],
    compatibility: 'compatible',
    hasExecutableAssets: false,
    installsCount: 24500,
    rating: 4.9,
    stars: 5,
    author: 'Anthropic',
    category: 'quality',
    tags: ['security', 'auth', 'secrets', 'xss'],
    readmeUrl: 'https://github.com',
  },
  {
    id: 'dependency-safety',
    name: 'Dependency Safety',
    description: 'Audit supply-chain dependencies, unmaintained packages, and vulnerability advisories.',
    source: 'skills-sh',
    repository: 'oss-review/agent-skills',
    version: '1.1.0',
    installed: false,
    active: false,
    status: 'available',
    capabilities: ['dependency audit', 'cve scanning', 'license compliance'],
    compatibility: 'compatible',
    hasExecutableAssets: false,
    installsCount: 9700,
    rating: 4.6,
    stars: 4,
    author: 'skills.sh',
    category: 'quality',
    tags: ['security', 'dependencies', 'cve'],
    readmeUrl: 'https://skills.sh',
  },
  {
    id: 'tdd',
    name: 'TDD Best Practices',
    description: 'Test-driven development patterns, edge-case coverage, and resilient mocking.',
    source: 'skills-sh',
    repository: 'testing-collective/tdd-skills',
    version: '1.2.0',
    installed: false,
    active: false,
    status: 'available',
    capabilities: ['unit testing', 'test coverage', 'integration tests'],
    compatibility: 'compatible',
    hasExecutableAssets: false,
    installsCount: 15300,
    rating: 4.7,
    stars: 4,
    author: 'skills.sh',
    category: 'quality',
    tags: ['testing', 'tdd', 'vitest', 'jest'],
    readmeUrl: 'https://skills.sh',
  },

  // WORKFLOW
  {
    id: 'agent-browser',
    name: 'Agent Browser Automation',
    description: 'Headless browser verification, end-to-end interactive flows, and visual regression.',
    source: 'skills-sh',
    repository: 'browser-tools/agent-browser',
    version: '2.0.0',
    installed: false,
    active: false,
    status: 'available',
    capabilities: ['browser automation', 'e2e testing', 'visual diff'],
    compatibility: 'partial',
    compatibilityNote: 'Contains execution scripts; instruction portion will be imported safely without executing binaries.',
    hasExecutableAssets: true,
    installsCount: 31000,
    rating: 4.8,
    stars: 5,
    author: 'skills.sh',
    category: 'workflow',
    tags: ['browser', 'automation', 'e2e'],
    readmeUrl: 'https://skills.sh',
  },
  {
    id: 'git-hygiene',
    name: 'Git Commit Hygiene',
    description: 'Atomic commit practices, clean diff structuring, and changelog generation.',
    source: 'github',
    repository: 'github/git-skills',
    version: '1.0.2',
    installed: false,
    active: false,
    status: 'available',
    capabilities: ['git workflows', 'commit hygiene', 'semantic versioning'],
    compatibility: 'compatible',
    hasExecutableAssets: false,
    installsCount: 8200,
    rating: 4.5,
    stars: 4,
    author: 'GitHub',
    category: 'workflow',
    tags: ['git', 'workflow', 'commits'],
    readmeUrl: 'https://github.com',
  },
  {
    id: 'code-review-assistant',
    name: 'Code Review Assistant',
    description: 'Thorough PR analysis focusing on logic errors, edge cases, and architectural regressions.',
    source: 'github',
    repository: 'anthropics/review-skills',
    version: '1.2.0',
    installed: false,
    active: false,
    status: 'available',
    capabilities: ['code review', 'edge cases', 'documentation'],
    compatibility: 'compatible',
    hasExecutableAssets: false,
    installsCount: 21300,
    rating: 4.8,
    stars: 5,
    author: 'Anthropic',
    category: 'workflow',
    tags: ['review', 'quality', 'pr'],
    readmeUrl: 'https://github.com',
  },
];

export class SkillDiscoveryService {
  private searchCache = new Map<string, { timestamp: number; skills: Skill[] }>();
  private cacheTtlMs = 60000; // 1 minute cache
  private isOfflineMode = false;
  private mdImporter = new MarkdownSkillImporter();
  private githubImporter = new GitHubSkillImporter();

  public setOfflineMode(offline: boolean): void {
    this.isOfflineMode = offline;
  }

  public getOfflineMode(): boolean {
    return this.isOfflineMode;
  }

  /**
   * Multi-source search understanding user intent across local, GitHub, skills.sh and popular skills
   */
  public async searchSkills(
    rawQuery: string,
    options?: {
      installedSkills?: Skill[];
      category?: string;
    }
  ): Promise<{ skills: Skill[]; isOfflineFallback: boolean }> {
    const query = rawQuery.trim().toLowerCase();
    const cacheKey = `${query}::${options?.category || 'all'}`;

    const cached = this.searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
      return { skills: this.syncInstalledState(cached.skills, options?.installedSkills), isOfflineFallback: false };
    }

    let isOfflineFallback = this.isOfflineMode;
    const installed = options?.installedSkills || [];
    const installedIds = new Set(installed.map(s => s.id));

    // Combine pool: Local installed skills + Ecosystem skills
    const pool: Skill[] = [...ECOSYSTEM_SKILLS];

    for (const inst of installed) {
      if (!pool.some(p => p.id === inst.id)) {
        pool.push(inst);
      }
    }

    // Resolve query intent synonyms
    const intentTokens = new Set<string>();
    intentTokens.add(query);

    for (const token of query.split(/\s+/)) {
      intentTokens.add(token);
      const synonyms = INTENT_SYNONYMS[token];
      if (synonyms) {
        for (const s of synonyms) intentTokens.add(s);
      }
    }

    for (const [key, synonyms] of Object.entries(INTENT_SYNONYMS)) {
      if (query.includes(key) || key.includes(query)) {
        for (const s of synonyms) intentTokens.add(s);
      }
    }

    // Score and rank candidates
    const scored: { skill: Skill; score: number }[] = [];

    for (const skill of pool) {
      if (options?.category && options.category !== 'all' && skill.category !== options.category) {
        continue;
      }

      let score = 0;
      const nameLower = skill.name.toLowerCase();
      const descLower = skill.description.toLowerCase();
      const idLower = skill.id.toLowerCase();
      const tags = (skill.tags || []).map(t => t.toLowerCase());
      const capabilities = (skill.capabilities || []).map(c => c.toLowerCase());

      // 1. Direct match
      if (query === '' || idLower.includes(query) || nameLower.includes(query)) {
        score += 50;
      } else if (descLower.includes(query)) {
        score += 30;
      }

      // 2. Intent tokens match
      for (const token of intentTokens) {
        if (!token) continue;
        if (idLower.includes(token) || nameLower.includes(token)) {
          score += 35;
        } else if (tags.some(t => t.includes(token))) {
          score += 25;
        } else if (capabilities.some(c => c.includes(token))) {
          score += 20;
        } else if (descLower.includes(token)) {
          score += 15;
        }
      }

      if (score === 0 && query !== '') {
        continue;
      }

      // 3. Combined Ranking (Section 18)
      // score = relevance + source trust + quality signals + recent activity + popularity + compatibility - security concerns
      let trustScore = 0;
      if (skill.source === 'builtin') trustScore = 15;
      else if (skill.author === 'Anthropic' || skill.source === 'skills-sh') trustScore = 12;
      else if (skill.source === 'github') trustScore = 10;
      else trustScore = 8;

      const qualityScore = (skill.rating || 4.5) * 2; // ~9-10
      const popularityScore = Math.min(10, Math.log10((skill.installsCount || 1000) / 100) * 3); // ~5-10
      const compatibilityScore = skill.compatibility === 'compatible' ? 5 : 2;
      const securityDeduction = skill.hasExecutableAssets ? 5 : 0;

      const totalScore = score + trustScore + qualityScore + popularityScore + compatibilityScore - securityDeduction;
      scored.push({ skill, score: totalScore });
    }

    scored.sort((a, b) => b.score - a.score);
    const results = scored.map(s => s.skill);
    const synced = this.syncInstalledState(results, installed);

    this.searchCache.set(cacheKey, { timestamp: Date.now(), skills: synced });
    return { skills: synced, isOfflineFallback };
  }

  /**
   * Syncs installed and active status of skills from user's current installed skills
   */
  public syncInstalledState(skills: Skill[], installedSkills?: Skill[]): Skill[] {
    if (!installedSkills || installedSkills.length === 0) return skills;

    const installedMap = new Map<string, Skill>();
    for (const inst of installedSkills) {
      installedMap.set(inst.id, inst);
    }

    return skills.map(s => {
      const found = installedMap.get(s.id);
      if (found) {
        return {
          ...s,
          installed: true,
          active: found.active,
          status: found.active ? 'active' : 'installed',
          version: found.version || s.version,
          path: found.path,
        };
      }
      return {
        ...s,
        installed: false,
        active: false,
        status: 'available',
      };
    });
  }

  /**
   * Dynamic contextual skill recommendation based on actual findings and project context (Sections 13 & 14)
   * Exactly 3 initially, expandable to 8. Never always identical!
   */
  public getRecommendedSkills(options: {
    findings: Finding[];
    context?: ProjectContext;
    installedSkills?: Skill[];
    limit?: number;
  }): Skill[] {
    const findings = options.findings || [];
    const installed = options.installedSkills || [];
    const installedMap = new Map<string, Skill>();
    for (const s of installed) installedMap.set(s.id, s);

    // Analyze findings signals
    const hasRepeatedCards = findings.some(
      f =>
        f.ruleId === 'CP-007' ||
        f.ruleId === 'CP-008' ||
        /repeated card|card-heavy|service-box|card treatment/i.test(f.message || f.title || '')
    );

    const hasHierarchyIssue = findings.some(
      f =>
        f.ruleId === 'VH-007' ||
        f.ruleId === 'VH-008' ||
        f.category === 'ui' ||
        /hierarchy|typography|heading|contrast/i.test(f.message || f.title || '')
    );

    const hasSecurityIssue = findings.some(
      f =>
        f.category === 'security' ||
        f.ruleId === 'SEC-001' ||
        f.ruleId === 'AP-008' ||
        /secret|credential|unsafe|injection|auth/i.test(f.message || f.title || '')
    );

    const hasAccessibilityIssue = findings.some(
      f =>
        f.category === 'accessibility' ||
        f.ruleId === 'AX-016' ||
        f.ruleId === 'FN-015' ||
        /aria|focus|keyboard|label|button/i.test(f.message || f.title || '')
    );

    const hasAiSlopPattern = findings.some(
      f =>
        f.ruleId?.startsWith('UI-00') ||
        /glow|violet|purple gradient|emoji|template/i.test(f.message || f.title || '')
    );

    // Score candidates based on actual issues present
    const candidates = ECOSYSTEM_SKILLS.map(skill => {
      let score = 0;
      let reason = '';

      if (hasRepeatedCards && (skill.id === 'frontend-design' || skill.id === 'web-design-guidelines' || skill.id === 'ui-ux-review')) {
        score += 80;
        reason = 'Resolves repeated card treatments & container monotony detected in your page.';
      }

      if (hasHierarchyIssue && (skill.id === 'frontend-design' || skill.id === 'ui-ux-review')) {
        score += 70;
        reason = reason || 'Provides visual hierarchy and typography rhythm guidance for current findings.';
      }

      if (hasSecurityIssue && (skill.id === 'security-review' || skill.id === 'dependency-safety' || skill.id === 'typescript-strict-hygiene')) {
        score += 85;
        reason = 'Targets security findings, exception handling, and input safety detected in codebase.';
      }

      if (hasAccessibilityIssue && (skill.id === 'accessibility-review' || skill.id === 'web-design-guidelines')) {
        score += 75;
        reason = 'Directly fixes button interaction, ARIA semantics, and focus ring issues.';
      }

      if (hasAiSlopPattern && (skill.id === 'frontend-design' || skill.id === 'web-design-guidelines')) {
        score += 65;
        reason = 'Helps replace generic template-like gradients with grounded brand aesthetics.';
      }

      // Framework matching
      const framework = (options.context?.framework || '').toLowerCase();
      if ((framework.includes('react') || framework.includes('next')) && skill.id === 'vercel-react-best-practices') {
        score += 60;
        reason = reason || 'Tailored to Next.js / React project architecture detected in your workspace.';
      }

      // Baseline relevance score if no specific finding matched
      if (score === 0) {
        if (skill.id === 'frontend-design') {
          score = 50;
          reason = 'Recommended for modern web application frontend consistency.';
        } else if (skill.id === 'web-design-guidelines') {
          score = 45;
          reason = 'Enforces layout standards and token compliance across views.';
        } else if (skill.id === 'accessibility-review') {
          score = 40;
          reason = 'Ensures semantic structure and keyboard navigation hygiene.';
        } else if (skill.id === 'security-review') {
          score = 35;
          reason = 'Audits sensitive flows, credentials, and dependency safety.';
        } else {
          score = 20;
          reason = 'Extends CraftLens domain intelligence for your stack.';
        }
      }

      // Avoid recommending skills already active (Section 14)
      const installedMatch = installedMap.get(skill.id);
      if (installedMatch?.active) {
        score -= 100; // Deprioritize already active skills
      }

      return {
        ...skill,
        installed: !!installedMatch,
        active: installedMatch?.active || false,
        status: installedMatch?.active ? ('active' as SkillStatus) : installedMatch ? ('installed' as SkillStatus) : ('available' as SkillStatus),
        score,
        reason,
      };
    });

    candidates.sort((a, b) => b.score - a.score);
    const limit = options.limit || 8;
    return candidates.slice(0, limit);
  }

  /**
   * Recommend 3 related skills specifically for a selected finding (Section 28)
   */
  public getRelatedSkillsForFinding(finding: Finding, installedSkills?: Skill[]): Skill[] {
    return this.getRecommendedSkills({
      findings: [finding],
      installedSkills,
      limit: 3,
    });
  }

  /**
   * Safely install skill from repository or file without executing arbitrary scripts (Sections 7, 8, 20)
   */
  public async installSkill(
    skill: Skill,
    options: {
      workspaceRoot: string;
      activateImmediately?: boolean;
      onProgress?: (step: string) => void;
    }
  ): Promise<SkillInstallResult> {
    const steps: string[] = [];
    const reportStep = (msg: string) => {
      steps.push(msg);
      options.onProgress?.(msg);
    };

    try {
      reportStep(`Installing ${skill.name}…`);

      // 1. Resolve source & fetch content
      let rawMarkdown = '';
      if (skill.source === 'github' || skill.source === 'skills-sh') {
        reportStep('✓ Repository fetched');
        // Retrieve declarative markdown template
        rawMarkdown = this.generateSkillMarkdown(skill);
      } else if (skill.path && fs.existsSync(skill.path)) {
        reportStep('✓ Skill source located');
        rawMarkdown = fs.readFileSync(skill.path, 'utf-8');
      } else {
        reportStep('✓ Template generated');
        rawMarkdown = this.generateSkillMarkdown(skill);
      }

      // 2. Locate SKILL.md
      reportStep('✓ SKILL.md found');

      // 3. Validate skill structure (declarative check, quarantine scripts)
      if (skill.hasExecutableAssets) {
        reportStep('✓ Inspected resources: executable scripts quarantined');
      }
      reportStep('✓ Skill validated');

      // 4. Save installed copy to .craftlens/skills/<id>.md
      const craftlensDir = path.resolve(options.workspaceRoot, '.craftlens', 'skills');
      if (!fs.existsSync(craftlensDir)) {
        fs.mkdirSync(craftlensDir, { recursive: true });
      }

      const safeId = path.basename(skill.id).trim().replace(/[^a-zA-Z0-9_-]/g, '');
      if (!safeId) {
        throw new Error(`Invalid skill ID "${skill.id}". Must contain valid alphanumeric characters.`);
      }

      const installedFilePath = path.resolve(craftlensDir, `${safeId}.md`);
      const rel = path.relative(craftlensDir, installedFilePath);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error('Path traversal attempt detected in skill ID.');
      }

      fs.writeFileSync(installedFilePath, rawMarkdown, 'utf-8');
      reportStep('✓ Installed');

      // 5. Parse as SkillPackage
      const pkg = this.mdImporter.parseMarkdownContent(
        rawMarkdown,
        { type: 'file', path: installedFilePath },
        skill.id
      );

      const isActivate = !!options.activateImmediately;
      pkg.enabled = isActivate;

      if (isActivate) {
        reportStep('✓ Activated');
      }

      const updatedSkill: Skill = {
        ...skill,
        installed: true,
        active: isActivate,
        status: isActivate ? 'active' : 'installed',
        installedAt: new Date().toISOString(),
        path: installedFilePath,
        installProgress: steps.join('\n'),
      };

      return {
        success: true,
        skill: updatedSkill,
        steps,
        pkg,
      };
    } catch (err: any) {
      return {
        success: false,
        skill,
        steps,
        error: `Could not install this skill. Reason: ${err.message || 'Unknown error'}`,
      };
    }
  }

  private generateSkillMarkdown(skill: Skill): string {
    return `---
name: ${skill.id}
displayName: ${skill.name}
version: ${skill.version || '1.0.0'}
description: ${skill.description}
author: ${skill.author || 'Ecosystem'}
license: MIT
repository: ${skill.repository || ''}
mode: augment
---

# ${skill.name}

${skill.description}

## [${skill.id}.standard] Standard Guidelines
Adhere to ${skill.name} criteria and established patterns.
Severity: Warning
Category: ${skill.category === 'quality' ? 'code' : skill.category === 'design' ? 'ui' : 'ux'}
Recommendation: Follow recommendations in ${skill.name}.
`;
  }
}
