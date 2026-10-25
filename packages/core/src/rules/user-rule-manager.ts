import { UserRuleGroup, UserRuleItem } from '../types/custom-rule.js';
import { Finding } from '../types/finding.js';
import { CanonicalSeverity, toSemanticSeverity } from '../types/severity.js';
import { RuleCategory } from '../types/context.js';
import { SourceLocation } from '../types/location.js';

export interface ParseResult {
  group: UserRuleGroup;
  errors: string[];
}

export interface UrlImportPreview {
  success: boolean;
  url: string;
  groupName: string;
  ruleCount: number;
  previewRules: Array<{
    name: string;
    description: string;
    severity: CanonicalSeverity;
    category: string;
  }>;
  parsedGroup?: UserRuleGroup;
  error?: string;
}

export class UserRuleManager {
  private groups: Map<string, UserRuleGroup> = new Map();

  constructor(initialGroups?: UserRuleGroup[]) {
    if (initialGroups && initialGroups.length > 0) {
      for (const g of initialGroups) {
        this.groups.set(g.id, { ...g, expanded: g.expanded ?? true });
      }
    } else {
      // Seed initial default user rule library
      this.seedDefaultUserRules();
    }
  }

  private seedDefaultUserRules(): void {
    const defaultGroup: UserRuleGroup = {
      id: 'grp_ui_rules',
      name: 'My UI Rules',
      source: 'manual',
      importedAt: Date.now(),
      expanded: true,
      rules: [
        {
          id: 'usr_rounded_cards',
          name: 'Avoid excessive rounded cards',
          title: 'Avoid excessive rounded cards',
          description: 'Do not use large rounded cards everywhere. Limit extreme border radius to modals and badges.',
          category: 'ui-ux',
          severity: 'warning',
          source: { type: 'user', name: 'My UI Rules' },
          detectionMethod: 'pattern',
          pattern: 'rounded-2xl|rounded-3xl|border-radius:\\s*2[4-9]px|border-radius:\\s*[3-9][0-9]px',
          enabled: true,
          whyItMatters: 'Repeated huge corner radiuses create a generic vibe-coded AI aesthetic.',
          howToFix: 'Use standard border-radius tokens (--radius-md: 8px or rounded-lg).',
          groupId: 'grp_ui_rules',
        },
        {
          id: 'usr_gradient_text',
          name: 'Avoid gradient text',
          title: 'Avoid gradient text',
          description: 'Avoid gradient text unless explicitly required by brand guidelines.',
          category: 'ui-ux',
          severity: 'moderate',
          source: { type: 'user', name: 'My UI Rules' },
          detectionMethod: 'pattern',
          pattern: 'bg-clip-text|background-clip:\\s*text|-webkit-background-clip:\\s*text',
          enabled: true,
          whyItMatters: 'Gradient text frequently reduces legibility and clashes with dark mode.',
          howToFix: 'Use high-contrast solid typography with semantic foreground tokens.',
          groupId: 'grp_ui_rules',
        },
        {
          id: 'usr_design_tokens',
          name: 'Use design tokens',
          title: 'Use design tokens',
          description: 'Always use project design tokens rather than hardcoded px or arbitrary hex values.',
          category: 'ui-ux',
          severity: 'warning',
          source: { type: 'user', name: 'My UI Rules' },
          detectionMethod: 'pattern',
          pattern: '#[0-9a-fA-F]{6}',
          enabled: true,
          whyItMatters: 'Hardcoded arbitrary tokens bypass the design system and break theming.',
          howToFix: 'Replace inline value with existing CSS variables or Tailwind tokens.',
          groupId: 'grp_ui_rules',
        },
        {
          id: 'usr_oversized_headings',
          name: 'Avoid oversized headings',
          title: 'Avoid oversized headings',
          description: 'Avoid disproportionately huge typography (text-6xl or >48px) inside standard content cards.',
          category: 'ui-ux',
          severity: 'info',
          source: { type: 'user', name: 'My UI Rules' },
          detectionMethod: 'pattern',
          pattern: 'text-6xl|text-7xl|font-size:\\s*[5-9][0-9]px',
          enabled: true,
          whyItMatters: 'Oversized headings in normal cards cause severe visual imbalance and wrap poorly.',
          howToFix: 'Use text-2xl or text-3xl for card headings.',
          groupId: 'grp_ui_rules',
        },
      ],
    };

    this.groups.set(defaultGroup.id, defaultGroup);
  }

