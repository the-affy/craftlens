import ts from 'typescript';

export type SupportedLanguage =
  | 'typescript'
  | 'tsx'
  | 'javascript'
  | 'jsx'
  | 'css'
  | 'scss'
  | 'less'
  | 'html'
  | 'json'
  | 'jsonc'
  | 'yaml'
  | 'markdown'
  | 'vue'
  | 'svelte'
  | 'unknown';

export interface SyntaxValidationResult {
  valid: boolean;
  language: SupportedLanguage;
  errors: string[];
}

export function detectLanguage(filePath: string): SupportedLanguage {
  const lower = (filePath || '').toLowerCase();
  if (lower.endsWith('.tsx')) return 'tsx';
  if (lower.endsWith('.ts')) return 'typescript';
  if (lower.endsWith('.jsx')) return 'jsx';
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return 'javascript';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.scss')) return 'scss';
  if (lower.endsWith('.less')) return 'less';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  if (lower.endsWith('.jsonc') || lower.endsWith('tsconfig.json') || lower.endsWith('.eslintrc') || lower.includes('settings.json')) return 'jsonc';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown';
  if (lower.endsWith('.vue')) return 'vue';
  if (lower.endsWith('.svelte')) return 'svelte';
  return 'unknown';
}

export function validateSyntax(filePath: string, content: string): SyntaxValidationResult {
  const language = detectLanguage(filePath);
  const errors: string[] = [];

  switch (language) {
    case 'typescript':
    case 'tsx':
    case 'javascript':
    case 'jsx': {
      validateTsJsSyntax(filePath, content, language, errors);
      break;
    }
    case 'json': {
      validateJsonSyntax(content, errors, false);
      break;
    }
    case 'jsonc': {
      validateJsonSyntax(content, errors, true);
      break;
    }
    case 'css':
    case 'scss':
    case 'less': {
      validateCssSyntax(content, language, errors);
      break;
    }
    case 'html': {
      validateHtmlSyntax(content, errors);
      break;
    }
    case 'yaml': {
      validateYamlSyntax(content, errors);
      break;
    }
    case 'markdown': {
      validateMarkdownSyntax(content, errors);
      break;
    }
    case 'vue':
    case 'svelte': {
      validateComponentSyntax(filePath, content, language, errors);
      break;
    }
    default: {
      // For unknown text files, check balanced quotes and braces if applicable
      break;
    }
  }

  return {
    valid: errors.length === 0,
    language,
    errors,
  };
}

function validateTsJsSyntax(
  filePath: string,
  content: string,
  language: SupportedLanguage,
  errors: string[]
): void {
  let scriptKind = ts.ScriptKind.TS;
  if (language === 'tsx') scriptKind = ts.ScriptKind.TSX;
  else if (language === 'jsx') scriptKind = ts.ScriptKind.JSX;
  else if (language === 'javascript') scriptKind = ts.ScriptKind.JS;

  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKind
  );

  const parseDiagnostics: readonly ts.Diagnostic[] = (sourceFile as any).parseDiagnostics || [];
  for (const diag of parseDiagnostics) {
    if (diag.category === ts.DiagnosticCategory.Error) {
      let line = 1;
      let col = 1;
      if (diag.start !== undefined) {
        const pos = sourceFile.getLineAndCharacterOfPosition(diag.start);
        line = pos.line + 1;
        col = pos.character + 1;
      }
      const message = typeof diag.messageText === 'string'
        ? diag.messageText
        : diag.messageText.messageText;
      errors.push(`[Syntax Error ${diag.code}] Line ${line}:${col} - ${message}`);
    }
  }
}

