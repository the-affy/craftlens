import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * WCAG 2.1 Relative Luminance & Contrast Ratio Calculation
 * Standard: ISO / IEC 19666:2019 / W3C WCAG 2.1 Section 1.4.3 & 1.4.11
 */
interface RGB {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): RGB {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('');
  }
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function parseRgba(rgbaStr: string): { r: number; g: number; b: number; a: number } {
  const match = rgbaStr.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (!match) return { r: 0, g: 0, b: 0, a: 1 };
  return {
    r: parseInt(match[1], 10),
    g: parseInt(match[2], 10),
    b: parseInt(match[3], 10),
    a: match[4] !== undefined ? parseFloat(match[4]) : 1,
  };
}

function blendRgbaOverRgb(fg: { r: number; g: number; b: number; a: number }, bg: RGB): RGB {
  const a = fg.a;
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
  };
}

function channelLuminance(value8Bit: number): number {
  const srgb = value8Bit / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
}

function getRelativeLuminance(rgb: RGB): number {
  return 0.2126 * channelLuminance(rgb.r) + 0.7152 * channelLuminance(rgb.g) + 0.0722 * channelLuminance(rgb.b);
}

export function getContrastRatio(color1: RGB | string, color2: RGB | string): number {
  const rgb1 = typeof color1 === 'string' ? hexToRgb(color1) : color1;
  const rgb2 = typeof color2 === 'string' ? hexToRgb(color2) : color2;

  const l1 = getRelativeLuminance(rgb1);
  const l2 = getRelativeLuminance(rgb2);

  const brighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (brighter + 0.05) / (darker + 0.05);
}

