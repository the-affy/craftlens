import * as fs from 'node:fs';
import * as path from 'node:path';
import { ProjectContext } from '../types/context.js';
import { detectProjectContext, createDefaultProjectContext } from './project-context.js';

export interface ProjectContextSummary {
  framework: string;
  language: string;
  ui: string;
  testing: string;
  designSystem: string;
  packageManager: string;
  linting: string;
  formatting: string;
  skillsCount: number;
  rulesCount: number;
  existingSkills: string[];
  existingRules: string[];
  formattedText: string;
}

export class ProjectContextService {
  private rootPath: string;
  private cachedContext?: ProjectContext;
  private cachedSummary?: ProjectContextSummary;
  private configMtimes = new Map<string, number>();
  private listeners: ((context: ProjectContext) => void)[] = [];

  constructor(rootPath: string = '/') {
    this.rootPath = rootPath;
  }

  public setRootPath(rootPath: string): void {
    if (this.rootPath !== rootPath) {
      this.rootPath = rootPath;
      this.invalidateCache();
    }
  }

  public getRootPath(): string {
    return this.rootPath;
  }

  public invalidateCache(): void {
    this.cachedContext = undefined;
    this.cachedSummary = undefined;
    this.configMtimes.clear();
  }

  private hasConfigChanged(): boolean {
    if (!this.cachedContext || this.rootPath === '/' || !fs.existsSync(this.rootPath)) {
      return true;
    }

    const watchFiles = [
      'package.json',
      'tsconfig.json',
      'jsconfig.json',
      'pnpm-lock.yaml',
      'yarn.lock',
      'package-lock.json',
      'bun.lockb',
      'tailwind.config.js',
      'tailwind.config.ts',
      'tailwind.config.cjs',
      'tailwind.config.mjs',
      'components.json',
      '.craftlens/config.json',
    ];

    for (const rel of watchFiles) {
      const full = path.join(this.rootPath, rel);
      if (fs.existsSync(full)) {
        try {
          const stat = fs.statSync(full);
          const prev = this.configMtimes.get(full);
          if (prev === undefined || stat.mtimeMs !== prev) {
            return true;
          }
        } catch {
          // ignore stat errors
        }
      } else if (this.configMtimes.has(full)) {
        return true;
      }
    }

    return false;
  }

  private updateConfigMtimes(): void {
    const watchFiles = [
      'package.json',
      'tsconfig.json',
      'jsconfig.json',
      'pnpm-lock.yaml',
      'yarn.lock',
      'package-lock.json',
      'bun.lockb',
      'tailwind.config.js',
      'tailwind.config.ts',
      'tailwind.config.cjs',
      'tailwind.config.mjs',
      'components.json',
      '.craftlens/config.json',
    ];

    this.configMtimes.clear();
    for (const rel of watchFiles) {
      const full = path.join(this.rootPath, rel);
      if (fs.existsSync(full)) {
        try {
          const stat = fs.statSync(full);
          this.configMtimes.set(full, stat.mtimeMs);
        } catch {
          // ignore
        }
      }
    }
  }

  /**
   * Deterministically inspects the repository and returns the detected ProjectContext.
   * Cached until config files change or cache is invalidated.
   */
  public getContext(forceRefresh = false): ProjectContext {
    if (!forceRefresh && this.cachedContext && !this.hasConfigChanged()) {
      return this.cachedContext;
    }

    if (!this.rootPath || this.rootPath === '/' || !fs.existsSync(this.rootPath)) {
      this.cachedContext = createDefaultProjectContext(this.rootPath);
      return this.cachedContext;
    }

    this.cachedContext = detectProjectContext({ rootPath: this.rootPath });
    this.updateConfigMtimes();
    this.cachedSummary = undefined; // recalculate summary

    for (const l of this.listeners) {
      try {
        l(this.cachedContext);
      } catch (err) {
        console.error('Error in ProjectContextService listener:', err);
      }
    }

    return this.cachedContext;
  }

