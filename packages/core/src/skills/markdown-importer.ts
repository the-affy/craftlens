import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  SkillPackage,
  SkillManifest,
  SkillSource,
  Guidance,
  FixStrategy,
  PatternDefinition,
  RuleExample,
  SkillVersion,
} from '../types/skill.js';
import { Rule, RuleRecommendation } from '../types/rule.js';
import { Severity } from '../types/severity.js';
import { RuleCategory, AnalysisContext } from '../types/context.js';
import { computeSkillContentHash } from './hasher.js';
import { Finding } from '../types/finding.js';
import { SourceLocation } from '../types/location.js';

export interface SkillMetadata {
  name: string;
  displayName: string;
  version: string;
  description: string;
  author: string;
  license: string;
  ruleCount: number;
  guidanceCount: number;
  recommendationCount: number;
  source: SkillSource;
}

export interface SkillImporterContract {
  canImport(source: SkillSource): Promise<boolean>;
  inspect(source: SkillSource): Promise<SkillMetadata>;
  import(source: SkillSource): Promise<SkillPackage>;
}

export class MarkdownSkillImporter implements SkillImporterContract {
  public async canImport(source: SkillSource): Promise<boolean> {
    if (source.type === 'file') {
      return source.path.endsWith('.md') || source.path.endsWith('.markdown');
    }
    return false;
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
    if (source.type !== 'file') {
      throw new Error(`MarkdownSkillImporter only handles source.type === 'file', received ${source.type}`);
    }

    if (!fs.existsSync(source.path)) {
      throw new Error(`Skill file not found at: ${source.path}`);
    }

    const rawContent = fs.readFileSync(source.path, 'utf-8');
    const fallbackName = path.basename(source.path, path.extname(source.path));
    return this.parseMarkdownContent(rawContent, source, fallbackName);
  }