  /**
   * Parses Markdown content into a structured UserRuleGroup (Section 6).
   */
  public static parseMarkdown(
    content: string,
    source: 'upload' | 'url' | 'pasted' | 'manual',
    fallbackTitle: string = 'Custom Rules',
    sourceUrl?: string
  ): ParseResult {
    const lines = content.split(/\r?\n/);
    const errors: string[] = [];

    let groupTitle = fallbackTitle;
    const rules: UserRuleItem[] = [];
    const groupId = `grp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    let currentRuleName: string | null = null;
    let currentDescLines: string[] = [];
    let currentSeverity: CanonicalSeverity = 'warning';
    let currentCategory: RuleCategory = 'ui-ux';
    let currentPattern: string | undefined;

    const commitCurrentRule = () => {
      if (currentRuleName) {
        const desc = currentDescLines.join(' ').trim();
        const ruleId = `usr_${currentRuleName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${rules.length + 1}`;

        // Infer detection pattern if not explicit
        let pattern = currentPattern;
        if (!pattern) {
          const lower = currentRuleName.toLowerCase() + ' ' + desc.toLowerCase();
          if (lower.includes('gradient')) pattern = 'bg-clip-text|bg-gradient|background-image:\\s*linear-gradient';
          else if (lower.includes('rounded') || lower.includes('corner radius')) pattern = 'rounded-2xl|rounded-3xl|border-radius:\\s*2[4-9]px';
          else if (lower.includes('shadow')) pattern = 'shadow-2xl|box-shadow:\\s*0\\s*2[0-9]px';
          else if (lower.includes('token') || lower.includes('color')) pattern = '#[0-9a-fA-F]{3,8}';
          else pattern = currentRuleName.split(/\s+/).slice(0, 2).join('\\s+');
        }

        rules.push({
          id: ruleId,
          name: currentRuleName,
          title: currentRuleName,
          description: desc || currentRuleName,
          category: currentCategory,
          severity: currentSeverity,
          source: { type: 'user', name: groupTitle },
          detectionMethod: 'pattern',
          pattern,
          enabled: true,
          whyItMatters: desc,
          howToFix: `Comply with project rule "${currentRuleName}".`,
          groupId,
        });
      }
      currentRuleName = null;
      currentDescLines = [];
      currentSeverity = 'warning';
      currentCategory = 'ui-ux';
      currentPattern = undefined;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Group title: # Group Title
      if (line.startsWith('# ') && !line.startsWith('## ')) {
        commitCurrentRule();
        groupTitle = line.substring(2).trim();
        continue;
      }

      // Rule heading: ## Rule Name
      if (line.startsWith('## ')) {
        commitCurrentRule();
        currentRuleName = line.substring(3).trim();
        continue;
      }

      // Check metadata lines:
      const lower = line.toLowerCase();
      if (lower.startsWith('severity:')) {
        const val = lower.replace('severity:', '').trim();
        currentSeverity = toSemanticSeverity(val);
        continue;
      }

      if (lower.startsWith('category:')) {
        const catVal = lower.replace('category:', '').trim();
        if (catVal.includes('security')) currentCategory = 'security';
        else if (catVal.includes('access') || catVal.includes('a11y')) currentCategory = 'accessibility';
        else if (catVal.includes('content') || catVal.includes('copy')) currentCategory = 'content';
        else if (catVal.includes('code')) currentCategory = 'code';
        else currentCategory = 'ui-ux';
        continue;
      }

      if (lower.startsWith('pattern:') || lower.startsWith('regex:')) {
        currentPattern = line.replace(/^(pattern|regex):/i, '').trim();
        continue;
      }

      // Otherwise, description text
      if (currentRuleName) {
        currentDescLines.push(line);
      }
    }

    commitCurrentRule();

    if (rules.length === 0) {
      errors.push('No rules could be parsed. Markdown should contain "## Rule Title" sections.');
    }

    const group: UserRuleGroup = {
      id: groupId,
      name: groupTitle,
      source,
      sourceUrl,
      importedAt: Date.now(),
      expanded: true,
      rules,
    };

    return { group, errors };
  }

  /**
   * Fetches, validates, and prepares preview for a rule document from a URL (Section 7).
   */
  public static async fetchAndValidateUrl(rawUrl: string): Promise<UrlImportPreview> {
    const trimmed = (rawUrl || '').trim();

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmed);
    } catch {
      return {
        success: false,
        url: trimmed,
        groupName: '',
        ruleCount: 0,
        previewRules: [],
        error: 'Invalid URL format.',
      };
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return {
        success: false,
        url: trimmed,
        groupName: '',
        ruleCount: 0,
        previewRules: [],
        error: 'Invalid protocol. Only HTTP and HTTPS are permitted.',
      };
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    // Block loopback, link-local, private IPs, and cloud metadata endpoints
    const isBlockedHost = (host: string): boolean => {
      if (host === 'localhost' || host === 'metadata.google.internal' || host.endsWith('.localhost')) {
        return true;
      }
      // IPv4 checks
      const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
      if (ipv4Match) {
        const [, s1, s2] = ipv4Match;
        const o1 = Number(s1);
        const o2 = Number(s2);
        if (o1 === 127) return true; // 127.0.0.0/8 Loopback
        if (o1 === 10) return true; // 10.0.0.0/8 Private
        if (o1 === 172 && o2 >= 16 && o2 <= 31) return true; // 172.16.0.0/12 Private
        if (o1 === 192 && o2 === 168) return true; // 192.168.0.0/16 Private
        if (o1 === 169 && o2 === 254) return true; // 169.254.0.0/16 Link-local / Cloud metadata (169.254.169.254)
        if (o1 === 0) return true; // 0.0.0.0/8
      }
      // IPv6 checks
      if (host === '::1' || host === '[::1]' || host.startsWith('fe80:') || host.startsWith('fc00:') || host.startsWith('fd00:')) {
        return true;
      }
      return false;
    };

    if (isBlockedHost(hostname)) {
      return {
        success: false,
        url: trimmed,
        groupName: '',
        ruleCount: 0,
        previewRules: [],
        error: 'Access to internal, loopback, or metadata network addresses is blocked for security.',
      };
    }

    try {
      const response = await fetch(trimmed, {
        headers: { Accept: 'text/markdown, text/plain, */*' },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        return {
          success: false,
          url: trimmed,
          groupName: '',
          ruleCount: 0,
          previewRules: [],
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > 1024 * 1024) {
        return {
          success: false,
          url: trimmed,
          groupName: '',
          ruleCount: 0,
          previewRules: [],
          error: 'Remote rule file exceeds maximum allowed size (1MB).',
        };
      }

      const text = await response.text();
      if (!text || text.trim().length === 0) {
        return {
          success: false,
          url: trimmed,
          groupName: '',
          ruleCount: 0,
          previewRules: [],
          error: 'Remote document is empty.',
        };
      }

      if (text.length > 1024 * 1024) {
        return {
          success: false,
          url: trimmed,
          groupName: '',
          ruleCount: 0,
          previewRules: [],
          error: 'Remote rule file exceeds maximum allowed size (1MB).',
        };
      }

      const urlObj = new URL(trimmed);
      const filename = urlObj.pathname.split('/').pop() || 'remote-rules.md';
      const fallbackTitle = `Imported: ${filename}`;

      const { group, errors } = UserRuleManager.parseMarkdown(text, 'url', fallbackTitle, trimmed);
      if (errors.length > 0 && group.rules.length === 0) {
        return {
          success: false,
          url: trimmed,
          groupName: fallbackTitle,
          ruleCount: 0,
          previewRules: [],
          error: `Malformed Markdown: ${errors.join(', ')}`,
        };
      }

      return {
        success: true,
        url: trimmed,
        groupName: group.name,
        ruleCount: group.rules.length,
        previewRules: group.rules.map(r => ({
          name: r.name,
          description: r.description,
          severity: toSemanticSeverity(r.severity),
          category: r.category,
        })),
        parsedGroup: group,
      };
    } catch (err: any) {
      return {
        success: false,
        url: trimmed,
        groupName: '',
        ruleCount: 0,
        previewRules: [],
        error: `Network failure: ${err.message || String(err)}`,
      };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Group & Rule CRUD Operations (Section 8)
  // ─────────────────────────────────────────────────────────────
  public addGroup(group: UserRuleGroup): void {
    // Avoid duplicate group IDs
    if (this.groups.has(group.id)) {
      group.id = `grp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    }
    this.groups.set(group.id, group);
  }

