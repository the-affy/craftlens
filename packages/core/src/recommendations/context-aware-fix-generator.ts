import { Finding, Suggestion } from '../types/finding.js';
import { ProjectContext } from '../types/context.js';

export class ContextAwareFixGenerator {
  /**
   * Generates up to 3 context-aware suggested actions for a finding (Section 2 & 3).
   * Never shows fake or generic "Apply Fix" actions.
   */
  public static generateSuggestions(
    finding: Finding,
    projectContext?: ProjectContext,
    sourceText?: string
  ): Suggestion[] {
    const suggestions: Suggestion[] = [];
    const ruleId = (finding.ruleId || '').toUpperCase();
    const snippet = (finding.evidence?.[0]?.snippet || finding.message || '').trim();
    const tokenMap = projectContext?.learnedConventions?.colorMap || {};
    const preferredComps = projectContext?.learnedConventions?.preferredComponents || {};

    const hexMatch = snippet.match(/#([0-9a-fA-F]{3,8})\b/) || finding.message.match(/#([0-9a-fA-F]{3,8})\b/);
    const isColorFinding = Boolean(
      hexMatch &&
      (/color|hex/i.test(finding.message) || /color|hex/i.test(finding.title || '') || /color|hex/i.test(finding.problemTitle || '') || ruleId.includes('COLOR')) &&
      !/gradient pattern/i.test(finding.title || '') &&
      !/gradient pattern/i.test(finding.message || '')
    );

    // ─────────────────────────────────────────────────────────────
    // 0. AI Gradient Pattern Detected
    // ─────────────────────────────────────────────────────────────
    if (!isColorFinding && (/gradient/i.test(finding.message) || /gradient/i.test(finding.title || '') || /gradient/i.test(finding.problemTitle || '') || /gradient/i.test(snippet))) {
      const surfaceToken = projectContext?.learnedConventions?.colorMap?.['background'] || 'var(--surface-raised, #1e293b)';
      const isLinearGrad = snippet.includes('linear-gradient');
      const isTailwindGrad = /bg-gradient-to-[a-z]+/.test(snippet);
      const replacement = isLinearGrad ? surfaceToken : isTailwindGrad ? 'bg-slate-900 border border-slate-800' : surfaceToken;

      suggestions.push({
        id: `sug_${finding.id || ruleId}_1`,
        title: 'Replace generic gradient with grounded surface',
        explanation: "Replace the decorative gradient with the project's existing surface/background treatment.",
        type: 'autofix',
        confidence: 0.95,
        safe: true,
        actionLabel: 'Apply Fix',
        replacement: replacement,
        previewDiff: snippet ? `- ${snippet}\n+ ${replacement}` : `+ ${replacement}`,
      });

      suggestions.push({
        id: `sug_${finding.id || ruleId}_2`,
        title: 'Grounded neutral card surface',
        explanation: 'Uses a subtle border and solid background to reserve color for interactive calls-to-action.',
        type: 'replace',
        confidence: 0.88,
        safe: false,
        actionLabel: 'Replace',
        replacement: 'bg-card text-card-foreground',
      });

      suggestions.push({
        id: `sug_${finding.id || ruleId}_3`,
        title: 'Keep gradient if intentional hero artwork',
        explanation: 'Valid if this container is a top-level marketing hero banner.',
        type: 'manual',
        confidence: 0.70,
        safe: false,
        actionLabel: 'Keep value',
      });

      return suggestions.slice(0, 3);
    }

    // ─────────────────────────────────────────────────────────────
    // 1. Hard-coded Colors (Section 2 & 20)
    // ─────────────────────────────────────────────────────────────
    if (hexMatch || ruleId === 'UI-006' || ruleId === 'UI-009' || ruleId === 'CP-008') {
      const hex = hexMatch ? `#${hexMatch[1]}` : '#6B7280';
      const normalizedHex = hex.toLowerCase();
      const detectedToken = tokenMap[normalizedHex] || (normalizedHex === '#6b7280' ? '--color-text-muted' : undefined);

      if (detectedToken) {
        finding.detectedToken = {
          name: detectedToken.replace(/^--/, ''),
          value: hex,
          type: 'color',
        };

        suggestions.push({
          id: `sug_${finding.id || ruleId}_1`,
          title: `Use existing token ${detectedToken}`,
          explanation: `Matches the existing design token system (${detectedToken}) instead of hardcoding ${hex}.`,
          type: 'autofix',
          confidence: 0.96,
          safe: true,
          actionLabel: 'Apply',
          replacement: `var(${detectedToken})`,
          previewDiff: `- color: ${hex};\n+ color: var(${detectedToken});`,
        });
      } else if (projectContext?.cssStrategy === 'tailwind') {
        suggestions.push({
          id: `sug_${finding.id || ruleId}_1`,
          title: `Replace with semantic text-muted utility`,
          explanation: 'Keeps the element compatible with dark mode and theme configuration.',
          type: 'replace',
          confidence: 0.88,
          safe: true,
          actionLabel: 'Replace',
          replacement: 'text-muted-foreground',
          previewDiff: `- text-[${hex}]\n+ text-muted-foreground`,
        });
      } else {
        // If inside a CSS property value or gradient, the in-place replacement must be a token reference, never a declaration with a semicolon
        const inPlaceReplacement = 'var(--color-accent)';

        suggestions.push({
          id: `sug_${finding.id || ruleId}_1`,
          title: `Use color token var(--color-accent)`,
          explanation: `Replaces hardcoded ${hex} with a design token reference. Define --color-accent in :root to maintain a single source of truth.`,
          type: 'autofix',
          confidence: 0.85,
          safe: true,
          actionLabel: 'Apply',
          replacement: inPlaceReplacement,
          previewDiff: `- ${hex}\n+ ${inPlaceReplacement}`,
        });
      }

      suggestions.push({
        id: `sug_${finding.id || ruleId}_2`,
        title: `Extract ${hex} into theme color variable`,
        explanation: 'Enables dark mode switching and consistent visual brand palette across components. Define in :root.',
        type: 'manual',
        confidence: 0.80,
        safe: false,
        actionLabel: 'Keep value',
      });

      suggestions.push({
        id: `sug_${finding.id || ruleId}_3`,
        title: `Keep value if intentionally standalone`,
        explanation: 'Valid if this element has unique, non-themeable brand or graphic design intent.',
        type: 'manual',
        confidence: 0.70,
        safe: false,
        actionLabel: 'Keep value',
      });

      return suggestions.slice(0, 3);
    }

    // ─────────────────────────────────────────────────────────────
    // 2. Button Missing Accessible Name (Section 2)
    // ─────────────────────────────────────────────────────────────
    if (ruleId.startsWith('AX-') || ruleId === 'FN-015' || /accessible name|aria-label|clickable/i.test(finding.message)) {
      suggestions.push({
        id: `sug_${finding.id || ruleId}_1`,
        title: 'Add aria-label based on button action',
        explanation: 'Provides screen readers with a clear accessible label without modifying visual UI layout.',
        type: 'autofix',
        confidence: 0.94,
        safe: true,
        actionLabel: 'Apply',
        replacement: 'aria-label="Perform action"',
        previewDiff: snippet.includes('<button')
          ? `- ${snippet}\n+ ${snippet.replace('<button', '<button aria-label="Perform action"')}`
          : '+ aria-label="Perform action"',
      });

      suggestions.push({
        id: `sug_${finding.id || ruleId}_2`,
        title: 'Add visible text label inside button',
        explanation: 'Improves clarity for all users, including keyboard-only and cognitive accessibility.',
        type: 'insert',
        confidence: 0.85,
        safe: false,
        actionLabel: 'Insert',
        replacement: '<span>Action</span>',
      });

      const buttonComponent = preferredComps['button'] || 'Button';
      suggestions.push({
        id: `sug_${finding.id || ruleId}_3`,
        title: `Use existing accessible <${buttonComponent}> component`,
        explanation: `Replaces custom element with the project's tested, accessible ${buttonComponent} component.`,
        type: 'refactor',
        confidence: 0.82,
        safe: false,
        actionLabel: 'Replace',
      });

      return suggestions.slice(0, 3);
    }

    // ─────────────────────────────────────────────────────────────
    // 3. Repeated Card Styling (Section 2)
    // ─────────────────────────────────────────────────────────────
    if (ruleId === 'CP-007' || ruleId === 'UI-015' || /repeated card|card layout|duplicated styling/i.test(finding.message) || /repeated card/i.test(finding.title || '') || /repeated card/i.test(finding.problemTitle || '')) {
      const cardComponent = preferredComps['card'] || 'Card';
      const hasDiscoveredCard = !!preferredComps['card'];

      suggestions.push({
        id: `sug_${finding.id || ruleId}_1`,
        title: hasDiscoveredCard ? `Use existing <${cardComponent}> component` : `Normalize card spacing using <${cardComponent}> component`,
        explanation: 'Normalize card spacing using the existing card component and project spacing token.',
        type: 'refactor',
        confidence: 0.92,
        safe: false,
        actionLabel: 'Suggested Fix',
      });

      suggestions.push({
        id: `sug_${finding.id || ruleId}_2`,
        title: 'Create a shared card style token or class',
        explanation: 'Allows elements to stay lightweight while sharing unified surface elevation.',
        type: 'insert',
        confidence: 0.84,
        safe: false,
        actionLabel: 'Insert',
        replacement: '.surface-card { border-radius: var(--radius-md); padding: 16px; }',
      });

      suggestions.push({
        id: `sug_${finding.id || ruleId}_3`,
        title: 'Keep layout inline if this card has unique structure',
        explanation: 'Valid if this card requires custom responsive padding or non-standard interactive states.',
        type: 'manual',
        confidence: 0.72,
        safe: false,
        actionLabel: 'Keep value',
      });

      return suggestions.slice(0, 3);
    }


    // ─────────────────────────────────────────────────────────────
    // 4. Exception Swallowing (AP-008, CD-001)
    // ─────────────────────────────────────────────────────────────
    if (ruleId === 'AP-008' || /catch|swallow|silent error/i.test(finding.message)) {
      suggestions.push({
        id: `sug_${finding.id || ruleId}_1`,
        title: 'Log error with context or rethrow',
        explanation: 'Preserves the error stack trace and context to ensure bugs do not fail silently.',
        type: 'autofix',
        confidence: 0.95,
        safe: true,
        actionLabel: 'Apply',
        replacement: 'console.error("Operation failed:", err);',
        previewDiff: `- catch (err) {}\n+ catch (err) {\n+   console.error("Operation failed:", err);\n+ }`,
      });

      suggestions.push({
        id: `sug_${finding.id || ruleId}_2`,
        title: 'Add structured user notification / toast error',
        explanation: 'Informs users of network/processing failures with retry guidance.',
        type: 'insert',
        confidence: 0.87,
        safe: false,
        actionLabel: 'Insert',
      });

      suggestions.push({
        id: `sug_${finding.id || ruleId}_3`,
        title: 'Add comment documenting intentional ignore',
        explanation: 'Documents why this error is safely ignored (e.g. optional teardown or abort signal).',
        type: 'insert',
        confidence: 0.75,
        safe: false,
        actionLabel: 'Insert',
        replacement: '// Intentionally ignored: optional cleanup task',
      });

      return suggestions.slice(0, 3);
    }

    // ─────────────────────────────────────────────────────────────
    // 5. Any Escape Hatch (AP-014)
    // ─────────────────────────────────────────────────────────────
    if (ruleId === 'AP-014' || /\bany\b/i.test(finding.message)) {
      suggestions.push({
        id: `sug_${finding.id || ruleId}_1`,
        title: 'Replace "any" with specific type or interface',
        explanation: 'Restores type-checking and autocompletion for properties accessed on this object.',
        type: 'replace',
        confidence: 0.90,
        safe: false,
        actionLabel: 'Replace',
      });

      suggestions.push({
        id: `sug_${finding.id || ruleId}_2`,
        title: 'Use "unknown" with type guard narrowing',
        explanation: 'Forces runtime type validation before methods or fields can be accessed.',
        type: 'replace',
        confidence: 0.85,
        safe: false,
        actionLabel: 'Replace',
        replacement: 'unknown',
      });

      suggestions.push({
        id: `sug_${finding.id || ruleId}_3`,
        title: 'Add explicit lint suppression with explanation',
        explanation: 'Documents why type narrowing cannot be performed on external untyped third-party payload.',
        type: 'insert',
        confidence: 0.70,
        safe: false,
        actionLabel: 'Insert',
        replacement: '// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped third-party response',
      });

      return suggestions.slice(0, 3);
    }

    // ─────────────────────────────────────────────────────────────
    // 5b. Missing Authorization Check / Security
    // ─────────────────────────────────────────────────────────────
    if (ruleId === 'SEC-B01' || ruleId.startsWith('SEC-') || /authorization|idor|ownership/i.test(finding.message) || /authorization/i.test(finding.title || '') || /authorization/i.test(finding.problemTitle || '')) {
      suggestions.push({
        id: `sug_${finding.id || ruleId}_1`,
        title: 'Add authorization middleware check',
        explanation: 'Add the existing authorization middleware/policy check used by sibling API routes.',
        type: 'manual',
        confidence: 0.94,
        safe: false,
        actionLabel: 'Manual fix',
      });

      suggestions.push({
        id: `sug_${finding.id || ruleId}_2`,
        title: 'Scope query to authenticated caller',
        explanation: 'Enforces session.userId or tenant isolation in the data query.',
        type: 'manual',
        confidence: 0.88,
        safe: false,
        actionLabel: 'Manual fix',
      });

      return suggestions.slice(0, 3);
    }

    // ─────────────────────────────────────────────────────────────
    // 6. Generic or Design Fix Findings
    // ─────────────────────────────────────────────────────────────
    const existingFix = finding.designFix || (finding.fix as any);
    if (existingFix && existingFix.changes && existingFix.changes.length > 0) {
      const change = existingFix.changes[0];
      const newText = change.newText || change.after || '';
      const oldText = change.before || snippet;

      suggestions.push({
        id: `sug_${finding.id || ruleId}_1`,
        title: existingFix.title || `Apply fix: ${finding.howToFix || 'Correct code'}`,
        explanation: change.explanation || finding.whyItMatters || 'Applies the direct safe modification.',
        type: 'autofix',
        confidence: 0.93,
        safe: existingFix.safety === 'safe' || existingFix.kind === 'safe',
        actionLabel: existingFix.safety === 'safe' || existingFix.kind === 'safe' ? 'Apply' : 'Replace',
        replacement: newText,
        previewDiff: oldText ? `- ${oldText}\n+ ${newText}` : `+ ${newText}`,
      });
    }

    // Contextual secondary suggestions based on whyItMatters & howToFix
    if (finding.howToFix) {
      suggestions.push({
        id: `sug_${finding.id || ruleId}_${suggestions.length + 1}`,
        title: finding.howToFix.length > 60 ? `${finding.howToFix.substring(0, 57)}...` : finding.howToFix,
        explanation: finding.whyItMatters || 'Fixes the flagged quality pattern.',
        type: 'refactor',
        confidence: 0.82,
        safe: false,
        actionLabel: 'Open suggestion',
      });
    }

    // Fallback third suggestion: dismissal/manual guidance
    suggestions.push({
      id: `sug_${finding.id || ruleId}_${suggestions.length + 1}`,
      title: 'Dismiss as intentional project exception',
      explanation: 'Keep this code unchanged if this implementation is a recognized design exception.',
      type: 'manual',
      confidence: 0.65,
      safe: false,
      actionLabel: 'Keep value',
    });

    return suggestions.slice(0, 3);
  }
}
