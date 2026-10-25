export interface SuppressionRule {
  ruleId?: string; // undefined means all rules
  line?: number;
  startLine?: number;
  endLine?: number;
}

export class SuppressionManager {
  private fileLevelDisabled = false;
  private disabledRulesForFile = new Set<string>();
  private nextLineSuppressions = new Map<number, Set<string> | 'all'>();
  private currentLineSuppressions = new Map<number, Set<string> | 'all'>();
  private rangeSuppressions: { ruleId?: string; startLine: number; endLine: number }[] = [];

  constructor(sourceText: string) {
    this.parseComments(sourceText);
  }

  private parseComments(sourceText: string): void {
    const lines = sourceText.split(/\r?\n/);
    const openRanges = new Map<string, number>(); // ruleId or 'all' -> startLine

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const line = lines[i];

      // Match: // craftlens-disable-next-line [ruleIds...]
      const nextLineMatch = line.match(/\/\/\s*craftlens-(?:disable|ignore)-next-line(?:\s+([a-zA-Z0-9_.,\s-]+))?/i);
      if (nextLineMatch) {
        const rules = nextLineMatch[1] ? this.parseRuleList(nextLineMatch[1]) : 'all';
        this.nextLineSuppressions.set(lineNum + 1, rules);
        continue;
      }

      // Match: // craftlens-disable-line [ruleIds...]
      const currentLineMatch = line.match(/\/\/\s*craftlens-(?:disable|ignore)-line(?:\s+([a-zA-Z0-9_.,\s-]+))?/i);
      if (currentLineMatch) {
        const rules = currentLineMatch[1] ? this.parseRuleList(currentLineMatch[1]) : 'all';
        this.currentLineSuppressions.set(lineNum, rules);
        continue;
      }

      // Match: // craftlens-ignore [ruleIds...] on the same line
      const lineIgnoreMatch = line.match(/\/\/\s*craftlens-ignore(?:\s+([a-zA-Z0-9_.,\s-]+))?$/i);
      if (lineIgnoreMatch) {
        const rules = lineIgnoreMatch[1] ? this.parseRuleList(lineIgnoreMatch[1]) : 'all';
        this.currentLineSuppressions.set(lineNum, rules);
        continue;
      }

      // Match: // craftlens-disable [ruleIds...]
      const lineDisableMatch = line.match(/\/\/\s*craftlens-disable(?:\s+([a-zA-Z0-9_.,\s-]+))?$/i);
      if (lineDisableMatch) {
        const rules = lineDisableMatch[1] ? this.parseRuleList(lineDisableMatch[1]) : 'all';
        if (rules === 'all') {
          openRanges.set('all', lineNum);
        } else {
          for (const r of rules) {
            openRanges.set(r, lineNum);
          }
        }
        continue;
      }

      // Match: /* craftlens-disable [ruleIds...] */
      const disableBlockMatch = line.match(/\/\*\s*craftlens-(?:disable|ignore)(?:\s+([a-zA-Z0-9_.,\s-]+))?\s*\*\//i);
      if (disableBlockMatch) {
        const rules = disableBlockMatch[1] ? this.parseRuleList(disableBlockMatch[1]) : 'all';
        this.currentLineSuppressions.set(lineNum, rules);
        continue;
      }

      // Match: /* craftlens-enable [ruleIds...] */
      const enableBlockMatch = line.match(/\/\*\s*craftlens-enable(?:\s+([a-zA-Z0-9_.,\s-]+))?\s*\*\//i);
      if (enableBlockMatch) {
        const rules = enableBlockMatch[1] ? this.parseRuleList(enableBlockMatch[1]) : 'all';
        if (rules === 'all') {
          const start = openRanges.get('all');
          if (start !== undefined) {
            this.rangeSuppressions.push({ startLine: start, endLine: lineNum });
            openRanges.delete('all');
          }
        } else {
          for (const r of rules) {
            const start = openRanges.get(r);
            if (start !== undefined) {
              this.rangeSuppressions.push({ ruleId: r, startLine: start, endLine: lineNum });
              openRanges.delete(r);
            }
          }
        }
        continue;
      }

      // Match top of file: /* craftlens-disable-file [ruleIds...] */
      const disableFileMatch = line.match(/\/\*\s*craftlens-(?:disable|ignore)-file(?:\s+([a-zA-Z0-9_.,\s-]+))?\s*\*\//i);
      if (disableFileMatch) {
        const rules = disableFileMatch[1] ? this.parseRuleList(disableFileMatch[1]) : 'all';
        if (rules === 'all') {
          this.fileLevelDisabled = true;
        } else {
          for (const r of rules) {
            this.disabledRulesForFile.add(r);
          }
        }
      }
    }

    // Close any unclosed ranges to EOF
    for (const [key, startLine] of openRanges.entries()) {
      this.rangeSuppressions.push({
        ruleId: key === 'all' ? undefined : key,
        startLine,
        endLine: lines.length,
      });
    }
  }

  private parseRuleList(str: string): Set<string> {
    const cleaned = str.replace(/--.*$/, '').replace(/#.*$/, '');
    const list = cleaned
      .split(/[,\s]+/)
      .map(s => s.trim())
      .filter(s => Boolean(s) && /^[A-Za-z0-9_.-]+$/.test(s));
    return new Set(list);
  }

  public isSuppressed(ruleId: string, line: number): boolean {
    if (this.fileLevelDisabled) return true;
    if (this.disabledRulesForFile.has(ruleId)) return true;

    // Check next-line suppression
    const nextLineRule = this.nextLineSuppressions.get(line);
    if (nextLineRule === 'all' || (nextLineRule && nextLineRule.has(ruleId))) {
      return true;
    }

    // Check current-line suppression
    const currentLineRule = this.currentLineSuppressions.get(line);
    if (currentLineRule === 'all' || (currentLineRule && currentLineRule.has(ruleId))) {
      return true;
    }

    // Check range suppression
    for (const range of this.rangeSuppressions) {
      if (line >= range.startLine && line <= range.endLine) {
        if (!range.ruleId || range.ruleId === ruleId) {
          return true;
        }
      }
    }

    return false;
  }
}