describe('CraftLens UI Contrast & Accessibility Pass (WCAG 2.1 AA)', () => {
  const darkEditorBg: RGB = { r: 30, g: 30, b: 30 }; // #1e1e1e
  const darkSidebarBg: RGB = { r: 37, g: 37, b: 38 }; // #252526
  const lightEditorBg: RGB = { r: 255, g: 255, b: 255 }; // #ffffff

  describe('1. Button Design Tokens Contrast Ratios', () => {
    it('primary button token has >= 4.5:1 contrast against white foreground in both dark and light modes', () => {
      // VS Code dark primary button: #0e639c or #007acc
      const darkPrimaryBg = hexToRgb('#007acc');
      const primaryFg = hexToRgb('#ffffff');

      const ratioDark = getContrastRatio(darkPrimaryBg, primaryFg);
      expect(ratioDark).toBeGreaterThanOrEqual(4.5);

      // VS Code light primary button: #005fb8 or #007acc
      const lightPrimaryBg = hexToRgb('#005fb8');
      const ratioLight = getContrastRatio(lightPrimaryBg, primaryFg);
      expect(ratioLight).toBeGreaterThanOrEqual(4.5);
    });

    it('secondary button text has >= 4.5:1 contrast against blended secondary button background', () => {
      // Dark mode: rgba(255, 255, 255, 0.08) over #252526
      const secBgDark = blendRgbaOverRgb({ r: 255, g: 255, b: 255, a: 0.08 }, darkSidebarBg);
      const secFgDark = hexToRgb('#ffffff');
      const ratioDark = getContrastRatio(secBgDark, secFgDark);
      expect(ratioDark).toBeGreaterThanOrEqual(4.5);

      // Light mode: rgba(0, 0, 0, 0.06) over #ffffff
      const secBgLight = blendRgbaOverRgb({ r: 0, g: 0, b: 0, a: 0.06 }, lightEditorBg);
      const secFgLight = hexToRgb('#1f2328');
      const ratioLight = getContrastRatio(secBgLight, secFgLight);
      expect(ratioLight).toBeGreaterThanOrEqual(4.5);
    });

    it('focus border token has >= 3:1 contrast against dark editor and sidebar backgrounds', () => {
      const focusBorder = hexToRgb('#007acc');
      const ratioEditor = getContrastRatio(focusBorder, darkEditorBg);
      const ratioSidebar = getContrastRatio(focusBorder, darkSidebarBg);

      expect(ratioEditor).toBeGreaterThanOrEqual(3.0);
      expect(ratioSidebar).toBeGreaterThanOrEqual(3.0);
    });
  });

  describe('2. Severity Badges & Status Color Accessibility', () => {
    it('error / blocker text colors have >= 4.5:1 contrast against dark background', () => {
      const errorForeground = hexToRgb('#f87171'); // VS Code dark error foreground
      const ratio = getContrastRatio(errorForeground, darkEditorBg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('info and suggestion text colors have >= 4.5:1 contrast against dark background', () => {
      const infoForeground = hexToRgb('#60a5fa'); // VS Code editorInfo foreground
      const ratio = getContrastRatio(infoForeground, darkEditorBg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('status success text color has >= 4.5:1 contrast against dark background', () => {
      const successForeground = hexToRgb('#34d399'); // VS Code testing-iconPassed
      const ratio = getContrastRatio(successForeground, darkEditorBg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('subtle diff tint background (0.08 alpha) preserves >= 4.5:1 contrast for foreground text', () => {
      // Deletion: 0.08 red over dark editor background
      const diffDelBg = blendRgbaOverRgb({ r: 239, g: 68, b: 68, a: 0.08 }, darkEditorBg);
      const diffDelFg = hexToRgb('#f87171');
      const delRatio = getContrastRatio(diffDelBg, diffDelFg);
      expect(delRatio).toBeGreaterThanOrEqual(4.5);

      // Addition: 0.08 green over dark editor background
      const diffAddBg = blendRgbaOverRgb({ r: 16, g: 185, b: 129, a: 0.08 }, darkEditorBg);
      const diffAddFg = hexToRgb('#34d399');
      const addRatio = getContrastRatio(diffAddBg, diffAddFg);
      expect(addRatio).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe('3. Self-Audit of UI Source Code for Contrast & Accessibility Requirements', () => {
    const overviewPanelPath = path.resolve(__dirname, '../../apps/vscode-extension/src/overview/project-overview-panel.ts');
    const sidebarProviderPath = path.resolve(__dirname, '../../apps/vscode-extension/src/sidebar/sidebar-provider.ts');
    const detailPanelPath = path.resolve(__dirname, '../../apps/vscode-extension/src/sidebar/detail-panel-provider.ts');

    const overviewSrc = fs.readFileSync(overviewPanelPath, 'utf-8');
    const sidebarSrc = fs.readFileSync(sidebarProviderPath, 'utf-8');
    const detailSrc = fs.readFileSync(detailPanelPath, 'utf-8');

    it('.use-skill-btn uses native VS Code button tokens rather than uncalibrated lavender', () => {
      // Must not set background: var(--skill-purple); with color: var(--fg);
      expect(overviewSrc).not.toMatch(/\.use-skill-btn\s*\{[^}]*background:\s*var\(--skill-purple\)[^}]*color:\s*var\(--fg\)/);
      // Must use standard button background and foreground
      expect(overviewSrc).toContain('background: var(--vscode-button-background);');
      expect(overviewSrc).toContain('color: var(--vscode-button-foreground);');
    });

    it('all interactive element classes include :focus-visible rules with focus border', () => {
      expect(overviewSrc).toContain(':focus-visible');
      expect(sidebarSrc).toContain(':focus-visible');
      expect(detailSrc).toContain(':focus-visible');

      // Check specific elements have focus indicators
      expect(sidebarSrc).toContain('.nav-btn:focus-visible');
      expect(sidebarSrc).toContain('.filter-tag:focus-visible');
      expect(sidebarSrc).toContain('.search-input:focus, .search-input:focus-visible');
      expect(sidebarSrc).toContain('.btn:focus-visible');
      expect(overviewSrc).toContain('.scan-btn:focus-visible');
      expect(overviewSrc).toContain('.panel-tab:focus-visible');
      expect(overviewSrc).toContain('.artifact-row-btn:focus-visible');
    });

    it('diff backgrounds use subtle tinting (0.08 alpha) for code readability', () => {
      expect(overviewSrc).toContain('rgba(16, 185, 129, 0.08)');
      expect(overviewSrc).toContain('rgba(239, 68, 68, 0.08)');
      expect(detailSrc).toContain('rgba(16, 185, 129, 0.08)');
      expect(detailSrc).toContain('rgba(239, 68, 68, 0.08)');
    });

    it('secondary button text has guaranteed high-contrast fallback', () => {
      expect(sidebarSrc).toContain('var(--vscode-button-secondaryForeground, currentColor)');
    });

    it('zero references to obsolete problems.md in UI markup and action handlers', () => {
      // In sidebar markup
      expect(sidebarSrc).not.toContain('View problems.md');
      expect(sidebarSrc).not.toContain('View suggestion.md');
      expect(sidebarSrc).toContain('View issues.md');
      expect(sidebarSrc).toContain('View suggestions.md');

      // In overview panel markup
      expect(overviewSrc).not.toContain('problems.md');
      expect(overviewSrc).toContain('issues.md');
      expect(overviewSrc).toContain('suggestions.md');
    });
  });
});

