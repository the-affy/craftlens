import { CraftLensRule, DetectionEngine, Platform, RuleCategory } from '@craftlens/core';

export class RuleRegistry {
  private rules = new Map<string, CraftLensRule>();

  public register(rule: CraftLensRule): void {
    if (this.rules.has(rule.id)) {
      throw new Error(`Rule with id "${rule.id}" is already registered.`);
    }
    this.rules.set(rule.id, rule);
  }

  public unregister(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  public getRule(ruleId: string): CraftLensRule | undefined {
    return this.rules.get(ruleId);
  }

  public getAllRules(): CraftLensRule[] {
    return Array.from(this.rules.values());
  }

  public getRulesByEngine(engine: DetectionEngine): CraftLensRule[] {
    return this.getAllRules().filter(r => r.engine === engine);
  }

  public getRulesByCategory(category: RuleCategory): CraftLensRule[] {
    return this.getAllRules().filter(r => r.category === category);
  }

  public getRulesForPlatform(platform: Platform): CraftLensRule[] {
    return this.getAllRules().filter(r => r.platforms.includes(platform));
  }

  public clear(): void {
    this.rules.clear();
  }

  public size(): number {
    return this.rules.size;
  }
}
