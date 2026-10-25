import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  SkillPackage,
  SkillSource,
  SkillManifest,
  SkillVersion,
  RuleExecutionMode,
  SkillMode,
  SkillChangeSummary,
  Skill,
  SkillStatus,
} from '../types/skill.js';
import { Rule } from '../types/rule.js';
import { SkillRegistry, SkillValidationResult } from './registry.js';
import { MarkdownSkillImporter } from './markdown-importer.js';
import { LocalDirectorySkillImporter } from './directory-importer.js';
import { GitHubSkillImporter } from './github-importer.js';
import { BUILTIN_SKILL_DEFINITIONS } from './builtin-definitions.js';
import { computeSkillContentHash } from './hasher.js';

export interface SkillManagerOptions {
  workspaceRoot?: string;
  globalSkillsDir?: string;
}

export class SkillManager {
  private registry = new SkillRegistry();
  private mdImporter = new MarkdownSkillImporter();
  private dirImporter = new LocalDirectorySkillImporter();
  private githubImporter = new GitHubSkillImporter();
  private workspaceRoot?: string;
  private globalSkillsDir?: string;
  private ruleExecutionMode: RuleExecutionMode = 'combined';
  private originalFilePaths = new Map<string, string>();

  constructor(options?: SkillManagerOptions | string) {
    if (typeof options === 'string') {
      this.workspaceRoot = options;
    } else {
      this.workspaceRoot = options?.workspaceRoot;
      this.globalSkillsDir = options?.globalSkillsDir;
    }
  }

  public getRegistry(): SkillRegistry {
    return this.registry;
  }

  public setRuleExecutionMode(mode: RuleExecutionMode): void {
    this.ruleExecutionMode = mode;
  }

  public getRuleExecutionMode(): RuleExecutionMode {
    return this.ruleExecutionMode;
  }

  public initBuiltinSkills(availableRules: Rule[]): void {
    const rulesById = new Map<string, Rule>();
    for (const r of availableRules) {
      rulesById.set(r.id, r);
    }

    for (const def of BUILTIN_SKILL_DEFINITIONS) {
      const assignedRules: Rule[] = [];
      for (const id of def.ruleIds) {
        const found = rulesById.get(id);
        if (found) {
          // Stamp source skill ID and version
          const enriched: Rule = {
            ...found,
            version: found.version || def.manifest.version,
            sourceSkillId: def.manifest.name,
            sourceSkillVersion: def.manifest.version,
          };
          assignedRules.push(enriched);
        }
      }

      const contentHash = computeSkillContentHash({
        manifest: def.manifest,
        rules: assignedRules,
        guidance: def.guidance,
      });

      const version: SkillVersion = {
        skillId: def.manifest.name,
        version: def.manifest.version,
        contentHash,
        installedAt: '2026-10-21T00:00:00.000Z',
        source: def.manifest.source,
        ruleCount: assignedRules.length,
      };

      const pkg: SkillPackage = {
        manifest: def.manifest,
        rules: assignedRules,
        patterns: [],
        recommendations: def.recommendations.map(r => ({
          summary: r.summary,
          why: r.why,
          howToFix: r.howToFix,
        })),
        fixStrategies: [],
        guidance: def.guidance,
        examples: [],
        source: def.manifest.source,
        version,
        history: [version],
        trustStatus: 'builtin',
        enabled: true,
        stats: {
          findingsProduced: 0,
          fixesApplied: 0,
          falsePositiveDismissals: 0,
          activeRules: assignedRules.length,
          disabledRules: 0,
        },
      };

      this.registry.register(pkg);
    }

    // Restore any persisted active/inactive selections
    this.loadSkillsState();
  }

  public async installSkill(
    source: SkillSource,
    options?: { activateImmediately?: boolean }
  ): Promise<SkillPackage> {
    return this.importSkill(source, options);
  }

  public async importSkill(
    source: SkillSource,
    options?: { activateImmediately?: boolean }
  ): Promise<SkillPackage> {
    let pkg: SkillPackage;
    if (source.type === 'file') {
      pkg = await this.mdImporter.import(source);
    } else if (source.type === 'directory') {
      pkg = await this.dirImporter.import(source);
    } else if (source.type === 'github') {
      pkg = await this.githubImporter.import(source);
    } else {
      throw new Error(`Unsupported skill source type: ${(source as any).type}`);
    }

    // Default to inactive unless explicitly asked to activate immediately (Section 11)
    const shouldBeActive = options?.activateImmediately ?? false;
    pkg.enabled = shouldBeActive;

    // Track original file path for uploaded markdown files
    if (source.type === 'file' && this.workspaceRoot) {
      const originalPath = source.path;
      const skillsDir = path.join(this.workspaceRoot, '.craftlens', 'skills');
      const isInsideCraftlens = path.resolve(originalPath).startsWith(path.resolve(skillsDir));

      if (!isInsideCraftlens) {
        this.originalFilePaths.set(pkg.manifest.name, originalPath);
        if (!fs.existsSync(skillsDir)) {
          fs.mkdirSync(skillsDir, { recursive: true });
        }
        const safeName = path.basename(pkg.manifest.name).trim().replace(/[^a-zA-Z0-9_-]/g, '') || 'custom-skill';
        const installedPath = path.resolve(skillsDir, `${safeName}.md`);
        const rel = path.relative(skillsDir, installedPath);
        if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
          try {
            fs.copyFileSync(originalPath, installedPath);
            // Point source to installed copy so local edits/audit work off installed location
            pkg.source = { type: 'file', path: installedPath };
          } catch (e) {
            console.warn('Could not copy skill to .craftlens/skills:', e);
          }
        }
      }
    }

