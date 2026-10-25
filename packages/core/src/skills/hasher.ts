import * as crypto from 'node:crypto';
import { SkillManifest, Guidance, FixStrategy, PatternDefinition } from '../types/skill.js';
import { Rule } from '../types/rule.js';

export function computeContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

export function computeSkillContentHash(data: {
  manifest?: Partial<SkillManifest>;
  rules?: Rule[];
  guidance?: Guidance[];
  fixStrategies?: FixStrategy[];
  patterns?: PatternDefinition[];
  rawContent?: string;
}): string {
  if (data.rawContent) {
    return computeContentHash(data.rawContent.trim());
  }

  const normalized = {
    manifest: {
      name: data.manifest?.name || '',
      version: data.manifest?.version || '',
      displayName: data.manifest?.displayName || '',
      author: data.manifest?.author || '',
      license: data.manifest?.license || '',
    },
    rules: (data.rules || [])
      .map(r => ({
        id: r.id,
        version: r.version || '1.0.0',
        name: r.name || r.title || '',
        category: r.category,
        severity: r.severity,
        desc: r.description,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    guidance: (data.guidance || [])
      .map(g => ({ id: g.id, title: g.title, content: g.content }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    patterns: (data.patterns || [])
      .map(p => ({ id: p.id, name: p.name, desc: p.description }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };

  const str = JSON.stringify(normalized);
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
}