  public parseMarkdownContent(
    rawContent: string,
    source: SkillSource,
    fallbackName: string
  ): SkillPackage {
    const { frontmatter, body } = this.extractFrontmatter(rawContent);

    const manifest: SkillManifest = {
      name: (frontmatter.name as string) || fallbackName.toLowerCase().replace(/[^a-z0-9-_]/g, '-'),
      displayName: (frontmatter.displayName as string) || (frontmatter.name as string) || fallbackName,
      version: (frontmatter.version as string) || '',
      description: (frontmatter.description as string) || 'Custom user markdown skill rules and guidance',
      author: (frontmatter.author as string) || 'User',
      license: (frontmatter.license as string) || 'Proprietary',
      source,
      repository: frontmatter.repository as string | undefined,
      homepage: frontmatter.homepage as string | undefined,
      engineCompatibility: (frontmatter.engineCompatibility as string) || '>=1.0.0',
      mode: (frontmatter.mode as any) || 'augment',
    };

    const sections = this.splitIntoSections(body);

    const rules: Rule[] = [];
    const guidance: Guidance[] = [];
    const recommendations: RuleRecommendation[] = [];
    const fixStrategies: FixStrategy[] = [];
    const patterns: PatternDefinition[] = [];
    const examples: RuleExample[] = [];

    for (const sec of sections) {
      const parsed = this.parseSection(sec, manifest);
      if (parsed.type === 'rule' && parsed.rule) {
        rules.push(parsed.rule);
        if (parsed.rule.structuredRecommendation) {
          recommendations.push(parsed.rule.structuredRecommendation);
        }
        if (parsed.rule.fixStrategy) {
          fixStrategies.push(parsed.rule.fixStrategy);
        }
      } else if (parsed.type === 'guidance' && parsed.guidance) {
        guidance.push(parsed.guidance);
        if (parsed.recommendation) {
          recommendations.push(parsed.recommendation);
        }
      }
      if (parsed.example) {
        examples.push(parsed.example);
      }
    }

    const contentHash = computeSkillContentHash({
      manifest,
      rules,
      guidance,
      patterns,
      fixStrategies,
      rawContent,
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
      trustStatus: source.type === 'builtin' ? 'builtin' : 'user',
      enabled: source.type === 'builtin',
      stats: {
        findingsProduced: 0,
        fixesApplied: 0,
        falsePositiveDismissals: 0,
        activeRules: rules.length,
        disabledRules: 0,
      },
    };
  }

  private extractFrontmatter(content: string): { frontmatter: Record<string, any>; body: string } {
    const trimmed = content.trim();
    if (!trimmed.startsWith('---')) {
      return { frontmatter: {}, body: content };
    }

    const endIdx = trimmed.indexOf('---', 3);
    if (endIdx === -1) {
      return { frontmatter: {}, body: content };
    }

    const yamlStr = trimmed.slice(3, endIdx).trim();
    const body = trimmed.slice(endIdx + 3).trim();
    const frontmatter: Record<string, any> = {};

    for (const line of yamlStr.split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim();
        let val = line.slice(colonIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        frontmatter[key] = val;
      }
    }

    return { frontmatter, body };
  }

  private splitIntoSections(body: string): { title: string; content: string }[] {
    const lines = body.split('\n');
    const sections: { title: string; content: string }[] = [];
    let currentTitle = 'General';
    let currentLines: string[] = [];

    for (const line of lines) {
      const headingMatch = line.match(/^#{1,4}\s+(.+)$/);
      if (headingMatch) {
        if (currentLines.length > 0) {
          sections.push({ title: currentTitle, content: currentLines.join('\n').trim() });
          currentLines = [];
        }
        currentTitle = headingMatch[1].trim();
      } else {
        currentLines.push(line);
      }
    }

    if (currentLines.length > 0) {
      sections.push({ title: currentTitle, content: currentLines.join('\n').trim() });
    }

    return sections.filter(s => s.content.length > 0 || s.title !== 'General');
  }

  private parseSection(
    section: { title: string; content: string },
    manifest: SkillManifest
  ): {
    type: 'rule' | 'guidance';
    rule?: Rule;
    guidance?: Guidance;
    recommendation?: RuleRecommendation;
    example?: RuleExample;
  } {
    const title = section.title;
    const content = section.content;
    const lowerContent = content.toLowerCase();
    const lowerTitle = title.toLowerCase();

    // Check for explicit ID in title like [UI-001] or [team.buttons.focus]
    const idMatch = title.match(/\[([A-Za-z0-9_.-]+)\]/) || title.match(/^([A-Za-z0-9_.-]+):/);
    const slug = title
      .replace(/\[[A-Za-z0-9_.-]+\]/, '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    const ruleId = idMatch ? idMatch[1] : `${manifest.name}.${slug}`;

    // Extract attributes
    const severityMatch = content.match(/severity:\s*(error|warning|suggestion|blocker|info)/i);
    const severity: Severity = severityMatch
      ? (severityMatch[1].toLowerCase() as Severity)
      : lowerContent.includes('must not') || lowerContent.includes('never')
      ? 'error'
      : 'warning';

    const categoryMatch = content.match(
      /category:\s*(ui|ux|accessibility|a11y|security|code|css|react|performance|patchwork)/i
    );
    let category: RuleCategory = 'ui';
    if (categoryMatch) {
      const c = categoryMatch[1].toLowerCase();
      category = (c === 'a11y' ? 'accessibility' : c) as RuleCategory;
    } else if (lowerTitle.includes('button') || lowerTitle.includes('card') || lowerTitle.includes('visual')) {
      category = 'ui';
    } else if (lowerTitle.includes('form') || lowerTitle.includes('navigation') || lowerTitle.includes('ux')) {
      category = 'ux';
    } else if (lowerTitle.includes('accessibility') || lowerTitle.includes('focus') || lowerTitle.includes('aria')) {
      category = 'accessibility';
    } else if (lowerTitle.includes('security') || lowerTitle.includes('secret') || lowerTitle.includes('auth')) {
      category = 'security';
    }

    // Recommendation extraction
    const recMatch = content.match(/recommendation:\s*([^\n]+)/i);
    const recommendationText = recMatch ? recMatch[1].trim() : `Follow ${title} guidelines.`;

    // Examples extraction
    let example: RuleExample | undefined;
    const codeBlocks = content.match(/```[a-z]*\n([\s\S]*?)```/g);
    if (codeBlocks && codeBlocks.length >= 2) {
      example = {
        title: `${title} Example`,
        badSnippet: codeBlocks[0].replace(/```[a-z]*\n/, '').replace(/```$/, ''),
        goodSnippet: codeBlocks[1].replace(/```[a-z]*\n/, '').replace(/```$/, ''),
      };
    }

    // Requirement 38: Classify as executable rule vs advisory guidance
    // Guidance cues: "use generous whitespace", "prefer ... over ...", "consider", "think about", "design philosophy"
    const isAdvisoryOnly =
      lowerContent.includes('generous whitespace') ||
      lowerContent.includes('prefer ') ||
      lowerContent.includes('consider ') ||
      lowerTitle.includes('philosophy') ||
      lowerTitle.includes('overview') ||
      lowerTitle.includes('principles');

    const hasActionableCue =
      lowerContent.includes('must') ||
      lowerContent.includes('do not') ||
      lowerContent.includes('never') ||
      lowerContent.includes('avoid') ||
      lowerContent.includes('requires') ||
      severityMatch !== null;

    if (!isAdvisoryOnly && hasActionableCue) {
      // Create executable rule
      const rule: Rule = {
        id: ruleId,
        version: manifest.version,
        name: title,
        title,
        description: content.split('\n')[0] || title,
        category,
        severity,
        minAuditLevel: 'moderate',
        minimumAuditLevel: 'moderate',
        sourceSkillId: manifest.name,
        sourceSkillVersion: manifest.version,
        confidence: 0.85,
        confidenceLevel: 'contextual',
        problemTitle: title,
        whatIsWrong: content.split('\n')[0] || title,
        whyItMatters: `Defined in custom skill ${manifest.displayName}.`,
        howToFix: recommendationText,
        recommendation: recommendationText,
        structuredRecommendation: {
          summary: recommendationText,
          why: `Defined in custom skill ${manifest.displayName}.`,
          howToFix: recommendationText,
          steps: [recommendationText],
        },
        examples: example ? [example] : undefined,
        detect: (context: AnalysisContext): Finding[] => {
          // Declarative textual / keyword matching detector for user imported rules
          const findings: Finding[] = [];
          const lines = context.sourceCode.split('\n');

          // Look for regex or prohibited keywords derived from title / content
          const prohibitedTerms: string[] = [];
          const patternMatch = content.match(/pattern:\s*([^\n]+)/i);
          if (patternMatch) {
            prohibitedTerms.push(patternMatch[1].trim());
          }

          if (prohibitedTerms.length > 0) {
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              for (const term of prohibitedTerms) {
                if (line.includes(term)) {
                  const loc: SourceLocation = {
                    filePath: context.filePath,
                    start: { line: i + 1, column: line.indexOf(term) + 1, offset: 0 },
                    end: { line: i + 1, column: line.indexOf(term) + term.length + 1, offset: 0 },
                  };
                  findings.push({
                    ruleId,
                    ruleVersion: manifest.version,
                    sourceSkillId: manifest.name,
                    sourceSkillVersion: manifest.version,
                    title,
                    message: `${title}: Found prohibited pattern '${term}'`,
                    severity,
                    confidence: 0.9,
                    location: loc,
                    evidence: [{ type: 'ast', explanation: `Matched pattern '${term}'`, snippet: line.trim() }],
                    recommendation: recommendationText,
                    problemTitle: title,
                    whatIsWrong: `Matched rule '${title}'`,
                    whyItMatters: `Configured in skill ${manifest.displayName}`,
                    howToFix: recommendationText,
                  });
                }
              }
            }
          }
          return findings;
        },
      };

      return { type: 'rule', rule, example };
    } else {
      // Save as Guidance
      const guidanceItem: Guidance = {
        id: ruleId,
        title,
        content,
        category,
      };
      const rec: RuleRecommendation = {
        summary: recommendationText,
        why: content,
        howToFix: recommendationText,
      };
      return { type: 'guidance', guidance: guidanceItem, recommendation: rec, example };
    }
  }
}