  public deleteGroup(groupId: string): boolean {
    return this.groups.delete(groupId);
  }

  public toggleGroupExpanded(groupId: string): void {
    const g = this.groups.get(groupId);
    if (g) {
      g.expanded = !g.expanded;
    }
  }

  public toggleRuleEnabled(groupId: string, ruleId: string): boolean {
    const g = this.groups.get(groupId);
    if (!g) return false;
    const rule = g.rules.find(r => r.id === ruleId);
    if (rule) {
      rule.enabled = !rule.enabled;
      return rule.enabled;
    }
    return false;
  }

  public deleteRule(groupId: string, ruleId: string): boolean {
    const g = this.groups.get(groupId);
    if (!g) return false;
    const initialLen = g.rules.length;
    g.rules = g.rules.filter(r => r.id !== ruleId);
    return g.rules.length < initialLen;
  }

  public editRule(groupId: string, ruleId: string, updates: Partial<UserRuleItem>): boolean {
    const g = this.groups.get(groupId);
    if (!g) return false;
    const rule = g.rules.find(r => r.id === ruleId);
    if (rule) {
      Object.assign(rule, updates);
      return true;
    }
    return false;
  }

  public getAllGroups(): UserRuleGroup[] {
    return Array.from(this.groups.values());
  }

  public getGroup(groupId: string): UserRuleGroup | undefined {
    return this.groups.get(groupId);
  }

