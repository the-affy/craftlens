import { RuleRegistry } from '../registry/rule-registry.js';
import { AP_008_RULE } from './patchwork/AP-008-exception-swallowing.js';
import { AP_014_RULE } from './patchwork/AP-014-any-escape-hatch.js';
import { FN_015_RULE } from './functionality/FN-015-clickable-non-interactive.js';

export * from './patchwork/AP-008-exception-swallowing.js';
export * from './patchwork/AP-014-any-escape-hatch.js';
export * from './functionality/FN-015-clickable-non-interactive.js';

export const DEFAULT_RULES = [
  AP_008_RULE,
  AP_014_RULE,
  FN_015_RULE,
];

export function registerDefaultRules(registry: RuleRegistry): void {
  for (const rule of DEFAULT_RULES) {
    registry.register(rule);
  }
}
