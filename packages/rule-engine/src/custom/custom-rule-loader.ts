import * as fs from 'node:fs';
import * as path from 'node:path';
import { CraftLensRule, CustomRuleDefinition } from '@craftlens/core';
import { RuleRegistry } from '../registry/rule-registry.js';
import { parseCustomRuleContent } from './custom-rule-parser.js';
import { createRuleFromDefinition } from './custom-rule-evaluator.js';

export interface RulePack {
  name: string;
  description: string;
  rules: CustomRuleDefinition[];
}

export class CustomRuleLoader {
  /**
   * Load custom rules from .craftlens/rules/ directory and register into RuleRegistry.
   */
  public static loadCustomRulesFromDir(dirPath: string, registry: RuleRegistry): CraftLensRule[] {
    if (!fs.existsSync(dirPath)) {
      return [];
    }

    const loadedRules: CraftLensRule[] = [];

    function scanDir(currentDir: string): void {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          // If inside packs directory, treat as rule pack
          scanDir(fullPath);
        } else if (
          entry.isFile() &&
          (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml') || entry.name.endsWith('.json'))
        ) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const def = parseCustomRuleContent(content, fullPath);
            if (def && def.id && def.name && def.detection) {
              const rule = createRuleFromDefinition(def);
              registry.register(rule);
              loadedRules.push(rule);
            }
          } catch (err) {
            console.error(`Failed to parse custom rule at ${fullPath}:`, err);
          }
        }
      }
    }

    scanDir(dirPath);
    return loadedRules;
  }

  /**
   * Load a named rule pack (e.g. from a pack directory or definition).
   */
  public static loadRulePack(packDir: string, registry: RuleRegistry): RulePack | null {
    if (!fs.existsSync(packDir)) return null;

    const packName = path.basename(packDir);
    const rules: CustomRuleDefinition[] = [];
    const files = fs.readdirSync(packDir);

    for (const file of files) {
      if (file.endsWith('.yml') || file.endsWith('.yaml') || file.endsWith('.json')) {
        try {
          const content = fs.readFileSync(path.join(packDir, file), 'utf-8');
          const def = parseCustomRuleContent(content);
          if (def && def.id) {
            rules.push(def);
            const rule = createRuleFromDefinition(def);
            registry.register(rule);
          }
        } catch (e) {
          console.error(`Failed to load rule from pack ${packName}:`, e);
        }
      }
    }

    return {
      name: packName,
      description: `Rule pack from ${packDir}`,
      rules,
    };
  }
}
