// Negative case for CD-001: Single type assertion and type guards
export function isUser(data: unknown): data is { id: string } {
  return typeof data === 'object' && data !== null && 'id' in data;
}

export function parsePayload(data: unknown) {
  const user = data as { id: string };
  return user;
}
