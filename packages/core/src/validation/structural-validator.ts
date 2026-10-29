import * as path from 'node:path';
import * as fs from 'node:fs';
import ts from 'typescript';
import { detectLanguage } from './syntax-validator.js';

export interface StructuralValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface FunctionSignature {
  name: string;
  kind: 'function' | 'method';
  parameterNames: string[];
  requiredParamCount: number;
  line: number;
}

export function validateStructuralIntegrity(
  filePath: string,
  beforeContent: string,
  afterContent: string,
  workspaceRoot?: string
): StructuralValidationResult {
  const language = detectLanguage(filePath);
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. VS Code Extension & package.json Validation (Section 9 & 13)
  if (filePath.endsWith('package.json')) {
    validatePackageJsonStructure(afterContent, errors);
    return { valid: errors.length === 0, errors, warnings };
  }

  // 2. TypeScript / JavaScript Structural & Semantic Protection (Section 4, 5, 6, 7, 8)
  if (language === 'typescript' || language === 'tsx' || language === 'javascript' || language === 'jsx') {
    validateTsJsStructure(filePath, beforeContent, afterContent, language, workspaceRoot, errors, warnings);
    return { valid: errors.length === 0, errors, warnings };
  }

  // 3. CSS Declaration & Structure Safety (Section 12 & 34)
  if (language === 'css' || language === 'scss' || language === 'less') {
    validateCssStructure(afterContent, errors);
    return { valid: errors.length === 0, errors, warnings };
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validatePackageJsonStructure(content: string, errors: string[]): void {
  let pkg: any;
  try {
    pkg = JSON.parse(content);
  } catch (err: any) {
    errors.push(`package.json parse error: ${err?.message || 'Invalid JSON'}`);
    return;
  }

  if (typeof pkg !== 'object' || pkg === null) {
    errors.push('package.json error: Root must be a JSON object.');
    return;
  }

  // Check required extension fields if it's a VS Code extension
  if (pkg.engines && pkg.engines.vscode) {
    if (!pkg.name || typeof pkg.name !== 'string') {
      errors.push('package.json error: Extension must have a valid "name".');
    }
    if (!pkg.version || typeof pkg.version !== 'string') {
      errors.push('package.json error: Extension must have a valid "version".');
    }
    if (!pkg.publisher || typeof pkg.publisher !== 'string') {
      errors.push('package.json error: Extension must have a valid "publisher".');
    }

    // Verify contributes.commands
    if (pkg.contributes && Array.isArray(pkg.contributes.commands)) {
      const seenCmds = new Set<string>();
      for (const cmd of pkg.contributes.commands) {
        if (!cmd.command || typeof cmd.command !== 'string') {
          errors.push('package.json error: Command contribution missing "command" identifier.');
        } else {
          if (seenCmds.has(cmd.command)) {
            errors.push(`package.json error: Duplicate command declaration for "${cmd.command}".`);
          }
          seenCmds.add(cmd.command);
        }
        if (!cmd.title || typeof cmd.title !== 'string') {
          errors.push(`package.json error: Command "${cmd.command}" missing "title".`);
        }
      }
    }

    // Verify activationEvents
    if (pkg.activationEvents && !Array.isArray(pkg.activationEvents)) {
      errors.push('package.json error: "activationEvents" must be an array of strings.');
    }
  }
}

function validateCssStructure(content: string, errors: string[]): void {
  // Check for corrupted property replacements like:
  // `--color-accent: #38bdf8; 0%, #0ea5e9 100%);`
  const lines = content.split('\n');
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const lineNum = idx + 1;

    if (/--[a-zA-Z0-9_-]+:\s*[^;]+;\s*[\d.]+%/.test(line)) {
      errors.push(`CSS structural error at line ${lineNum}: Semicolon and subsequent arguments indicate corrupted property value.`);
    }

    if (line.includes('linear-gradient') && line.includes(';')) {
      errors.push(`CSS structural error at line ${lineNum}: Semicolon cannot exist within linear-gradient declaration.`);
    }
  }
}

function validateTsJsStructure(
  filePath: string,
  beforeContent: string,
  afterContent: string,
  language: string,
  workspaceRoot: string | undefined,
  errors: string[],
  warnings: string[]
): void {
  let scriptKind = ts.ScriptKind.TS;
  if (language === 'tsx') scriptKind = ts.ScriptKind.TSX;
  else if (language === 'jsx') scriptKind = ts.ScriptKind.JSX;
  else if (language === 'javascript') scriptKind = ts.ScriptKind.JS;

  const beforeSf = ts.createSourceFile(filePath, beforeContent, ts.ScriptTarget.Latest, true, scriptKind);
  const afterSf = ts.createSourceFile(filePath, afterContent, ts.ScriptTarget.Latest, true, scriptKind);

  // A. Method / Function Protection (Section 5)
  const beforeFns = extractFunctionSignatures(beforeSf);
  const afterFns = extractFunctionSignatures(afterSf);

  for (const bFn of beforeFns) {
    const matchingAfter = afterFns.find(a => a.name === bFn.name && a.kind === bFn.kind);
    if (!matchingAfter) {
      // Function was deleted or corrupted
      errors.push(`Method/Function Protection: Method/function "${bFn.name}" was removed or corrupted by the patch.`);
    } else {
      // Signature check: did the patch add required parameters without default values?
      if (matchingAfter.requiredParamCount > bFn.requiredParamCount) {
        errors.push(
          `Signature Change Safety: Function "${bFn.name}" added required parameters (${bFn.requiredParamCount} -> ${matchingAfter.requiredParamCount}), breaking existing call sites.`
        );
      }
    }
  }

  // B. Import / Export Validation (Section 6)
  validateImportsAndExports(filePath, afterSf, workspaceRoot, errors, warnings);
}

function extractFunctionSignatures(sourceFile: ts.SourceFile): FunctionSignature[] {
  const signatures: FunctionSignature[] = [];

  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.text;
      const params = node.parameters.map(p => p.name.getText(sourceFile));
      const requiredParamCount = node.parameters.filter(p => !p.initializer && !p.questionToken).length;
      const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      signatures.push({
        name,
        kind: 'function',
        parameterNames: params,
        requiredParamCount,
        line: pos.line + 1,
      });
    } else if (ts.isMethodDeclaration(node) && node.name) {
      const name = node.name.getText(sourceFile);
      const params = node.parameters.map(p => p.name.getText(sourceFile));
      const requiredParamCount = node.parameters.filter(p => !p.initializer && !p.questionToken).length;
      const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      signatures.push({
        name,
        kind: 'method',
        parameterNames: params,
        requiredParamCount,
        line: pos.line + 1,
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return signatures;
}

function validateImportsAndExports(
  filePath: string,
  sourceFile: ts.SourceFile,
  workspaceRoot: string | undefined,
  errors: string[],
  warnings: string[]
): void {
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier;
      if (ts.isStringLiteral(moduleSpecifier)) {
        const importPath = moduleSpecifier.text;

        // Check relative imports if workspace root is available
        if (importPath.startsWith('./') || importPath.startsWith('../')) {
          if (workspaceRoot) {
            const currentDir = path.dirname(path.resolve(workspaceRoot, filePath));
            const targetBase = path.resolve(currentDir, importPath);

            const resolvedFile = resolveModuleFile(targetBase);
            if (!resolvedFile) {
              errors.push(`Import Validation: Relative import path "${importPath}" cannot be resolved from "${filePath}".`);
            } else {
              // Verify named imports exist in target file
              if (node.importClause && node.importClause.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
                try {
                  const targetContent = fs.readFileSync(resolvedFile, 'utf-8');
                  const targetSf = ts.createSourceFile(resolvedFile, targetContent, ts.ScriptTarget.Latest, true);
                  const exportedNames = extractExportedNames(targetSf);

                  for (const elem of node.importClause.namedBindings.elements) {
                    const importedName = elem.propertyName ? elem.propertyName.text : elem.name.text;
                    if (!exportedNames.has(importedName)) {
                      errors.push(`Import Validation: Symbol "${importedName}" is not exported by module "${importPath}" (${path.basename(resolvedFile)}).`);
                    }
                  }
                } catch {
                  // ignore read error
                }
              }
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

function resolveModuleFile(basePath: string): string | undefined {
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.d.ts'];
  // Direct file match
  if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) {
    return basePath;
  }
  // Try extensions
  for (const ext of extensions) {
    const candidate = basePath + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  // Try index file
  for (const ext of extensions) {
    const candidate = path.join(basePath, 'index' + ext);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return undefined;
}

function extractExportedNames(sourceFile: ts.SourceFile): Set<string> {
  const exports = new Set<string>();

  function visit(node: ts.Node) {
    // Check modifiers for 'export' keyword
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    const isExported = modifiers?.some((m: ts.Modifier) => m.kind === ts.SyntaxKind.ExportKeyword);

    if (isExported) {
      if (ts.isFunctionDeclaration(node) && node.name) {
        exports.add(node.name.text);
      } else if (ts.isClassDeclaration(node) && node.name) {
        exports.add(node.name.text);
      } else if (ts.isInterfaceDeclaration(node)) {
        exports.add(node.name.text);
      } else if (ts.isTypeAliasDeclaration(node)) {
        exports.add(node.name.text);
      } else if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            exports.add(decl.name.text);
          }
        }
      }
    }

    // Export declaration: export { a, b, c }
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const elem of node.exportClause.elements) {
        exports.add(elem.name.text);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return exports;
}
