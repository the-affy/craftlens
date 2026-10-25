import { RuleRegistry } from '../registry/rule-registry.js';
import { AP_008_RULE } from './patchwork/AP-008-exception-swallowing.js';
import { AP_014_RULE } from './patchwork/AP-014-any-escape-hatch.js';
import { FN_015_RULE } from './functionality/FN-015-clickable-non-interactive.js';
import { AX_016_RULE } from './accessibility/AX-016-icon-button-name.js';
import { PH_011_RULE } from './placeholder/PH-011-lorem-ipsum.js';
import { CSS_005_RULE } from './css/CSS-005-magic-z-index.js';
import { VH_007_RULE } from './hierarchy/VH-007-multiple-primary-actions.js';
import { VH_008_RULE } from './hierarchy/VH-008-information-hierarchy-mismatch.js';
import { CP_007_RULE } from './hierarchy/CP-007-excessive-card-usage.js';
import { CP_008_RULE } from './hierarchy/CP-008-card-inside-card.js';
import { CX_013_RULE } from './consistency/CX-013-existing-component-reused.js';
import { CX_004_RULE } from './consistency/CX-004-spacing-scale-violation.js';
import { CX_005_RULE } from './consistency/CX-005-radius-violates-system.js';
import { ID_001_RULE } from './intent/ID-001-decorative-without-purpose.js';
import { ID_004_RULE } from './intent/ID-004-cta-without-outcome.js';
import { ID_005_RULE } from './intent/ID-005-information-without-decision.js';
import { CD_001_RULE } from './code/CD-001-chained-type-assertions.js';
import { RE_001_RULE } from './react/RE-001-effect-for-derived-value.js';
import { SEC_001_RULE } from './security/SEC-001-exposed-secret.js';
import { UX_017_RULE } from './functionality/UX-017-nested-interactive-elements.js';
import { UX_018_RULE } from './accessibility/UX-018-missing-form-label.js';
import { UX_019_RULE } from './functionality/UX-019-unspecified-button-type.js';
import { UI_006_RULE } from './css/UI-006-transition-all-slop.js';
import { UI_009_RULE } from './css/UI-009-fixed-container-width.js';

// New UI / UX Rules
import { UI_001_RULE } from './visual-slop/UI-001-generic-ai-gradient.js';
import { UI_002_RULE } from './visual-slop/UI-002-decorative-glow.js';
import { UI_003_RULE } from './visual-slop/UI-003-glassmorphism.js';
import { UI_004_RULE } from './visual-slop/UI-004-excessive-rounded.js';
import { UI_005_RULE } from './visual-slop/UI-005-excessive-shadows.js';
import { UI_009_BADGES_RULE } from './visual-slop/UI-009-excessive-badges.js';
import { UI_010_EMOJI_RULE } from './visual-slop/UI-010-emoji-decoration.js';
import { UI_013_RULE } from './visual-slop/UI-013-trend-stacking.js';
import { UI_014_RULE } from './visual-slop/UI-014-visual-treatment-overload.js';
import { UI_015_RULE } from './visual-slop/UI-015-template-fingerprint.js';
import { UI_016_RULE } from './visual-slop/UI-016-ai-signature-stack.js';
import { UI_017_RULE } from './visual-slop/UI-017-badge-saturation.js';
import { UI_019_RULE } from './visual-slop/UI-019-fake-product-signals.js';
import { UI_020_RULE } from './visual-slop/UI-020-design-convergence.js';
import { UI_022_RULE } from './visual-slop/UI-022-responsive-overflow.js';
import { TY_001_RULE } from './typography/TY-001-arbitrary-font-size.js';
import { TY_003_RULE } from './typography/TY-003-excessive-all-caps.js';
import { IX_002_RULE } from './interaction/IX-002-missing-focus-visible.js';
import { IX_006_RULE } from './interaction/IX-006-navigation-without-destination.js';
import { ST_001_RULE } from './state/ST-001-missing-loading-state.js';
import { ST_002_RULE } from './state/ST-002-missing-empty-state.js';
import { ST_003_RULE } from './state/ST-003-missing-error-state.js';
import { CP_002_RULE } from './copy/CP-002-vague-cta.js';
import { CP_006_RULE } from './copy/CP-006-ai-cliche.js';
import { CL_001_RULE } from './visual-slop/CL-001-low-contrast-text.js';
import { CL_002_RULE } from './visual-slop/CL-002-pure-black-slop.js';
import { CL_003_RULE } from './visual-slop/CL-003-harsh-neon-border.js';
import { LY_001_RULE } from './visual-slop/LY-001-centered-layout-slop.js';
import { LY_002_RULE } from './visual-slop/LY-002-non-responsive-grid.js';

// Security Rules
import { SEC_002_RULE } from './security/SEC-002-insecure-storage.js';
import { SEC_003_RULE } from './security/SEC-003-dangerous-html.js';
import { SEC_B01_RULE } from './security/SEC-B01-missing-authorization.js';
import { SEC_P01_RULE } from './security/SEC-P01-error-stack-leakage.js';

