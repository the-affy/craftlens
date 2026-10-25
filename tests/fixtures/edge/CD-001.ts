// Edge case: Multiple nested parentheses around assertion
export function parseEdge(val: any) {
  return (((val as any)) as string);
}
