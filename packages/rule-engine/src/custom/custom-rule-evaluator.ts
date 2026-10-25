import ts from 'typescript';
import {
  CraftLensRule,
  CustomRuleDefinition,
  AnalysisContext,
  Finding,
  regexEvidence,
  astEvidence,
  SourceLocation,
  SupportedAction,
} from '@craftlens/core';
import { ParsedDocument } from '@craftlens/parser';

export function createRuleFromDefinition(def: CustomRuleDefinition): CraftLensRule {
  const supportedActions: SupportedAction[] = ['explain', 'not_a_problem'];
  if (def.fix && def.fix.replacement) {
    supportedActions.unshift('fix', 'preview');
  }
  if (def.recommendation?.alternatives && def.recommendation.alternatives.length > 0) {
    supportedActions.push('suggest_better_design');
  }

  return {
    id: def.id,
    title: def.name,
    category: def.category,
    description: def.description,
    rationale: def.rationale,
    severity: def.severity,
    confidence: 0.95,
    engine: def.detection.type === 'ast' ? 'ast' : def.detection.type === 'css' ? 'css' : 'cluster',
    recommendation: def.recommendation?.summary || 'Follow project conventions.',
    fix: def.fix?.type || 'none',
    platforms: ['typescript', 'javascript', 'react', 'web'],
    tags: def.tags || ['custom', def.category],
    minimumAuditLevel: def.minimumAuditLevel || 'moderate',
    diagnosis: def.description,
    structuredRecommendation: def.recommendation
      ? {
          summary: def.recommendation.summary,
          rationale: def.recommendation.rationale || def.rationale,
          alternatives: def.recommendation.alternatives,
          fix: def.fix
            ? {
                type: def.fix.type,
                description: def.fix.description || 'Replace with approved pattern.',
              }
            : undefined,
        }
      : undefined,
    supportedActions,

    detect(context: AnalysisContext): Finding[] {
      // 1. Check Scope
      const normalizedPath = context.filePath.replace(/\\/g, '/');
      if (def.scope) {
        if (def.scope.include && def.scope.include.length > 0) {
          const included = def.scope.include.some(pattern => matchesGlob(normalizedPath, pattern));
          if (!included) return [];
        }
        if (def.scope.exclude && def.scope.exclude.length > 0) {
          const excluded = def.scope.exclude.some(pattern => matchesGlob(normalizedPath, pattern));
          if (excluded) return [];
        }
      }

      const findings: Finding[] = [];
      const { detection } = def;

      // 2. Detection Engine Evaluation
      switch (detection.type) {
        case 'text': {
          if (!detection.pattern) break;
          let idx = context.sourceCode.indexOf(detection.pattern);
          while (idx !== -1) {
            const loc = getLocationFromIndex(context.filePath, context.sourceCode, idx, detection.pattern.length);
            findings.push(createFinding(def, loc, `Matched forbidden text: "${detection.pattern}"`, detection.pattern));
            idx = context.sourceCode.indexOf(detection.pattern, idx + 1);
          }
          break;
        }

        case 'regex': {
          if (!detection.pattern) break;
          const reg = new RegExp(detection.pattern, detection.flags || 'g');
          let match: RegExpExecArray | null;
          while ((match = reg.exec(context.sourceCode)) !== null) {
            const loc = getLocationFromIndex(context.filePath, context.sourceCode, match.index, match[0].length);
            findings.push(createFinding(def, loc, `Matched regex pattern: /${detection.pattern}/`, match[0]));
            if (!reg.global) break;
          }
          break;
        }

        case 'css': {
          const pattern = detection.pattern || detection.selector || '';
          if (pattern === 'gradient' || /gradient/i.test(pattern)) {
            const gradRegex = /(linear-gradient\([^)]+\)|bg-gradient-to-[a-z]+)/g;
            let match: RegExpExecArray | null;
            while ((match = gradRegex.exec(context.sourceCode)) !== null) {
              const loc = getLocationFromIndex(context.filePath, context.sourceCode, match.index, match[0].length);
              findings.push(createFinding(def, loc, `Prohibited gradient surface detected: ${match[0]}`, match[0]));
            }
          } else if (pattern) {
            const cssRegex = new RegExp(pattern, detection.flags || 'gi');
            let match: RegExpExecArray | null;
            while ((match = cssRegex.exec(context.sourceCode)) !== null) {
              const loc = getLocationFromIndex(context.filePath, context.sourceCode, match.index, match[0].length);
              findings.push(createFinding(def, loc, `Matched CSS convention violation: ${match[0]}`, match[0]));
              if (!cssRegex.global) break;
            }
          }
          break;
        }

        case 'ast': {
          const parsed = context.parsedAst as ParsedDocument | undefined;
          if (!parsed || !parsed.sourceFile) break;

          const sourceFile = parsed.sourceFile;
          const targetNodeType = detection.astNodeType || detection.pattern || '';

          function visit(node: ts.Node) {
            let matched = false;
            let nodeSnippet = '';

            if (targetNodeType === 'JsxElement' || targetNodeType === 'JsxSelfClosingElement') {
              if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
                matched = true;
                nodeSnippet = node.getText(sourceFile);
              }
            } else if (targetNodeType.startsWith('<')) {
              // Tag match, e.g. <button> or <img
              const tag = targetNodeType.replace(/[<>/]/g, '');
              if (ts.isJsxElement(node) && node.openingElement.tagName.getText(sourceFile) === tag) {
                matched = true;
                nodeSnippet = node.openingElement.getText(sourceFile);
              } else if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(sourceFile) === tag) {
                matched = true;
                nodeSnippet = node.getText(sourceFile);
              }
            } else if (ts.SyntaxKind[node.kind] === targetNodeType) {
              matched = true;
              nodeSnippet = node.getText(sourceFile);
            }

            if (matched) {
              const loc = parsed!.getLocation(node);
              findings.push(createFinding(def, loc, `Matched AST node type "${targetNodeType}"`, nodeSnippet));
            }
            ts.forEachChild(node, visit);
          }

          visit(sourceFile);
          break;
        }

        case 'dependency': {
          const dep = detection.dependencyName || detection.pattern;
          if (dep && context.projectContext.dependencies[dep]) {
            const loc: SourceLocation = {
              filePath: context.filePath,
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 1, column: 1, offset: 0 },
            };
            findings.push(
              createFinding(
                def,
                loc,
                `Project includes prohibited or deprecated dependency: "${dep}" (v${context.projectContext.dependencies[dep]})`
              )
            );
          }
          break;
        }
      }

      return findings;
    },
  };
}

