import { AntiSlopRule, DetectionEngine, Platform, RuleCategory } from '@anti-slop/core';

export class RuleRegistry {
  private rules = new Map<string, AntiSlopRule>();

  public register(rule: AntiSlopRule): void {
    if (this.rules.has(rule.id)) {
      throw new Error(`Rule with id "${rule.id}" is already registered.`);
    }
    this.rules.set(rule.id, rule);
  }

  public unregister(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  public getRule(ruleId: string): AntiSlopRule | undefined {
    return this.rules.get(ruleId);
  }

  public getAllRules(): AntiSlopRule[] {
    return Array.from(this.rules.values());
  }

  public getRulesByEngine(engine: DetectionEngine): AntiSlopRule[] {
    return this.getAllRules().filter(r => r.engine === engine);
  }

  public getRulesByCategory(category: RuleCategory): AntiSlopRule[] {
    return this.getAllRules().filter(r => r.category === category);
  }

  public getRulesForPlatform(platform: Platform): AntiSlopRule[] {
    return this.getAllRules().filter(r => r.platforms.includes(platform));
  }

  public clear(): void {
    this.rules.clear();
  }

  public size(): number {
    return this.rules.size;
  }
}
