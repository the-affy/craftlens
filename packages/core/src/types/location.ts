export interface Position {
  /** 1-indexed line number */
  line: number;
  /** 1-indexed column number */
  column: number;
  /** 0-indexed character offset from the start of the file */
  offset: number;
}

export interface SourceLocation {
  filePath: string;
  start: Position;
  end: Position;
  /** Explicitly marks project/file-level finding without exact line */
  isProjectLevel?: boolean;
}

export function createLocation(
  filePath: string,
  startLine: number,
  startCol: number,
  startOffset: number,
  endLine: number,
  endCol: number,
  endOffset: number
): SourceLocation {
  return {
    filePath,
    start: { line: startLine, column: startCol, offset: startOffset },
    end: { line: endLine, column: endCol, offset: endOffset },
    isProjectLevel: false,
  };
}

export function createProjectLevelLocation(filePath: string): SourceLocation {
  return {
    filePath,
    start: { line: 0, column: 0, offset: 0 },
    end: { line: 0, column: 0, offset: 0 },
    isProjectLevel: true,
  };
}

export function formatHumanLocation(loc: SourceLocation): string {
  if (loc.isProjectLevel || loc.start.line <= 0) {
    return 'Project-level finding';
  }
  return `Line ${loc.start.line}, column ${loc.start.column}`;
}

export function formatLocationShort(loc: SourceLocation): string {
  if (loc.isProjectLevel || loc.start.line <= 0) {
    return 'Project-level';
  }
  return `${loc.start.line}:${loc.start.column}`;
}

export interface FindingLocation {
  filePath: string;
  range: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
}

/**
 * Normalizes any finding, tree item, or raw input into a safe FindingLocation.
 * Returns undefined if no valid filePath or range could be determined.
 */
export function normalizeFindingLocation(input: any): FindingLocation | undefined {
  if (!input) return undefined;

  // Unnest TreeItem or wrapper objects
  const candidate = input.finding || input.extra?.finding || (Array.isArray(input.issueGroup?.findings) && input.issueGroup.findings[0]) || input;

  let filePath =
    candidate.location?.filePath ||
    candidate.filePath ||
    candidate.file ||
    candidate.fsPath ||
    candidate.uri?.fsPath ||
    (typeof candidate.path === 'string' ? candidate.path : undefined);

  if (typeof filePath !== 'string' || !filePath.trim()) {
    return undefined;
  }

  let startLine = 1;
  let startColumn = 1;
  let endLine = 1;
  let endColumn = 1;

  if (candidate.location && typeof candidate.location.start?.line === 'number') {
    startLine = Math.max(1, candidate.location.start.line);
    startColumn = Math.max(1, candidate.location.start.column || 1);
    endLine = Math.max(startLine, candidate.location.end?.line || startLine);
    endColumn = Math.max(1, candidate.location.end?.column || startColumn);
  } else if (candidate.range) {
    if (typeof candidate.range.startLine === 'number') {
      startLine = Math.max(1, candidate.range.startLine);
      startColumn = Math.max(1, candidate.range.startColumn || 1);
      endLine = Math.max(startLine, candidate.range.endLine || startLine);
      endColumn = Math.max(1, candidate.range.endColumn || startColumn);
    } else if (candidate.range.start && typeof candidate.range.start.line === 'number') {
      // 0-indexed VS Code Range object
      startLine = candidate.range.start.line + 1;
      startColumn = (candidate.range.start.character ?? 0) + 1;
      endLine = (candidate.range.end?.line ?? candidate.range.start.line) + 1;
      endColumn = (candidate.range.end?.character ?? (startColumn - 1)) + 1;
    }
  } else if (typeof candidate.line === 'number') {
    startLine = Math.max(1, candidate.line);
    startColumn = Math.max(1, candidate.column || 1);
    endLine = Math.max(startLine, candidate.endLine || startLine);
    endColumn = Math.max(1, candidate.endColumn || startColumn);
  }

  return {
    filePath,
    range: {
      startLine,
      startColumn,
      endLine,
      endColumn,
    },
  };
}