    // Validate skill before registering
    const validation = this.registry.validateSkill(pkg);
    if (!validation.valid) {
      const errors = validation.issues.filter(i => i.type === 'error').map(i => i.message).join('; ');
      throw new Error(`Skill validation failed: ${errors}`);
    }

    const regResult = this.registry.register(pkg);
    if (!regResult.success) {
      throw new Error(regResult.warnings.join('; '));
    }

    this.saveSkillsState();
    return pkg;
  }

  public loadProjectSkills(): void {
    if (!this.workspaceRoot) return;

    // Load from config first so we know recorded active states & sources
    this.loadSkillsState();

    // Check .craftlens/skills
    const candidates = [
      path.join(this.workspaceRoot, '.craftlens', 'skills'),
    ];

    for (const dir of candidates) {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);
          try {
            if (stat.isFile() && (file.endsWith('.md') || file.endsWith('.markdown'))) {
              this.importSkillSync({ type: 'file', path: fullPath });
            } else if (stat.isDirectory()) {
              this.importSkill({ type: 'directory', path: fullPath });
            }
          } catch (err) {
            console.warn(`Failed to auto-load project skill from ${fullPath}:`, err);
          }
        }
      }
    }

    // Reapply state after loading files
    this.loadSkillsState();
  }

  public importSkillSync(source: SkillSource, options?: { activateImmediately?: boolean }): SkillPackage {
    if (source.type !== 'file') {
      throw new Error('Only file sources can be loaded synchronously');
    }
    const raw = fs.readFileSync(source.path, 'utf-8');
    const fallback = path.basename(source.path, path.extname(source.path));
    const pkg = this.mdImporter.parseMarkdownContent(raw, source, fallback);
    pkg.enabled = options?.activateImmediately ?? false;
    this.registry.register(pkg);
    return pkg;
  }

  public getSkillsConfigPath(): string | null {
    if (!this.workspaceRoot) return null;
    return path.join(this.workspaceRoot, '.craftlens', 'skills.json');
  }

  public loadSkillsState(): void {
    const configPath = this.getSkillsConfigPath();
    if (!configPath || !fs.existsSync(configPath)) return;

    try {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const skillsMap = raw.skills || raw;
      if (skillsMap && typeof skillsMap === 'object') {
        for (const [id, entry] of Object.entries(skillsMap as Record<string, any>)) {
          if (entry.originalFilePath) {
            this.originalFilePaths.set(id, entry.originalFilePath);
          }
          const pkg = this.registry.getSkill(id);
          if (pkg && typeof entry.active === 'boolean') {
            pkg.enabled = entry.active;
          }
        }
      }
    } catch (e) {
      console.warn('Failed to parse .craftlens/skills.json:', e);
    }
  }

  public saveSkillsState(): void {
    const configPath = this.getSkillsConfigPath();
    if (!configPath) return;

    try {
      const dir = path.dirname(configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const allSkills = this.getAllSkillsAsSkills();
      const skillsObj: Record<string, any> = {};
      for (const s of allSkills) {
        skillsObj[s.id] = {
          id: s.id,
          name: s.name,
          version: s.version,
          active: s.active,
          installed: s.installed,
          source: s.source,
          originalFilePath: s.originalFilePath || this.originalFilePaths.get(s.id),
          updatedAt: new Date().toISOString(),
        };
      }

      fs.writeFileSync(configPath, JSON.stringify({ skills: skillsObj }, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save skills state:', e);
    }
  }

  public setSkillActive(skillId: string, active: boolean): void {
    const pkg = this.registry.getSkill(skillId);
    if (pkg) {
      pkg.enabled = active;
      this.saveSkillsState();
    }
  }

  public toggleSkillActive(skillId: string): boolean {
    const pkg = this.registry.getSkill(skillId);
    if (pkg) {
      const next = !(pkg.enabled !== false);
      pkg.enabled = next;
      this.saveSkillsState();
      return next;
    }
    return false;
  }

  public async deleteSkill(skillId: string): Promise<boolean> {
    const pkg = this.registry.getSkill(skillId);
    if (!pkg) return false;

    // 1. Deactivate before deletion (Section 10)
    pkg.enabled = false;

    // 2. Remove from registry
    this.registry.removeSkill(skillId);

    // 3. Remove installed copy from .craftlens/skills/<id>.md if it exists
    if (this.workspaceRoot) {
      const skillsDir = path.resolve(this.workspaceRoot, '.craftlens', 'skills');
      const safeId = path.basename(skillId).trim().replace(/[^a-zA-Z0-9_-]/g, '');
      if (safeId) {
        const installedFile = path.resolve(skillsDir, `${safeId}.md`);
        const rel = path.relative(skillsDir, installedFile);
        if (!rel.startsWith('..') && !path.isAbsolute(rel) && fs.existsSync(installedFile)) {
          try {
            fs.unlinkSync(installedFile);
          } catch (e) {
            console.warn(`Could not delete installed file at ${installedFile}:`, e);
          }
        }
      }
    }

    // 4. IMPORTANT (Section 10): NEVER delete originalFilePath!
    this.originalFilePaths.delete(skillId);

    // 5. Update saved state
    this.saveSkillsState();
    return true;
  }

  public toSkill(pkg: SkillPackage): Skill {
    const isBuiltin = pkg.source.type === 'builtin';
    const isGitHub = (pkg.source as any).type === 'github';
    const isFile = (pkg.source as any).type === 'file';

    const source: 'builtin' | 'local' | 'github' | 'skills-sh' | 'user-uploaded' =
      isBuiltin
        ? 'builtin'
        : isGitHub
        ? 'github'
        : isFile
        ? 'user-uploaded'
        : 'local';

    const active = pkg.enabled !== false;
    const status: SkillStatus = active ? 'active' : 'inactive';
    const originalFilePath = this.originalFilePaths.get(pkg.manifest.name) || (isFile ? (pkg.source as any).path : undefined);

    return {
      id: pkg.manifest.name,
      name: pkg.manifest.displayName || pkg.manifest.name,
      description: pkg.manifest.description || '',
      source,
      version: pkg.manifest.version || undefined,
      installed: true,
      active,
      status,
      repository: pkg.manifest.repository,
      path: isFile ? (pkg.source as any).path : undefined,
      originalFilePath,
      capabilities: pkg.manifest.tags || ['rule checks', 'guidance'],
      checksum: pkg.version?.contentHash,
      rulesCount: pkg.rules.length,
      installedAt: pkg.version?.installedAt,
      author: pkg.manifest.author,
    };
  }

  public getAllSkillsAsSkills(): Skill[] {
    return this.registry.getAllSkills().map(pkg => this.toSkill(pkg));
  }

  public getSkill(skillId: string): Skill | undefined {
    const pkg = this.registry.getSkill(skillId);
    return pkg ? this.toSkill(pkg) : undefined;
  }

  public getLockedSkills(): Record<string, string> {
    if (!this.workspaceRoot) return {};
    const configPath = path.join(this.workspaceRoot, '.craftlens', 'config.json');
    if (fs.existsSync(configPath)) {
      try {
        const content = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        return content.skills || {};
      } catch {
        return {};
      }
    }
    return {};
  }

  public lockSkillVersion(skillId: string, version: string): void {
    if (!this.workspaceRoot) return;
    const dir = path.join(this.workspaceRoot, '.craftlens');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const configPath = path.join(dir, 'config.json');
    let cfg: Record<string, any> = {};
    if (fs.existsSync(configPath)) {
      try {
        cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      } catch {
        cfg = {};
      }
    }
    cfg.skills = cfg.skills || {};
    cfg.skills[skillId] = version;
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf-8');
  }

  public async checkForUpdates(skillId: string): Promise<SkillChangeSummary | null> {
    const skill = this.registry.getSkill(skillId);
    if (!skill || skill.source.type !== 'github') {
      return null;
    }

    try {
      const latestPkg = await this.githubImporter.import(skill.source);
      if (
        latestPkg.manifest.version !== skill.manifest.version ||
        latestPkg.version.contentHash !== skill.version.contentHash
      ) {
        return this.registry.compareVersions(skill, latestPkg);
      }
    } catch {
      return null;
    }

    return null;
  }

  public getEffectiveRules(): Rule[] {
    const allSkills = this.registry.getAllSkills();
    const effectiveRules: Rule[] = [];

    // Filter by RuleExecutionMode
    for (const skill of allSkills) {
      if (skill.enabled === false) continue;

      const isBuiltin = skill.source.type === 'builtin';
      if (this.ruleExecutionMode === 'builtin' && !isBuiltin) continue;
      if (this.ruleExecutionMode === 'custom' && isBuiltin) continue;

      effectiveRules.push(...skill.rules);
    }

    return effectiveRules;
  }
}
