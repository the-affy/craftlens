import * as fs from 'node:fs';
import * as path from 'node:path';
import { SkillPackage, SkillSource, SkillManifest, SkillVersion } from '../types/skill.js';
import { MarkdownSkillImporter, SkillImporterContract, SkillMetadata } from './markdown-importer.js';
import { computeSkillContentHash } from './hasher.js';

export class LocalDirectorySkillImporter implements SkillImporterContract {
  private mdImporter = new MarkdownSkillImporter();

  public async canImport(source: SkillSource): Promise<boolean> {
    return source.type === 'directory' && fs.existsSync(source.path) && fs.statSync(source.path).isDirectory();
  }

  public async inspect(source: SkillSource): Promise<SkillMetadata> {
    const pkg = await this.import(source);
    return {
      name: pkg.manifest.name,
      displayName: pkg.manifest.displayName,
      version: pkg.manifest.version,
      description: pkg.manifest.description,
      author: pkg.manifest.author,
      license: pkg.manifest.license,
      ruleCount: pkg.rules.length,
      guidanceCount: pkg.guidance.length,
      recommendationCount: pkg.recommendations.length,
      source: pkg.source,
    };
  }

  public async import(source: SkillSource): Promise<SkillPackage> {
    if (source.type !== 'directory') {
      throw new Error(`LocalDirectorySkillImporter expects source.type === 'directory', got ${source.type}`);
    }

    const dirPath = source.path;
    let manifestData: Partial<SkillManifest> = {};
    const skillJsonPath = path.join(dirPath, 'skill.json');
    if (fs.existsSync(skillJsonPath)) {
      try {
        manifestData = JSON.parse(fs.readFileSync(skillJsonPath, 'utf-8'));
      } catch (e) {
        console.warn(`Could not parse ${skillJsonPath}:`, e);
      }
    }

    const allFiles = fs.readdirSync(dirPath);
    const mdFiles = allFiles.filter(f => f.endsWith('.md') || f.endsWith('.markdown'));

    // Check for primary SKILL.md
    const primaryMd = mdFiles.find(f => f.toUpperCase() === 'SKILL.MD') || mdFiles[0];

    const fallbackName = path.basename(dirPath);
    let primaryPackage: SkillPackage | null = null;

    if (primaryMd) {
      primaryPackage = await this.mdImporter.import({
        type: 'file',
        path: path.join(dirPath, primaryMd),
      });
    }

    const manifest: SkillManifest = {
      name: manifestData.name || primaryPackage?.manifest.name || fallbackName.toLowerCase().replace(/[^a-z0-9-_]/g, '-'),
      displayName: manifestData.displayName || primaryPackage?.manifest.displayName || fallbackName,
      version: manifestData.version || primaryPackage?.manifest.version || '1.0.0',
      description: manifestData.description || primaryPackage?.manifest.description || 'Imported local directory skill',
      author: manifestData.author || primaryPackage?.manifest.author || 'Local User',
      license: manifestData.license || primaryPackage?.manifest.license || 'Proprietary',
      source,
      engineCompatibility: manifestData.engineCompatibility || primaryPackage?.manifest.engineCompatibility || '>=1.0.0',
      mode: manifestData.mode || primaryPackage?.manifest.mode || 'augment',
      appliesTo: manifestData.appliesTo || primaryPackage?.manifest.appliesTo,
    };

    const rules = [...(primaryPackage?.rules || [])];
    const guidance = [...(primaryPackage?.guidance || [])];
    const recommendations = [...(primaryPackage?.recommendations || [])];
    const fixStrategies = [...(primaryPackage?.fixStrategies || [])];
    const patterns = [...(primaryPackage?.patterns || [])];
    const examples = [...(primaryPackage?.examples || [])];

    // Read additional markdown files
    for (const f of mdFiles) {
      if (f === primaryMd) continue;
      try {
        const subPkg = await this.mdImporter.import({
          type: 'file',
          path: path.join(dirPath, f),
        });
        rules.push(...subPkg.rules);
        guidance.push(...subPkg.guidance);
        recommendations.push(...subPkg.recommendations);
        fixStrategies.push(...subPkg.fixStrategies);
        patterns.push(...subPkg.patterns);
        if (subPkg.examples) examples.push(...subPkg.examples);
      } catch (err) {
        console.warn(`Could not import sub-file ${f}:`, err);
      }
    }

    const contentHash = computeSkillContentHash({
      manifest,
      rules,
      guidance,
      patterns,
      fixStrategies,
    });

    const version: SkillVersion = {
      skillId: manifest.name,
      version: manifest.version,
      contentHash,
      installedAt: new Date().toISOString(),
      source,
      ruleCount: rules.length,
    };

    return {
      manifest,
      rules,
      patterns,
      recommendations,
      fixStrategies,
      guidance,
      examples,
      source,
      version,
      history: [version],
      trustStatus: 'user',
      enabled: true,
      stats: {
        findingsProduced: 0,
        fixesApplied: 0,
        falsePositiveDismissals: 0,
        activeRules: rules.length,
        disabledRules: 0,
      },
    };
  }
}
