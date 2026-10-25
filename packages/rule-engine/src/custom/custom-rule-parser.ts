import { CustomRuleDefinition } from '@craftlens/core';

/**
 * Parses YAML or JSON custom rule content into a CustomRuleDefinition.
 * Zero external dependencies: handles standard JSON and clean declarative YAML.
 */
export function parseCustomRuleContent(content: string, filePath?: string): CustomRuleDefinition {
  const trimmed = content.trim();
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed) as CustomRuleDefinition;
  }

  return parseSimpleYaml(content) as unknown as CustomRuleDefinition;
}

/**
 * Lightweight, robust parser for declarative YAML custom rule schemas.
 * Handles nested objects, lists, strings, booleans, and numbers.
 */
export function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const lines = yaml.split(/\r?\n/);
  const root: Record<string, unknown> = {};
  const stack: { indent: number; obj: Record<string, unknown> | unknown[] }[] = [
    { indent: -1, obj: root },
  ];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex];
    // Strip comments
    const commentIdx = rawLine.indexOf('#');
    const line = (commentIdx >= 0 ? rawLine.substring(0, commentIdx) : rawLine).replace(/\s+$/, '');
    if (!line.trim()) continue;

    const indent = line.search(/\S/);
    const text = line.trim();

    // Pop stack if indent is less than current top
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const current = stack[stack.length - 1].obj;

    // 1. Array item: "- something"
    if (text.startsWith('-')) {
      const itemVal = text.substring(1).trim();
      if (Array.isArray(current)) {
        current.push(parseScalar(itemVal));
      } else {
        // Find parent key to attach array to
        // If current is an object, but we are inside an array block
      }
      continue;
    }

    // 2. Key-value: "key: value" or "key:"
    const colonIdx = text.indexOf(':');
    if (colonIdx > 0) {
      const key = text.substring(0, colonIdx).trim();
      const rawVal = text.substring(colonIdx + 1).trim();

      if (rawVal === '') {
        // Check next non-empty line to see if it's a list or nested object
        let nextIndent = indent + 2;
        let isList = false;
        for (let j = lineIndex + 1; j < lines.length; j++) {
          const l = lines[j].trim();
          if (l && !l.startsWith('#')) {
            nextIndent = lines[j].search(/\S/);
            isList = l.startsWith('-');
            break;
          }
        }

        const child = isList ? [] : {};
        if (Array.isArray(current)) {
          // Inside array
        } else {
          (current as Record<string, unknown>)[key] = child;
        }
        stack.push({ indent, obj: child });
      } else {
        const val = parseScalar(rawVal);
        if (!Array.isArray(current)) {
          (current as Record<string, unknown>)[key] = val;
        }
      }
    }
  }

  return root;
}

function parseScalar(val: string): unknown {
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (val === 'null') return null;
  if (/^-?\d+$/.test(val)) return parseInt(val, 10);
  if (/^-?\d+\.\d+$/.test(val)) return parseFloat(val);
  // Strip quotes if wrapped
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val.substring(1, val.length - 1);
  }
  return val;
}