export * from './patchwork/AP-008-exception-swallowing.js';
export * from './patchwork/AP-014-any-escape-hatch.js';
export * from './functionality/FN-015-clickable-non-interactive.js';
export * from './accessibility/AX-016-icon-button-name.js';
export * from './placeholder/PH-011-lorem-ipsum.js';
export * from './css/CSS-005-magic-z-index.js';
export * from './hierarchy/VH-007-multiple-primary-actions.js';
export * from './hierarchy/VH-008-information-hierarchy-mismatch.js';
export * from './hierarchy/CP-007-excessive-card-usage.js';
export * from './hierarchy/CP-008-card-inside-card.js';
export * from './consistency/CX-013-existing-component-reused.js';
export * from './consistency/CX-004-spacing-scale-violation.js';
export * from './consistency/CX-005-radius-violates-system.js';
export * from './intent/ID-001-decorative-without-purpose.js';
export * from './intent/ID-004-cta-without-outcome.js';
export * from './intent/ID-005-information-without-decision.js';
export * from './code/CD-001-chained-type-assertions.js';
export * from './react/RE-001-effect-for-derived-value.js';
export * from './security/SEC-001-exposed-secret.js';
export * from './functionality/UX-017-nested-interactive-elements.js';
export * from './accessibility/UX-018-missing-form-label.js';
export * from './functionality/UX-019-unspecified-button-type.js';
export * from './css/UI-006-transition-all-slop.js';
export * from './css/UI-009-fixed-container-width.js';

export * from './visual-slop/UI-001-generic-ai-gradient.js';
export * from './visual-slop/UI-002-decorative-glow.js';
export * from './visual-slop/UI-003-glassmorphism.js';
export * from './visual-slop/UI-004-excessive-rounded.js';
export * from './visual-slop/UI-005-excessive-shadows.js';
export * from './visual-slop/UI-009-excessive-badges.js';
export * from './visual-slop/UI-010-emoji-decoration.js';
export * from './visual-slop/UI-013-trend-stacking.js';
export * from './visual-slop/UI-014-visual-treatment-overload.js';
export * from './visual-slop/UI-015-template-fingerprint.js';
export * from './visual-slop/UI-016-ai-signature-stack.js';
export * from './visual-slop/UI-017-badge-saturation.js';
export * from './visual-slop/UI-019-fake-product-signals.js';
export * from './visual-slop/UI-020-design-convergence.js';
export * from './visual-slop/UI-022-responsive-overflow.js';
export * from './typography/TY-001-arbitrary-font-size.js';
export * from './typography/TY-003-excessive-all-caps.js';
export * from './interaction/IX-002-missing-focus-visible.js';
export * from './interaction/IX-006-navigation-without-destination.js';
export * from './state/ST-001-missing-loading-state.js';
export * from './state/ST-002-missing-empty-state.js';
export * from './state/ST-003-missing-error-state.js';
export * from './copy/CP-002-vague-cta.js';
export * from './copy/CP-006-ai-cliche.js';
export * from './visual-slop/CL-001-low-contrast-text.js';
export * from './visual-slop/CL-002-pure-black-slop.js';
export * from './visual-slop/CL-003-harsh-neon-border.js';
export * from './visual-slop/LY-001-centered-layout-slop.js';
export * from './visual-slop/LY-002-non-responsive-grid.js';
export * from './security/SEC-002-insecure-storage.js';
export * from './security/SEC-003-dangerous-html.js';
export * from './security/SEC-B01-missing-authorization.js';
export * from './security/SEC-P01-error-stack-leakage.js';

export const DEFAULT_RULES = [
  AP_008_RULE,
  AP_014_RULE,
  FN_015_RULE,
  AX_016_RULE,
  PH_011_RULE,
  CSS_005_RULE,
  VH_007_RULE,
  VH_008_RULE,
  CP_007_RULE,
  CP_008_RULE,
  CX_013_RULE,
  CX_004_RULE,
  CX_005_RULE,
  ID_001_RULE,
  ID_004_RULE,
  ID_005_RULE,
  CD_001_RULE,
  RE_001_RULE,
  SEC_001_RULE,
  UX_017_RULE,
  UX_018_RULE,
  UX_019_RULE,
  UI_006_RULE,
  UI_009_RULE,
  // Registered UI / UX Rules
  UI_001_RULE,
  UI_002_RULE,
  UI_003_RULE,
  UI_004_RULE,
  UI_005_RULE,
  UI_009_BADGES_RULE,
  UI_010_EMOJI_RULE,
  UI_013_RULE,
  UI_014_RULE,
  UI_015_RULE,
  UI_016_RULE,
  UI_017_RULE,
  UI_019_RULE,
  UI_020_RULE,
  UI_022_RULE,
  TY_001_RULE,
  TY_003_RULE,
  IX_002_RULE,
  IX_006_RULE,
  ST_001_RULE,
  ST_002_RULE,
  ST_003_RULE,
  CP_002_RULE,
  CP_006_RULE,
  // New Color and Layout Active UI Slop Rules
  CL_001_RULE,
  CL_002_RULE,
  CL_003_RULE,
  LY_001_RULE,
  LY_002_RULE,
  // Registered Security Rules
  SEC_002_RULE,
  SEC_003_RULE,
  SEC_B01_RULE,
  SEC_P01_RULE,
];

export function registerDefaultRules(registry: RuleRegistry): void {
  for (const rule of DEFAULT_RULES) {
    registry.register(rule);
  }
}


