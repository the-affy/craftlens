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
  };
}
