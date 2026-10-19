import ts from 'typescript';
import { SourceLocation, createLocation } from '@anti-slop/core';

export interface ParsedDocument {
  filePath: string;
  sourceText: string;
  sourceFile: ts.SourceFile;
  getLocation(node: ts.Node): SourceLocation;
  getText(node: ts.Node): string;
}

export function detectScriptKind(filePath: string): ts.ScriptKind {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (lower.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (lower.endsWith('.ts')) return ts.ScriptKind.TS;
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return ts.ScriptKind.JS;
  return ts.ScriptKind.TSX; // default fallback
}

export function parseSource(filePath: string, sourceText: string): ParsedDocument {
  const scriptKind = detectScriptKind(filePath);
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true, // setParentNodes = true for parent navigation
    scriptKind
  );

  return {
    filePath,
    sourceText,
    sourceFile,
    getLocation(node: ts.Node): SourceLocation {
      return getNodeLocation(sourceFile, node, filePath);
    },
    getText(node: ts.Node): string {
      return node.getText(sourceFile);
    },
  };
}

export function getNodeLocation(sourceFile: ts.SourceFile, node: ts.Node, filePath: string): SourceLocation {
  const startPos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const endPos = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

  return createLocation(
    filePath,
    startPos.line + 1,
    startPos.character + 1,
    node.getStart(sourceFile),
    endPos.line + 1,
    endPos.character + 1,
    node.getEnd()
  );
}

export function walkAst(node: ts.Node, visitor: (node: ts.Node) => void): void {
  visitor(node);
  ts.forEachChild(node, child => walkAst(child, visitor));
}

export function findNodesOfKind<T extends ts.Node = ts.Node>(
  root: ts.Node,
  kind: ts.SyntaxKind
): T[] {
  const results: T[] = [];
  walkAst(root, node => {
    if (node.kind === kind) {
      results.push(node as unknown as T);
    }
  });
  return results;
}