  public getActiveRules(): UserRuleItem[] {
    const active: UserRuleItem[] = [];
    for (const g of this.groups.values()) {
      for (const r of g.rules) {
        if (r.enabled) active.push(r);
      }
    }
    return active;
  }

  public getAllRules(): UserRuleItem[] {
    const all: UserRuleItem[] = [];
    for (const g of this.groups.values()) {
      all.push(...g.rules);
    }
    return all;
  }

  /**
   * Scans a file with active user rules (Section 8).
   */
  public evaluateRulesForFile(filePath: string, sourceText: string): Finding[] {
    const findings: Finding[] = [];
    const activeRules = this.getActiveRules();
    const lines = sourceText.split(/\r?\n/);

    for (const rule of activeRules) {
      if (!rule.pattern) continue;

      try {
        const regex = new RegExp(rule.pattern, 'g');
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
          const lineText = lines[lineIdx];
          const match = regex.exec(lineText);
          if (match) {
            const startCol = match.index + 1;
            const endCol = startCol + match[0].length;
            const loc: SourceLocation = {
              filePath,
              start: { line: lineIdx + 1, column: startCol, offset: match.index },
              end: { line: lineIdx + 1, column: endCol, offset: match.index + match[0].length },
            };

            findings.push({
              id: `${rule.id}_${lineIdx + 1}`,
              ruleId: rule.id,
              category: rule.category,
              severity: rule.severity,
              semanticSeverity: toSemanticSeverity(rule.severity),
              title: rule.name,
              problemTitle: rule.title || rule.name,
              message: rule.description,
              whatIsWrong: rule.description,
              whyItMatters: rule.whyItMatters || 'Violates project user rule.',
              howToFix: rule.howToFix || 'Update code to conform to user rule conventions.',
              location: loc,
              filePath,
              startLine: lineIdx + 1,
              endLine: lineIdx + 1,
              confidence: 0.9,
              source: { type: 'user', name: rule.source.name },
              evidence: [
                {
                  kind: 'code',
                  snippet: match[0],
                  location: loc,
                  explanation: `User rule match: ${rule.name}`,
                },
              ],
              suggestions: [],
              autoFixAvailable: false,
            });
            break; // Cap to first match per line
          }
        }
      } catch {
        // Regex syntax error in user rule pattern: safely skip
      }
    }

    return findings;
  }
}
