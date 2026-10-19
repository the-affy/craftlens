import { RuleRegistry } from '../registry/rule-registry.js';
import { AP_008_RULE } from './patchwork/AP-008-exception-swallowing.js';
import { AP_014_RULE } from './patchwork/AP-014-any-escape-hatch.js';
import { FN_015_RULE } from './functionality/FN-015-clickable-non-interactive.js';
import { AX_016_RULE } from './accessibility/AX-016-icon-button-name.js';
import { PH_011_RULE } from './placeholder/PH-011-lorem-ipsum.js';
import { CSS_005_RULE } from './css/CSS-005-magic-z-index.js';

export * from './patchwork/AP-008-exception-swallowing.js';
export * from './patchwork/AP-014-any-escape-hatch.js';
export * from './functionality/FN-015-clickable-non-interactive.js';
export * from './accessibility/AX-016-icon-button-name.js';
export * from './placeholder/PH-011-lorem-ipsum.js';
export * from './css/CSS-005-magic-z-index.js';

export const DEFAULT_RULES = [
  AP_008_RULE,
  AP_014_RULE,
  FN_015_RULE,
  AX_016_RULE,
  PH_011_RULE,
  CSS_005_RULE,
];

export function registerDefaultRules(registry: RuleRegistry): void {
  for (const rule of DEFAULT_RULES) {
    registry.register(rule);
  }
}
