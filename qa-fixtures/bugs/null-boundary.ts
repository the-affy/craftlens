// Fixture: Unsafe chained boundary property access
export function processFinding(finding: any) {
  // Bug pattern: chained .toUpperCase() on finding.filePath without checking if finding.filePath is defined
  const upper = finding.filePath.toUpperCase();
  return upper;
}