function validateJsonSyntax(content: string, errors: string[], allowComments: boolean): void {
  const trimmed = content.trim();
  if (!trimmed) {
    errors.push('JSON syntax error: Content is empty.');
    return;
  }

  if (allowComments) {
    // Strip comments for JSONC parsing
    const stripped = content
      .replace(/\/\*[\s\S]*?\*\//g, match => ' '.repeat(match.length))
      .replace(/\/\/.*$/gm, match => ' '.repeat(match.length));
    try {
      JSON.parse(stripped);
    } catch (err: any) {
      errors.push(`JSONC syntax error: ${err?.message || 'Invalid JSON with comments'}`);
    }
    return;
  }

  try {
    JSON.parse(content);
  } catch (err: any) {
    errors.push(`JSON syntax error: ${err?.message || 'Invalid JSON syntax'}`);
  }
}

export function validateCssSyntax(content: string, language: SupportedLanguage, errors: string[]): void {
  let braceCount = 0;
  let parenCount = 0;
  let bracketCount = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inComment = false;

  const lines = content.split('\n');

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const lineNum = lineIdx + 1;

    // Line-level check for corrupted gradient / declaration patterns
    // e.g. `--color-accent: #38bdf8; 0%, #0ea5e9 100%);`
    if (/--[a-zA-Z0-9_-]+:\s*[^;]+;\s*[\d.]+%/.test(line)) {
      errors.push(`CSS syntax error at line ${lineNum}: Semicolon and subsequent percentage arguments indicate corrupted property replacement.`);
    }

    // Semicolon inside parentheses check (e.g. `linear-gradient(...; ...)`)
    if (/[a-zA-Z-]+\([^)]*;[^)]*\)/.test(line)) {
      errors.push(`CSS syntax error at line ${lineNum}: Semicolon found inside function call parentheses.`);
    }

    // Dangling closing parenthesis after declaration
    if (/;\s*[\d.]+%[^;]*\)/.test(line)) {
      errors.push(`CSS syntax error at line ${lineNum}: Dangling argument and closing parenthesis after semicolon.`);
    }

    for (let charIdx = 0; charIdx < line.length; charIdx++) {
      const char = line[charIdx];
      const prevChar = charIdx > 0 ? line[charIdx - 1] : '';
      const nextChar = charIdx < line.length - 1 ? line[charIdx + 1] : '';

      if (inComment) {
        if (prevChar === '*' && char === '/') {
          inComment = false;
        }
        continue;
      }

      if (char === '/' && nextChar === '*') {
        inComment = true;
        charIdx++;
        continue;
      }

      // Handle SCSS/LESS line comments `//`
      if ((language === 'scss' || language === 'less') && char === '/' && nextChar === '/') {
        break; // skip remainder of line
      }

      if (char === "'" && !inDoubleQuote && prevChar !== '\\') {
        inSingleQuote = !inSingleQuote;
        continue;
      }

      if (char === '"' && !inSingleQuote && prevChar !== '\\') {
        inDoubleQuote = !inDoubleQuote;
        continue;
      }

      if (inSingleQuote || inDoubleQuote) {
        continue;
      }

      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount < 0) {
          errors.push(`CSS syntax error at line ${lineNum}:${charIdx + 1}: Unexpected closing brace '}'.`);
          return;
        }
      } else if (char === '(') {
        parenCount++;
      } else if (char === ')') {
        parenCount--;
        if (parenCount < 0) {
          errors.push(`CSS syntax error at line ${lineNum}:${charIdx + 1}: Unexpected closing parenthesis ')'.`);
          return;
        }
      } else if (char === '[') {
        bracketCount++;
      } else if (char === ']') {
        bracketCount--;
        if (bracketCount < 0) {
          errors.push(`CSS syntax error at line ${lineNum}:${charIdx + 1}: Unexpected closing bracket ']'.`);
          return;
        }
      }
    }
  }

  if (braceCount !== 0) {
    errors.push(`CSS syntax error: Unbalanced braces (${braceCount > 0 ? `${braceCount} unclosed '{'` : `${Math.abs(braceCount)} extra '}'`}).`);
  }
  if (parenCount !== 0) {
    errors.push(`CSS syntax error: Unbalanced parentheses (${parenCount > 0 ? `${parenCount} unclosed '('` : `${Math.abs(parenCount)} extra ')'`}).`);
  }
  if (bracketCount !== 0) {
    errors.push(`CSS syntax error: Unbalanced square brackets (${bracketCount > 0 ? `${bracketCount} unclosed '['` : `${Math.abs(bracketCount)} extra ']'`}).`);
  }
  if (inSingleQuote || inDoubleQuote) {
    errors.push('CSS syntax error: Unclosed quote string.');
  }
}

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

