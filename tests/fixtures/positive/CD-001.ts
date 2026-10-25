// Positive case for CD-001: Chained type assertions
export function parsePayload(data: unknown) {
  const result = (data as any) as { id: string; name: string };
  const user = data as unknown as { id: number };
  return { result, user };
}
