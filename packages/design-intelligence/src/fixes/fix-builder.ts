import {
  DesignFix,
  ProposedChange,
  FixSafety,
  SourceLocation,
} from '@craftlens/core';

export class FixBuilder {
  public static create(options: {
    id: string;
    title: string;
    description: string;
    changes: ProposedChange[];
    safety: FixSafety;
    isPreferred?: boolean;
  }): DesignFix {
    return {
      id: options.id,
      title: options.title,
      description: options.description,
      changes: options.changes,
      safety: options.safety,
      isPreferred: options.isPreferred,
    };
  }

  public static createSingleChangeFix(options: {
    id: string;
    title: string;
    description: string;
    file?: string;
    range: SourceLocation;
    before?: string;
    after: string;
    explanation?: string;
    safety?: FixSafety;
    isPreferred?: boolean;
  }): DesignFix {
    return {
      id: options.id,
      title: options.title,
      description: options.description,
      safety: options.safety ?? 'assisted',
      isPreferred: options.isPreferred,
      changes: [
        {
          file: options.file,
          range: options.range,
          before: options.before,
          after: options.after,
          explanation: options.explanation || options.description,
        },
      ],
    };
  }

  /**
   * Generates a readable before/after markdown representation of the proposed change.
   */
  public static formatBeforeAfterPreview(fix: DesignFix): string {
    const safety = typeof fix?.safety === 'string' && fix.safety.trim()
      ? fix.safety.trim().toUpperCase()
      : 'ASSISTED';
    const title = fix?.title || 'Proposed Fix';
    const sections: string[] = [`### Proposed Fix: ${title}`, `*Safety level:* \`${safety}\``, ''];

    const changes = Array.isArray(fix?.changes) ? fix.changes : [];
    for (const change of changes) {
      if (change.explanation) {
        sections.push(change.explanation, '');
      }
      if (change.before !== undefined) {
        sections.push('**Before:**');
        sections.push('```tsx');
        sections.push(change.before);
        sections.push('```');
      }
      sections.push('**Suggested:**');
      sections.push('```tsx');
      sections.push(change.after);
      sections.push('```');
      sections.push('');
    }

    return sections.join('\n');
  }
}