function validateHtmlSyntax(content: string, errors: string[]): void {
  // Strip comments
  const stripped = content.replace(/<!--[\s\S]*?-->/g, '');

  const tagRegex = /<\/?([a-zA-Z0-9:-]+)(\s+[^>]*)?\/?>/g;
  const tagStack: { tag: string; line: number }[] = [];
  const lines = stripped.split('\n');

  // Check duplicate IDs
  const seenIds = new Set<string>();
  const idRegex = /\bid=["']([^"']+)["']/g;
  let idMatch: RegExpExecArray | null;
  while ((idMatch = idRegex.exec(stripped)) !== null) {
    const idVal = idMatch[1];
    if (seenIds.has(idVal)) {
      errors.push(`HTML semantic error: Duplicate element ID "${idVal}" detected.`);
    } else {
      seenIds.add(idVal);
    }
  }

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const lineNum = lineIdx + 1;

    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(line)) !== null) {
      const fullTag = match[0];
      const tagName = match[1].toLowerCase();

      if (fullTag.startsWith('<!')) {
        continue; // DOCTYPE or directive
      }

      const isClosing = fullTag.startsWith('</');
      const isSelfClosing = fullTag.endsWith('/>') || VOID_ELEMENTS.has(tagName);

      if (isClosing) {
        if (tagStack.length === 0) {
          errors.push(`HTML syntax error at line ${lineNum}: Unexpected closing tag </${tagName}> without matching opening tag.`);
          return;
        }
        const last = tagStack.pop()!;
        if (last.tag !== tagName) {
          errors.push(`HTML syntax error at line ${lineNum}: Mismatched closing tag </${tagName}> (expected </${last.tag}> opened at line ${last.line}).`);
          return;
        }
      } else if (!isSelfClosing) {
        tagStack.push({ tag: tagName, line: lineNum });
      }
    }
  }

  if (tagStack.length > 0) {
    const unclosed = tagStack.map(t => `<${t.tag}> (line ${t.line})`).join(', ');
    errors.push(`HTML syntax error: Unclosed tags at EOF: ${unclosed}.`);
  }
}

function validateYamlSyntax(content: string, errors: string[]): void {
  const lines = content.split('\n');
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const lineNum = idx + 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Check key-value structure
    if (trimmed.includes(':') && !trimmed.startsWith('-')) {
      const parts = trimmed.split(':');
      const key = parts[0];
      const val = parts.slice(1).join(':');
      if (val && !val.startsWith(' ') && !val.startsWith('\t') && !val.startsWith('/')) {
        errors.push(`YAML syntax error at line ${lineNum}: Missing whitespace after colon in "${trimmed}".`);
      }
    }
  }
}

function validateMarkdownSyntax(content: string, errors: string[]): void {
  const lines = content.split('\n');
  let inCodeBlock = false;
  let codeBlockStart = 0;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      if (inCodeBlock) codeBlockStart = idx + 1;
    }
  }

  if (inCodeBlock) {
    errors.push(`Markdown syntax error: Unclosed code block starting at line ${codeBlockStart}.`);
  }
}

function validateComponentSyntax(
  filePath: string,
  content: string,
  language: SupportedLanguage,
  errors: string[]
): void {
  // Extract <script> block
  const scriptMatch = content.match(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/i);
  if (scriptMatch) {
    const scriptContent = scriptMatch[1];
    const isTs = scriptMatch[0].includes('lang="ts"') || scriptMatch[0].includes("lang='ts'");
    const tempLang = isTs ? 'typescript' : 'javascript';
    validateTsJsSyntax(filePath, scriptContent, tempLang, errors);
  }

  // Extract <style> block
  const styleMatch = content.match(/<style(?:\s+[^>]*)?>([\s\S]*?)<\/style>/i);
  if (styleMatch) {
    const styleContent = styleMatch[1];
    validateCssSyntax(styleContent, 'css', errors);
  }

  // Extract <template> block (for Vue)
  const templateMatch = content.match(/<template(?:\s+[^>]*)?>([\s\S]*?)<\/template>/i);
  if (templateMatch) {
    validateHtmlSyntax(templateMatch[1], errors);
  }
}

