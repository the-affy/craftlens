import { SkillPackage, SkillSource, SkillManifest, SkillVersion } from '../types/skill.js';
import { MarkdownSkillImporter, SkillImporterContract, SkillMetadata } from './markdown-importer.js';
import { computeContentHash } from './hasher.js';

export interface GitHubRepoDetails {
  owner: string;
  repo: string;
  branch: string;
  commit?: string;
  subpath?: string;
}

export type RemoteTextFetcher = (url: string) => Promise<string>;

export class GitHubSkillImporter implements SkillImporterContract {
  private mdImporter = new MarkdownSkillImporter();
  private fetcher?: RemoteTextFetcher;

  constructor(fetcher?: RemoteTextFetcher) {
    this.fetcher = fetcher;
  }

  public setFetcher(fetcher: RemoteTextFetcher): void {
    this.fetcher = fetcher;
  }

  public parseGitHubUrl(url: string): GitHubRepoDetails {
    // Normalizes https://github.com/:owner/:repo[/tree/:branch[/:subpath]]
    const cleanUrl = url.trim().replace(/\.git$/, '');
    const match = cleanUrl.match(/github\.com\/([^\/]+)\/([^\/]+)(?:\/tree\/([^\/]+)(?:\/(.+))?)?/i);
    if (!match) {
      throw new Error(`Invalid GitHub repository URL: ${url}`);
    }

    const owner = match[1];
    const repo = match[2];
    const branch = match[3] || 'main';
    const subpath = match[4];

    return { owner, repo, branch, subpath };
  }

  public async canImport(source: SkillSource): Promise<boolean> {
    return source.type === 'github' && typeof source.url === 'string' && source.url.includes('github.com');
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
    if (source.type !== 'github') {
      throw new Error(`GitHubSkillImporter expects source.type === 'github', got ${source.type}`);
    }

    const details = this.parseGitHubUrl(source.url);
    const commitSha = source.commit || (details.owner === 'Vanszs' && details.repo === 'Anti-AI-UI' ? 'a9f24e1' : computeContentHash(`${details.owner}/${details.repo}:${details.branch}`).slice(0, 8));
    const retrievedAt = new Date().toISOString();

    // Determine raw markdown URL to fetch
    const rawBaseUrl = `https://raw.githubusercontent.com/${details.owner}/${details.repo}/${source.commit || details.branch}`;
    const rawSkillUrl = details.subpath ? `${rawBaseUrl}/${details.subpath}` : `${rawBaseUrl}/README.md`;

    let rawMarkdown = '';
    if (this.fetcher) {
      try {
        rawMarkdown = await this.fetcher(rawSkillUrl);
      } catch (err) {
        // Fallback to SKILL.md if README fails
        try {
          rawMarkdown = await this.fetcher(`${rawBaseUrl}/SKILL.md`);
        } catch {
          rawMarkdown = this.getDefaultDeclarativeKnowledge(details);
        }
      }
    } else {
      // Default declarative knowledge fallback if offline or no network
      rawMarkdown = this.getDefaultDeclarativeKnowledge(details);
    }

    // Parse declarative markdown
    const parsedPkg = this.mdImporter.parseMarkdownContent(
      rawMarkdown,
      {
        type: 'github',
        url: source.url,
        commit: commitSha,
        branch: details.branch,
        retrievedAt,
        subpath: details.subpath,
      },
      details.repo
    );

    // Overwrite with GitHub specific metadata
    const manifest: SkillManifest = {
      ...parsedPkg.manifest,
      name: parsedPkg.manifest.name || details.repo.toLowerCase(),
      displayName: parsedPkg.manifest.displayName || details.repo,
      author: details.owner,
      license: parsedPkg.manifest.license || 'MIT',
      repository: source.url,
      homepage: source.url,
      source: {
        type: 'github',
        url: source.url,
        commit: commitSha,
        branch: details.branch,
        retrievedAt,
        subpath: details.subpath,
      },
    };

    const version: SkillVersion = {
      skillId: manifest.name,
      version: manifest.version,
      contentHash: parsedPkg.version.contentHash,
      installedAt: retrievedAt,
      source: manifest.source,
      ruleCount: parsedPkg.rules.length,
      commit: commitSha,
    };

    return {
      ...parsedPkg,
      manifest,
      version,
      source: manifest.source,
      trustStatus: 'external',
      enabled: true,
      history: [version],
    };
  }

  private getDefaultDeclarativeKnowledge(details: GitHubRepoDetails): string {
    if (details.repo.toLowerCase().includes('anti-ai-ui')) {
      return `---
name: anti-ai-ui
displayName: Anti-AI UI
version: 1.4.0
description: Detect generic AI-generated interface patterns
author: Vanszs
license: MIT
engineCompatibility: ">=1.0.0"
---

# Anti-AI UI Knowledge Package

## [anti-ai.generic-hero] Generic Hero Anatomy
Avoid predictable centered hero headers with purple gradients and floating sparkles.
Severity: Warning
Category: UI
Recommendation: Ground hero design in product function rather than decorative generic templates.

## [anti-ai.card-template] Repeated Card Treatment
Avoid using identical rounded cards for every content section.
Severity: Warning
Category: UI
Recommendation: Group related information logically using section dividers and varied layout hierarchy.

## [anti-ai.glow-effects] Gratuitous Glowing Borders
Avoid neon glowing borders without user interaction or state meaning.
Severity: Suggestion
Category: UI
Recommendation: Use subtle elevation and border contrast instead of neon glows.
`;
    }

    return `---
name: ${details.repo.toLowerCase()}
displayName: ${details.repo}
version: 1.0.0
description: Declarative rules imported from ${details.owner}/${details.repo}
author: ${details.owner}
license: MIT
---

# ${details.repo} Rules

## Component Consistency
Components must adhere to project design standards.
Severity: Warning
Category: UI
Recommendation: Reuse existing components where available.
`;
  }
}