function createFinding(
  def: CustomRuleDefinition,
  loc: SourceLocation,
  evidenceText: string,
  snippet?: string
): Finding {
  const finding: Finding = {
    ruleId: def.id,
    message: def.name,
    description: def.description,
    severity: def.severity,
    confidence: 0.95,
    location: loc,
    findingType: def.severity === 'suggestion' || def.severity === 'info' ? 'suggestion' : 'problem',
    diagnosis: def.description,
    recommendation: def.recommendation?.summary,
    structuredRecommendation: def.recommendation
      ? {
          summary: def.recommendation.summary,
          rationale: def.recommendation.rationale || def.rationale,
          alternatives: def.recommendation.alternatives,
        }
      : undefined,
    alternatives: def.recommendation?.alternatives,
    evidence: [
      snippet
        ? regexEvidence(evidenceText, loc, snippet)
        : {
            type: 'semantic',
            explanation: evidenceText,
            location: loc,
            snippet,
          },
    ],
    supportedActions: ['explain', 'not_a_problem'],
  };

  if (def.fix && def.fix.replacement) {
    finding.supportedActions!.unshift('fix', 'preview');
    finding.fix = {
      title: def.fix.description || `Replace with '${def.fix.replacement}'`,
      kind: def.fix.type === 'safe' ? 'safe' : 'assisted',
      changes: [
        {
          range: loc,
          newText: def.fix.replacement,
          before: snippet,
        },
      ],
      isPreferred: true,
    };
    finding.designFix = {
      id: `${def.id}-fix`,
      title: def.fix.description || `Replace with '${def.fix.replacement}'`,
      description: def.recommendation?.summary || def.description,
      safety: def.fix.type,
      changes: [
        {
          file: loc.filePath,
          range: loc,
          before: snippet,
          after: def.fix.replacement,
          explanation: def.fix.description || def.recommendation?.summary || def.description,
        },
      ],
      isPreferred: true,
    };
  }

  if (def.recommendation?.alternatives && def.recommendation.alternatives.length > 0) {
    finding.supportedActions!.push('suggest_better_design');
  }

  return finding;
}

function getLocationFromIndex(filePath: string, text: string, index: number, length: number): SourceLocation {
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

  let endLine = line;
  let endColumn = column;
  for (let i = index; i < index + length; i++) {
    if (text[i] === '\n') {
      endLine++;
      endColumn = 1;
    } else {
      endColumn++;
    }
  }

  return {
    filePath,
    start: { line, column, offset: index },
    end: { line: endLine, column: endColumn, offset: index + length },
  };
}

function matchesGlob(path: string, pattern: string): boolean {
  if (pattern === '**' || pattern === '*') return true;
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*');
  return new RegExp(regexPattern).test(path);
}