  /**
   * Returns a high-level summary of the detected project intelligence.
   */
  public getSummary(forceRefresh = false): ProjectContextSummary {
    if (!forceRefresh && this.cachedSummary && !this.hasConfigChanged()) {
      return this.cachedSummary;
    }

    const ctx = this.getContext(forceRefresh);

    // Framework
    let framework = 'Standard Web';
    if (ctx.framework === 'nextjs') framework = 'Next.js';
    else if (ctx.framework === 'remix') framework = 'Remix';
    else if (ctx.framework === 'astro') framework = 'Astro';
    else if (ctx.framework === 'react') framework = 'React (SPA)';
    else if (ctx.framework === 'vue') framework = 'Vue.js';
    else if (ctx.framework === 'angular') framework = 'Angular';
    else if (ctx.framework === 'svelte') framework = 'Svelte';
    else if (ctx.framework === 'nestjs') framework = 'NestJS';
    else if (ctx.framework === 'fastify') framework = 'Fastify';
    else if (ctx.framework === 'express') framework = 'Express';

    // Language
    const language = ctx.hasTypeScript ? 'TypeScript' : 'JavaScript';

    // UI & Styling
    let ui = 'HTML + CSS';
    const isReact = ctx.dependencies['react'] || ctx.framework === 'nextjs' || ctx.framework === 'remix';
    const isVue = ctx.dependencies['vue'] || ctx.framework === 'vue';
    const isTailwind = ctx.cssStrategy === 'tailwind' || Boolean(ctx.dependencies['tailwindcss']);

    if (isReact && isTailwind) ui = 'React + Tailwind';
    else if (isReact && ctx.cssStrategy === 'css-modules') ui = 'React + CSS Modules';
    else if (isReact && ctx.cssStrategy === 'styled-components') ui = 'React + Styled Components';
    else if (isReact) ui = 'React';
    else if (isVue && isTailwind) ui = 'Vue + Tailwind';
    else if (isVue) ui = 'Vue';
    else if (isTailwind) ui = 'Tailwind CSS';

    // Testing
    let testing = 'None detected';
    if (ctx.testingSetup?.framework && ctx.testingSetup.framework !== 'none') {
      const f = ctx.testingSetup.framework;
      if (f === 'playwright') testing = 'Playwright';
      else if (f === 'vitest') testing = 'Vitest';
      else if (f === 'jest') testing = 'Jest';
      else if (f === 'cypress') testing = 'Cypress';
      else testing = f;
    }

    // Design System
    let designSystem = 'None detected';
    const uiDirExists = [
      path.join(this.rootPath, 'src', 'components', 'ui'),
      path.join(this.rootPath, 'components', 'ui'),
      path.join(this.rootPath, 'ui'),
    ].find(p => fs.existsSync(p));

    if (uiDirExists) {
      const rel = path.relative(this.rootPath, uiDirExists).replace(/\\/g, '/');
      designSystem = `${rel}/`;
    } else if (ctx.componentSystem) {
      designSystem = ctx.componentSystem;
    } else if (ctx.designSystem?.hasDesignSystem) {
      designSystem = ctx.designSystem.source || 'Design System';
    }

    // Package Manager
    let packageManager = ctx.packageManager || 'npm';
    if (fs.existsSync(path.join(this.rootPath, 'pnpm-lock.yaml'))) packageManager = 'pnpm';
    else if (fs.existsSync(path.join(this.rootPath, 'yarn.lock'))) packageManager = 'yarn';
    else if (fs.existsSync(path.join(this.rootPath, 'bun.lockb')) || fs.existsSync(path.join(this.rootPath, 'bun.lock'))) packageManager = 'bun';
    else if (fs.existsSync(path.join(this.rootPath, 'package-lock.json'))) packageManager = 'npm';

    // Linting & Formatting
    let linting = 'None detected';
    if (ctx.lintConfig?.hasBiome) linting = 'Biome';
    else if (ctx.lintConfig?.hasEslint) linting = 'ESLint';

    let formatting = 'None detected';
    if (ctx.lintConfig?.hasBiome) formatting = 'Biome';
    else if (ctx.lintConfig?.hasPrettier) formatting = 'Prettier';

    // Existing Skills in project
    const existingSkills: string[] = [];
    const skillsDir = path.join(this.rootPath, '.craftlens', 'skills');
    if (fs.existsSync(skillsDir)) {
      try {
        const files = fs.readdirSync(skillsDir);
        for (const file of files) {
          if (file.endsWith('.md') || file.endsWith('.json')) {
            existingSkills.push(file.replace(/\.(md|json)$/, ''));
          }
        }
      } catch {
        // ignore
      }
    }

    // Existing Rules in project
    const existingRules: string[] = [];
    const rulesDir = path.join(this.rootPath, '.craftlens', 'rules');
    if (fs.existsSync(rulesDir)) {
      try {
        const files = fs.readdirSync(rulesDir);
        for (const file of files) {
          if (file.endsWith('.md') || file.endsWith('.json')) {
            existingRules.push(file.replace(/\.(md|json)$/, ''));
          }
        }
      } catch {
        // ignore
      }
    }

    const formattedText = [
      'Project Context',
      `Framework: ${framework}`,
      `Language: ${language}`,
      `UI: ${ui}`,
      `Testing: ${testing}`,
      `Design System: ${designSystem}`,
      `Package Manager: ${packageManager}`,
    ].join('\n');

    this.cachedSummary = {
      framework,
      language,
      ui,
      testing,
      designSystem,
      packageManager,
      linting,
      formatting,
      skillsCount: existingSkills.length,
      rulesCount: existingRules.length,
      existingSkills,
      existingRules,
      formattedText,
    };

    return this.cachedSummary;
  }

  public onDidChange(listener: (context: ProjectContext) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx !== -1) {
        this.listeners.splice(idx, 1);
      }
    };
  }
}
