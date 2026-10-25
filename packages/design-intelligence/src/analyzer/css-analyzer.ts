import { ProjectDesignBaseline, ProjectDesignSystem } from '@craftlens/core';

export interface SpacingFinding {
  value: number;
  raw: string;
  property: string;
  line: number;
  column: number;
  nearestStandard: number;
}

export interface RadiusFinding {
  value: number;
  raw: string;
  line: number;
  column: number;
  nearestStandard: number;
}

export interface ColorFinding {
  color: string;
  isHex: boolean;
  isGradient: boolean;
  line: number;
  column: number;
  matchedToken?: string;
}

export class CssAnalyzer {
  /**
   * Extract arbitrary or non-standard pixel spacing values from className or style attributes.
   */
  public static findNonStandardSpacing(
    sourceText: string,
    baseline: ProjectDesignBaseline
  ): SpacingFinding[] {
    const findings: SpacingFinding[] = [];
    const validSpacing = new Set(baseline.spacing);

    // 1. Check arbitrary Tailwind spacing: e.g. p-[17px], m-[23px], gap-[13px]
    const tailwindArbitraryRegex = /\b(p|m|gap|px|py|pl|pr|pt|pb|mx|my|mt|mb|ml|mr)-\[(\d+)px\]/g;
    let match: RegExpExecArray | null;

    while ((match = tailwindArbitraryRegex.exec(sourceText)) !== null) {
      const val = parseInt(match[2], 10);
      if (!validSpacing.has(val)) {
        const { line, column } = this.getLineAndColumn(sourceText, match.index);
        findings.push({
          value: val,
          raw: match[0],
          property: match[1],
          line,
          column,
          nearestStandard: this.findNearest(val, baseline.spacing),
        });
      }
    }

    // 2. Check inline styles: e.g. padding: 13, margin: '19px'
    const inlineSpacingRegex = /\b(padding|margin|gap)\s*:\s*['"]?(\d+)px?['"]?/g;
    while ((match = inlineSpacingRegex.exec(sourceText)) !== null) {
      const val = parseInt(match[2], 10);
      if (!validSpacing.has(val)) {
        const { line, column } = this.getLineAndColumn(sourceText, match.index);
        findings.push({
          value: val,
          raw: match[0],
          property: match[1],
          line,
          column,
          nearestStandard: this.findNearest(val, baseline.spacing),
        });
      }
    }

    return findings;
  }

  /**
   * Extract arbitrary or non-standard border radius values.
   */
  public static findNonStandardRadius(
    sourceText: string,
    baseline: ProjectDesignBaseline
  ): RadiusFinding[] {
    const findings: RadiusFinding[] = [];
    const validRadii = new Set(baseline.radius);

    // 1. Tailwind arbitrary rounded: e.g. rounded-[21px]
    const tailwindRadiusRegex = /\brounded(?:-[a-z]+)?-\[(\d+)px\]/g;
    let match: RegExpExecArray | null;

    while ((match = tailwindRadiusRegex.exec(sourceText)) !== null) {
      const val = parseInt(match[1], 10);
      if (!validRadii.has(val)) {
        const { line, column } = this.getLineAndColumn(sourceText, match.index);
        findings.push({
          value: val,
          raw: match[0],
          line,
          column,
          nearestStandard: this.findNearest(val, baseline.radius),
        });
      }
    }

    // 2. Inline style borderRadius: e.g. borderRadius: 19
    const inlineRadiusRegex = /\bborderRadius\s*:\s*['"]?(\d+)px?['"]?/g;
    while ((match = inlineRadiusRegex.exec(sourceText)) !== null) {
      const val = parseInt(match[1], 10);
      if (!validRadii.has(val)) {
        const { line, column } = this.getLineAndColumn(sourceText, match.index);
        findings.push({
          value: val,
          raw: match[0],
          line,
          column,
          nearestStandard: this.findNearest(val, baseline.radius),
        });
      }
    }

    return findings;
  }

  /**
   * Detect gradients and raw arbitrary hex colors.
   */
  public static findGradientsAndColors(sourceText: string): ColorFinding[] {
    const findings: ColorFinding[] = [];

    // 1. Gradients
    const gradientRegex = /(linear-gradient\([^)]+\)|bg-gradient-to-[a-z]+)/g;
    let match: RegExpExecArray | null;

    while ((match = gradientRegex.exec(sourceText)) !== null) {
      const { line, column } = this.getLineAndColumn(sourceText, match.index);
      findings.push({
        color: match[0],
        isHex: false,
        isGradient: true,
        line,
        column,
      });
    }

    // 2. Raw hex colors: e.g. #7c3aed, bg-[#7c3aed]
    const hexRegex = /(?:#|bg-\[#|text-\[#)([0-9a-fA-F]{3,8})/g;
    while ((match = hexRegex.exec(sourceText)) !== null) {
      const { line, column } = this.getLineAndColumn(sourceText, match.index);
      findings.push({
        color: `#${match[1]}`,
        isHex: true,
        isGradient: false,
        line,
        column,
      });
    }

    return findings;
  }

  private static findNearest(target: number, validValues: number[]): number {
    if (validValues.length === 0) return 8;
    return validValues.reduce((prev, curr) =>
      Math.abs(curr - target) < Math.abs(prev - target) ? curr : prev
    );
  }

  private static getLineAndColumn(text: string, index: number): { line: number; column: number } {
    let line = 1;
    let column = 1;
    for (let i = 0; i < index; i++) {
      if (text[i] === '\n') {
        line++;
        column = 1;
      } else {
        column++;
      }
    }
    return { line, column };
  }
}
