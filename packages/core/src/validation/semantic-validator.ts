import ts from 'typescript';
import { detectLanguage } from './syntax-validator.js';

export interface SemanticValidationResult {
  valid: boolean;
  baselineErrorsCount: number;
  postChangeErrorsCount: number;
  introducedErrors: string[];
}

interface DiagnosticItem {
  code: number;
  category: ts.DiagnosticCategory;
  message: string;
  line: number;
}

export function validateSemanticDiagnostics(
  filePath: string,
  beforeContent: string,
  afterContent: string,
  compilerOptions: ts.CompilerOptions = {}
): SemanticValidationResult {
  const lang = detectLanguage(filePath);
  if (lang !== 'typescript' && lang !== 'tsx' && lang !== 'javascript' && lang !== 'jsx') {
    return {
      valid: true,
      baselineErrorsCount: 0,
      postChangeErrorsCount: 0,
      introducedErrors: [],
    };
  }

  const options: ts.CompilerOptions = {
    noEmit: true,
    target: ts.ScriptTarget.Latest,
    module: ts.ModuleKind.ESNext,
    jsx: lang === 'tsx' || lang === 'jsx' ? ts.JsxEmit.ReactJSX : undefined,
    allowJs: true,
    skipLibCheck: true,
    ...compilerOptions,
  };

  const beforeDiags = getDiagnosticsForContent(filePath, beforeContent, options);
  const afterDiags = getDiagnosticsForContent(filePath, afterContent, options);

  const baselineErrors = beforeDiags.filter(d => d.category === ts.DiagnosticCategory.Error);
  const afterErrors = afterDiags.filter(d => d.category === ts.DiagnosticCategory.Error);

  const introducedErrors: string[] = [];

  for (const afterErr of afterErrors) {
    // Check if an equivalent error existed in baseline
    const matchesBaseline = baselineErrors.some(
      base => base.code === afterErr.code && Math.abs(base.line - afterErr.line) <= 2
    );

    if (!matchesBaseline) {
      introducedErrors.push(
        `[TypeScript Error TS${afterErr.code}] Line ${afterErr.line}: ${afterErr.message}`
      );
    }
  }

  return {
    valid: introducedErrors.length === 0,
    baselineErrorsCount: baselineErrors.length,
    postChangeErrorsCount: afterErrors.length,
    introducedErrors,
  };
}

function getDiagnosticsForContent(
  filePath: string,
  content: string,
  options: ts.CompilerOptions
): DiagnosticItem[] {
  const defaultHost = ts.createCompilerHost(options);

  const host: ts.CompilerHost = {
    ...defaultHost,
    getSourceFile: (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
      if (fileName === filePath || fileName.endsWith(filePath)) {
        return ts.createSourceFile(fileName, content, languageVersion, true);
      }
      return defaultHost.getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
    },
    fileExists: fileName => {
      if (fileName === filePath || fileName.endsWith(filePath)) return true;
      return defaultHost.fileExists(fileName);
    },
    readFile: fileName => {
      if (fileName === filePath || fileName.endsWith(filePath)) return content;
      return defaultHost.readFile(fileName);
    },
  };

  try {
    const program = ts.createProgram([filePath], options, host);
    const sourceFile = program.getSourceFile(filePath);
    if (!sourceFile) return [];

    const diags = [
      ...program.getSyntacticDiagnostics(sourceFile),
      ...program.getSemanticDiagnostics(sourceFile),
    ];

    return diags.map(d => {
      let line = 1;
      if (d.start !== undefined) {
        line = sourceFile.getLineAndCharacterOfPosition(d.start).line + 1;
      }
      const message = typeof d.messageText === 'string'
        ? d.messageText
        : d.messageText.messageText;
      return {
        code: d.code,
        category: d.category,
        message,
        line,
      };
    });
  } catch {
    return [];
  }
}

